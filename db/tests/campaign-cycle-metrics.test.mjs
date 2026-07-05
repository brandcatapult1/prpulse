/**
 * Per-cycle completion bucketing (IST) + campaign rollup.
 * Run: npm run db:test:campaign-cycle-metrics
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { ensureCampaignCycles } from '../../server/src/lib/campaignCycles.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedCountedEngagement(client, { campaignId, userId, completedAt }) {
  const contact = await client.query(
    `INSERT INTO contacts (full_name, mobile_number, source, created_by)
     VALUES ('Cycle Metric Creator', $1, 'manual_entry', $2) RETURNING id`,
    [`+9199${Math.floor(Math.random() * 1e8)}`, userId],
  );
  const engagement = await client.query(
    `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, conversation_status, created_by)
     VALUES ($1, $2, $3, 'awaiting_final_deliverables', $3) RETURNING id`,
    [contact.rows[0].id, campaignId, userId],
  );
  const engagementId = engagement.rows[0].id;
  await client.query(
    `INSERT INTO deliverables (engagement_id, deliverable_type, quantity, status, content_link)
     VALUES ($1, 'reel', 1, 'posted', 'https://instagram.com/p/cycle-metrics')`,
    [engagementId],
  );
  await client.query(
    `UPDATE engagements
     SET conversation_status = 'collaboration_complete',
         completed_at = $2::timestamptz
     WHERE id = $1`,
    [engagementId, completedAt],
  );
  return engagementId;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL — skipping campaign-cycle-metrics tests');
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_user_id = ''`);

    const user = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('cycle-metrics@test.local', 'Cycle Metrics', 'campaign_manager')
       RETURNING id`,
    );
    const userId = user.rows[0].id;
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);

    const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('Metrics Brand') RETURNING id`);
    const brandId = brand.rows[0].id;

    const monthly = await client.query(
      `INSERT INTO campaigns (
         campaign_name, brand_id, campaign_type, start_date,
         target_collaborations, term_months, status, created_by
       )
       VALUES ('Metrics Monthly', $1, 'monthly', '2025-01-05', 10, 3, 'active', $2)
       RETURNING *`,
      [brandId, userId],
    );
    const monthlyId = monthly.rows[0].id;
    await ensureCampaignCycles(client, monthly.rows[0]);
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [monthlyId]);

    await seedCountedEngagement(client, {
      campaignId: monthlyId,
      userId,
      completedAt: '2025-01-20T10:00:00+05:30',
    });
    await seedCountedEngagement(client, {
      campaignId: monthlyId,
      userId,
      completedAt: '2025-02-10T10:00:00+05:30',
    });
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [monthlyId]);

    const cycles = await client.query(
      `SELECT cycle_number, completed_collaborations, cycle_health
       FROM campaign_cycles WHERE campaign_id = $1 ORDER BY cycle_number`,
      [monthlyId],
    );
    assert(Number(cycles.rows[0].completed_collaborations) === 1, 'cycle 1 should have 1 completion');
    assert(Number(cycles.rows[1].completed_collaborations) === 1, 'cycle 2 should have 1 completion');
    assert(Number(cycles.rows[2].completed_collaborations) === 0, 'cycle 3 should have 0');
    assert(cycles.rows[0].cycle_health === 'red', 'cycle 1 at 10% should be red');

    const counted = await client.query(
      `SELECT count(*)::int AS n FROM engagements e
       WHERE e.campaign_id = $1 AND fn_engagement_counted(e.id)`,
      [monthlyId],
    );
    const sumCycles = cycles.rows.reduce(
      (sum, row) => sum + Number(row.completed_collaborations),
      0,
    );
    assert(sumCycles === counted.rows[0].n, 'cycle totals must equal counted engagements');

    await seedCountedEngagement(client, {
      campaignId: monthlyId,
      userId,
      completedAt: '2025-01-01T10:00:00+05:30',
    });
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [monthlyId]);
    const clamped = await client.query(
      `SELECT cycle_number, completed_collaborations
       FROM campaign_cycles WHERE campaign_id = $1 ORDER BY cycle_number`,
      [monthlyId],
    );
    assert(
      Number(clamped.rows[0].completed_collaborations) === 2,
      'completion before cycle 1 start should clamp into cycle 1',
    );

    await seedCountedEngagement(client, {
      campaignId: monthlyId,
      userId,
      completedAt: '2025-04-10T10:00:00+05:30',
    });
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [monthlyId]);
    const afterLast = await client.query(
      `SELECT cycle_number, completed_collaborations
       FROM campaign_cycles WHERE campaign_id = $1 ORDER BY cycle_number`,
      [monthlyId],
    );
    assert(
      Number(afterLast.rows[2].completed_collaborations) === 1,
      'completion after last cycle end should clamp into last cycle',
    );

    const countedAfter = await client.query(
      `SELECT count(*)::int AS n FROM engagements e
       WHERE e.campaign_id = $1 AND fn_engagement_counted(e.id)`,
      [monthlyId],
    );
    const sumAfter = afterLast.rows.reduce(
      (sum, row) => sum + Number(row.completed_collaborations),
      0,
    );
    assert(
      sumAfter === countedAfter.rows[0].n,
      'clamped cycle totals must still equal counted engagements',
    );

    const project = await client.query(
      `INSERT INTO campaigns (
         campaign_name, brand_id, campaign_type, start_date, end_date,
         target_collaborations, status, created_by
       )
       VALUES ('Metrics Project', $1, 'project', '2025-03-01', '2025-03-31', 5, 'active', $2)
       RETURNING *`,
      [brandId, userId],
    );
    const projectId = project.rows[0].id;
    await ensureCampaignCycles(client, project.rows[0]);
    await seedCountedEngagement(client, {
      campaignId: projectId,
      userId,
      completedAt: '2025-03-15T10:00:00+05:30',
    });
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [projectId]);

    const projectCycle = await client.query(
      `SELECT completed_collaborations, cycle_health FROM campaign_cycles WHERE campaign_id = $1`,
      [projectId],
    );
    const projectCampaign = await client.query(
      `SELECT completed_collaborations, campaign_health FROM campaigns WHERE id = $1`,
      [projectId],
    );
    assert(
      Number(projectCycle.rows[0].completed_collaborations) === 1,
      'project cycle should count the completion',
    );
    assert(
      Number(projectCampaign.rows[0].completed_collaborations) === 1,
      'project campaign rollup should match its sole cycle',
    );
    assert(projectCampaign.rows[0].campaign_health === 'red', 'project health should be red at 20%');

    await client.query('ROLLBACK');
    console.log('campaign-cycle-metrics tests passed');
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
