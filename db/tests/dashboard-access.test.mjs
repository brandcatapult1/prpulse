/**
 * Dashboard workspace access control.
 * Run: node db/tests/dashboard-access.test.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import {
  assertCanViewDashboardFor,
  listDirectReports,
} from '../../server/src/lib/dashboardAccess.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectForbidden(fn) {
  try {
    await fn();
    throw new Error('Expected 403');
  } catch (err) {
    if (err.message === 'Expected 403') throw err;
    assert(err.status === 403, `Expected 403, got ${err.status}: ${err.message}`);
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

    const sm = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('dash-sm@test.com', 'Dash SM', 'senior_manager')
       RETURNING id, full_name, role`,
    );
    const cm = await client.query(
      `INSERT INTO users (email, full_name, role, reports_to)
       VALUES ('dash-cm@test.com', 'Dash CM', 'campaign_manager', $1)
       RETURNING id, full_name, role`,
      [sm.rows[0].id],
    );
    const other = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('dash-other@test.com', 'Dash Other', 'campaign_manager')
       RETURNING id`,
    );
    const admin = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('dash-admin@test.com', 'Dash Admin', 'admin')
       RETURNING id, full_name, role`,
    );

    const smUser = { id: sm.rows[0].id, role: 'senior_manager', full_name: 'Dash SM' };
    const cmUser = { id: cm.rows[0].id, role: 'campaign_manager', full_name: 'Dash CM' };
    const adminUser = { id: admin.rows[0].id, role: 'admin', full_name: 'Dash Admin' };

    const reports = await listDirectReports(client, sm.rows[0].id);
    assert(reports.length === 1 && reports[0].id === cm.rows[0].id, 'direct reports list');

    await assertCanViewDashboardFor(client, smUser, sm.rows[0].id);
    await assertCanViewDashboardFor(client, smUser, cm.rows[0].id);

    await expectForbidden(() =>
      assertCanViewDashboardFor(client, smUser, other.rows[0].id),
    );

    await assertCanViewDashboardFor(client, adminUser, other.rows[0].id);

    await client.query('ROLLBACK');
    console.log('dashboard-access.test.mjs: OK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
