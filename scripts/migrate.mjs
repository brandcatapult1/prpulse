import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const migrationsDir = path.join(rootDir, 'db', 'migrations');

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Missing DATABASE_URL. Copy .env.example to .env and set your Postgres URL.');
    process.exit(1);
  }
  return url;
}

function pgClientConfig(url) {
  return {
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  };
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         serial PRIMARY KEY,
      name       text UNIQUE NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationPairs() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'));
  return files
    .sort()
    .map((upFile) => ({
      name: upFile.replace(/\.sql$/, ''),
      upPath: path.join(migrationsDir, upFile),
      downPath: path.join(migrationsDir, `${upFile.replace(/\.sql$/, '')}.down.sql`),
    }));
}

async function getApplied(client) {
  const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY id');
  return new Set(rows.map((r) => r.name));
}

export async function migrateUp() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DATABASE_URL not set — skipping migrations');
    return;
  }

  const client = new pg.Client(pgClientConfig(url));
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const pairs = await listMigrationPairs();
    let count = 0;

    for (const migration of pairs) {
      if (applied.has(migration.name)) {
        console.log(`skip  ${migration.name} (already applied)`);
        continue;
      }

      const sql = await readFile(migration.upPath, 'utf8');
      console.log(`apply ${migration.name} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        count += 1;
        console.log(`done  ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    if (count === 0) {
      console.log('Database is up to date.');
    } else {
      console.log(`Applied ${count} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

async function migrateDown() {
  const client = new pg.Client(pgClientConfig(getDatabaseUrl()));
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const pairs = await listMigrationPairs().then((list) => list.reverse());
    const latest = pairs.find((m) => applied.has(m.name));

    if (!latest) {
      console.log('Nothing to roll back.');
      return;
    }

    const sql = await readFile(latest.downPath, 'utf8');
    console.log(`rollback ${latest.name} ...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE name = $1', [latest.name]);
      await client.query('COMMIT');
      console.log(`done  ${latest.name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

async function migrateStatus() {
  const client = new pg.Client(pgClientConfig(getDatabaseUrl()));
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const pairs = await listMigrationPairs();

    for (const migration of pairs) {
      const mark = applied.has(migration.name) ? '✓' : '·';
      console.log(`${mark} ${migration.name}`);
    }
  } finally {
    await client.end();
  }
}

const isCli =
  process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const command = process.argv[2] ?? 'up';

  try {
    if (command === 'up') {
      getDatabaseUrl();
      await migrateUp();
    } else if (command === 'down') await migrateDown();
    else if (command === 'status') await migrateStatus();
    else {
      console.error('Usage: node scripts/migrate.mjs [up|down|status]');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}
