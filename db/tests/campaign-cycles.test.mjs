/**
 * Campaign cycle materialization + current-cycle selection (IST).
 * Run: npm run db:test:campaign-cycles
 */
import pg from 'pg';
import dotenv from 'dotenv';
import {
  ensureCampaignCycles,
  listCampaignCycles,
  pickCurrentCycle,
} from '../../server/src/lib/campaignCycles.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL — skipping campaign-cycles tests');
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_user_id = ''`);

    const user = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('campaign-cycles@test.local', 'Cycle Tester', 'campaign_manager')
       RETURNING id`,
    );
    const userId = user.rows[0].id;
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);

    const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('Cycle Brand') RETURNING id`);
    const brandId = brand.rows[0].id;

    const monthly = await client.query(
      `INSERT INTO campaigns (
         campaign_name, brand_id, campaign_type, start_date,
         target_collaborations, term_months, status, created_by
       )
       VALUES ('Monthly Cycles', $1, 'monthly', '2025-07-05', 10, 6, 'active', $2)
       RETURNING *`,
      [brandId, userId],
    );
    const monthlyCampaign = monthly.rows[0];

    await ensureCampaignCycles(client, monthlyCampaign);
    const cycles = await listCampaignCycles(client, monthlyCampaign.id);

    assert(cycles.length === 6, `expected 6 cycles, got ${cycles.length}`);
    assert(cycles[0].cycle_number === 1, 'cycle_number must be numeric 1');
    assert(cycles[0].cycle_start === '2025-07-05', `cycle 1 start: ${cycles[0].cycle_start}`);
    assert(cycles[0].cycle_end === '2025-08-05', `cycle 1 end: ${cycles[0].cycle_end}`);
    assert(cycles[1].cycle_start === '2025-08-05', `cycle 2 start: ${cycles[1].cycle_start}`);
    assert(cycles[1].cycle_end === '2025-09-05', `cycle 2 end: ${cycles[1].cycle_end}`);
    assert(cycles[0].target === 10, 'target copied from campaign');

    const onCycle2 = pickCurrentCycle(cycles, '2025-08-10');
    assert(onCycle2.cycle_number === 2, 'IST window should be cycle 2 on 10 Aug');

    const beforeStart = pickCurrentCycle(cycles, '2025-07-01');
    assert(beforeStart.cycle_number === 1, 'before cycle 1 → cycle 1');

    const afterEnd = pickCurrentCycle(cycles, '2026-02-01');
    assert(afterEnd.cycle_number === 6, 'after last cycle → last cycle');

    await ensureCampaignCycles(client, monthlyCampaign);
    const cyclesAgain = await listCampaignCycles(client, monthlyCampaign.id);
    assert(cyclesAgain.length === 6, 'second materialize must not duplicate');

    const project = await client.query(
      `INSERT INTO campaigns (
         campaign_name, brand_id, campaign_type, start_date, end_date,
         target_collaborations, status, created_by
       )
       VALUES ('Project Cycle', $1, 'project', '2025-03-01', '2025-03-31', 5, 'active', $2)
       RETURNING *`,
      [brandId, userId],
    );
    const projectCampaign = project.rows[0];

    await ensureCampaignCycles(client, projectCampaign);
    const projectCycles = await listCampaignCycles(client, projectCampaign.id);

    assert(projectCycles.length === 1, 'project gets one cycle');
    assert(projectCycles[0].cycle_start === '2025-03-01', 'project cycle start');
    assert(projectCycles[0].cycle_end === '2025-04-01', 'project cycle end exclusive');
    assert(
      pickCurrentCycle(projectCycles, '2025-03-15').cycle_number === 1,
      'mid-project day is in the single cycle',
    );

    await client.query('ROLLBACK');
    console.log('campaign-cycles tests passed');
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
