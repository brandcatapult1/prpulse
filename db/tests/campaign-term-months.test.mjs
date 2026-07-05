/**
 * Admin term_months edits — append/remove trailing cycles safely.
 * Run: npm run db:test:campaign-term-months
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { ensureCampaignCycles, adjustMonthlyCampaignTermMonths } from '../../server/src/lib/campaignCycles.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedCountedEngagement(client, { campaignId, userId, completedAt }) {
  const contact = await client.query(
    `INSERT INTO contacts (full_name, mobile_number, source, created_by)
     VALUES ('Term Months Creator', $1, 'manual_entry', $2) RETURNING id`,
    [`+9198${Math.floor(Math.random() * 1e8)}`, userId],
  );
  const engagement = await client.query(
    `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, conversation_status, created_by)
     VALUES ($1, $2, $3, 'awaiting_final_deliverables', $3) RETURNING id`,
    [contact.rows[0].id, campaignId, userId],
  );
  const engagementId = engagement.rows[0].id;
  await client.query(
    `INSERT INTO deliverables (engagement_id, deliverable_type, quantity, status, content_link)
     VALUES ($1, 'reel', 1, 'posted', 'https://instagram.com/p/term-months')`,
    [engagementId],
  );
  await client.query(
    `UPDATE engagements
     SET conversation_status = 'collaboration_complete', completed_at = $2::timestamptz
     WHERE id = $1`,
    [engagementId, completedAt],
  );
  return engagementId;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL — skipping campaign-term-months tests');
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_user_id = ''`);

    const user = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('term-months@test.local', 'Term Months', 'admin')
       RETURNING id`,
    );
    const userId = user.rows[0].id;
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);

    const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('Term Brand') RETURNING id`);
    const brandId = brand.rows[0].id;

    const campaign = await client.query(
      `INSERT INTO campaigns (
         campaign_name, brand_id, campaign_type, start_date,
         target_collaborations, term_months, status, created_by
       )
       VALUES ('Term Edit', $1, 'monthly', '2025-06-05', 12, 6, 'active', $2)
       RETURNING *`,
      [brandId, userId],
    );
    const row = campaign.rows[0];
    const campaignId = row.id;
    await ensureCampaignCycles(client, row);

    await adjustMonthlyCampaignTermMonths(client, { id: campaignId, ...row }, 8);
    await client.query('UPDATE campaigns SET term_months = 8 WHERE id = $1', [campaignId]);
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [campaignId]);

    const extended = await client.query(
      `SELECT cycle_number, cycle_start, cycle_end, target, completed_collaborations
       FROM campaign_cycles WHERE campaign_id = $1 ORDER BY cycle_number`,
      [campaignId],
    );
    assert(extended.rows.length === 8, `expected 8 cycles, got ${extended.rows.length}`);
    assert(extended.rows[7].cycle_start === '2026-01-05', 'cycle 8 should continue sequence');
    assert(extended.rows[7].cycle_end === '2026-02-05', 'cycle 8 end anchored to start date');
    assert(Number(extended.rows[7].target) === 12, 'new cycle copies per-month target');

    await adjustMonthlyCampaignTermMonths(
      client,
      { id: campaignId, campaign_type: 'monthly', term_months: 8, target_collaborations: 12, start_date: row.start_date },
      6,
    );
    await client.query('UPDATE campaigns SET term_months = 6 WHERE id = $1', [campaignId]);

    const reduced = await client.query(
      `SELECT cycle_number FROM campaign_cycles WHERE campaign_id = $1 ORDER BY cycle_number`,
      [campaignId],
    );
    assert(reduced.rows.length === 6, 'empty trailing cycles should be removed');

    await seedCountedEngagement(client, {
      campaignId,
      userId,
      completedAt: '2025-10-10T10:00:00+05:30',
    });
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [campaignId]);

    let blocked = false;
    try {
      await adjustMonthlyCampaignTermMonths(
        client,
        { id: campaignId, campaign_type: 'monthly', term_months: 6, target_collaborations: 12, start_date: row.start_date },
        4,
      );
    } catch (err) {
      blocked = true;
      assert(err.status === 400, 'blocked reduction should be 400');
      assert(/cycle 5 has 1 completed collaboration/i.test(err.message), err.message);
    }
    assert(blocked, 'should block reducing past a cycle with completions');

    await client.query('ROLLBACK');
    console.log('campaign-term-months tests passed');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
