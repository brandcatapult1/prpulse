import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim() || null;

export function isDatabaseConfigured() {
  return Boolean(databaseUrl);
}

/** Null when DATABASE_URL is unset — never defaults to localhost. */
export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null;

export async function withUserTransaction(userId, fn) {
  if (!pool) {
    throw Object.assign(new Error('Database not configured'), { status: 503 });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (userId) {
      await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
