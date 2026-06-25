/**
 * Batch contact actions — status toggle (enum cast) and tag add.
 * Run: npm run db:test:batch
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { batchToggleContactStatus, batchAddTagToContacts } from '../../server/src/lib/contactBatch.mjs';
import { ensureReferenceData } from '../../server/src/lib/referenceData.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL — skipping contact-batch tests');
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const user = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('contact-batch@test.local', 'Batch Tester', 'campaign_manager')
       RETURNING id`,
    );
    const userId = user.rows[0].id;

    const active = await client.query(
      `INSERT INTO contacts (full_name, mobile_number, source, created_by, status)
       VALUES ('Batch Active', '+919811111111', 'manual_entry', $1, 'active')
       RETURNING id`,
      [userId],
    );
    const inactive = await client.query(
      `INSERT INTO contacts (full_name, mobile_number, source, created_by, status)
       VALUES ('Batch Inactive', '+919822222222', 'manual_entry', $1, 'inactive')
       RETURNING id`,
      [userId],
    );
    const archived = await client.query(
      `INSERT INTO contacts (full_name, mobile_number, source, created_by, status)
       VALUES ('Batch Archived', '+919833333333', 'manual_entry', $1, 'archived')
       RETURNING id`,
      [userId],
    );

    const activeId = active.rows[0].id;
    const inactiveId = inactive.rows[0].id;
    const archivedId = archived.rows[0].id;

    // Toggle must run with no enum type error and flip active<->inactive.
    const result = await batchToggleContactStatus(client, [activeId, inactiveId, archivedId]);
    assert(result.updated === 2, `expected 2 updated, got ${result.updated}`);
    assert(result.skipped === 1, `expected 1 skipped (archived), got ${result.skipped}`);

    const { rows } = await client.query(
      `SELECT id, status FROM contacts WHERE id = ANY($1::uuid[])`,
      [[activeId, inactiveId, archivedId]],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    assert(byId[activeId] === 'inactive', 'active should become inactive');
    assert(byId[inactiveId] === 'active', 'inactive should become active');
    assert(byId[archivedId] === 'archived', 'archived must NOT be toggled');

    // Batch tag add is additive + idempotent.
    await ensureReferenceData(client);
    const { rows: tagRows } = await client.query('SELECT id FROM tags LIMIT 1');
    const tagId = tagRows[0].id;

    const first = await batchAddTagToContacts(client, [activeId, inactiveId], tagId, { userId });
    assert(first.tagged === 2, `expected 2 tagged, got ${first.tagged}`);

    const second = await batchAddTagToContacts(client, [activeId, inactiveId], tagId, { userId });
    assert(second.tagged === 0, 'second apply should be idempotent (0 new)');
    assert(second.skipped === 2, 'both should be skipped on re-apply');

    await client.query('ROLLBACK');
    console.log('✓ contact-batch tests passed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ contact-batch tests failed');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
