/**
 * User admin reporting-line validation.
 * Run: node db/tests/user-admin.test.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { validateReportsTo } from '../../server/src/lib/userAdmin.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectError(fn, messagePart) {
  try {
    await fn();
    throw new Error(`Expected error containing "${messagePart}"`);
  } catch (err) {
    if (err.message.startsWith('Expected error')) throw err;
    assert(
      err.message.includes(messagePart),
      `Expected error containing "${messagePart}", got: ${err.message}`,
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in .env');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES users(id) ON DELETE SET NULL`);

    const admin = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('ua-admin@test.com', 'UA Admin', 'admin')
       RETURNING id`,
    );
    const sm = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('ua-sm@test.com', 'UA SM', 'senior_manager')
       RETURNING id`,
    );
    const cm = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('ua-cm@test.com', 'UA CM', 'campaign_manager')
       RETURNING id`,
    );

    const adminId = admin.rows[0].id;
    const smId = sm.rows[0].id;
    const cmId = cm.rows[0].id;

    await validateReportsTo(client, cmId, smId);
    await validateReportsTo(client, cmId, adminId);

    await expectError(
      () => validateReportsTo(client, cmId, cmId),
      'cannot report to themselves',
    );

    await expectError(
      () => validateReportsTo(client, smId, cmId),
      'Senior Manager or Admin',
    );

    await client.query('UPDATE users SET reports_to = $1 WHERE id = $2', [smId, adminId]);
    await expectError(
      () => validateReportsTo(client, smId, adminId),
      'cycle',
    );

    await client.query('ROLLBACK');
    console.log('user-admin.test.mjs: OK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
