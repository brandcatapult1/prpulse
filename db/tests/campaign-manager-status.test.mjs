/**
 * Status changes must not be blocked by an already-assigned manager who has
 * since been deactivated; newly added managers are still validated.
 * Run: node db/tests/campaign-manager-status.test.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { applyCampaignPatch } from '../../server/src/lib/campaignDetail.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rejects(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL — skipping campaign-manager-status tests');
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_user_id = ''`);

    const mk = async (email, name, role, active = true) => (await client.query(
      `INSERT INTO users (email, full_name, role, is_active) VALUES ($1, $2, $3, $4) RETURNING id, role`,
      [email, name, role, active],
    )).rows[0];

    const admin = await mk('cms-admin@test.local', 'Admin', 'admin');
    const stale = await mk('cms-stale@test.local', 'Stale Manager', 'campaign_manager');
    const ok = await mk('cms-ok@test.local', 'Active Manager', 'campaign_manager');
    const inactive = await mk('cms-inactive@test.local', 'Inactive Candidate', 'campaign_manager', false);
    await client.query(`SET LOCAL app.current_user_id = '${admin.id}'`);

    const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('CMS Brand') RETURNING id`);
    const campaign = await client.query(
      `INSERT INTO campaigns (campaign_name, brand_id, status, created_by)
       VALUES ('CMS Campaign', $1, 'active', $2) RETURNING id`,
      [brand.rows[0].id, admin.id],
    );
    const cid = campaign.rows[0].id;
    for (const u of [stale, ok]) {
      await client.query('INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2)', [cid, u.id]);
    }
    await client.query('UPDATE users SET is_active = false WHERE id = $1', [stale.id]);

    const keep = [stale.id, ok.id];
    for (const status of ['completed', 'archived']) {
      const saved = await applyCampaignPatch(client, cid, { status, manager_ids: keep }, admin);
      assert(saved.status === status, `status should become ${status}`);
    }

    const err = await rejects(() =>
      applyCampaignPatch(client, cid, { manager_ids: [...keep, inactive.id] }, admin));
    assert(err && /invalid/.test(err.message), 'adding an inactive manager must still be rejected');

    const after = await applyCampaignPatch(client, cid, { manager_ids: [ok.id] }, admin);
    const left = await client.query('SELECT user_id FROM campaign_managers WHERE campaign_id = $1', [cid]);
    assert(left.rows.length === 1 && left.rows[0].user_id === ok.id, 'removing a stale manager should work');
    assert(after, 'patch returns campaign');

    console.log('campaign-manager-status tests passed');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
