import { todayIst } from './constants.mjs';

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function mapCycleRow(row) {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    cycle_number: Number(row.cycle_number),
    cycle_start: toIsoDate(row.cycle_start),
    cycle_end: toIsoDate(row.cycle_end),
    target: Number(row.target),
    completed_collaborations: Number(row.completed_collaborations ?? 0),
    remaining_collaborations:
      row.remaining_collaborations != null ? Number(row.remaining_collaborations) : null,
    achievement_pct: row.achievement_pct != null ? Number(row.achievement_pct) : null,
    cycle_health: row.cycle_health ?? 'not_set',
  };
}

export function pickCurrentCycle(cycles, todayIso = todayIst()) {
  if (!cycles?.length) return null;

  const sorted = [...cycles].sort((a, b) => a.cycle_number - b.cycle_number);
  const today = todayIso;

  for (const cycle of sorted) {
    if (today >= cycle.cycle_start && today < cycle.cycle_end) {
      return cycle;
    }
  }

  if (today < sorted[0].cycle_start) return sorted[0];
  return sorted[sorted.length - 1];
}

export async function listCampaignCycles(client, campaignId) {
  const { rows } = await client.query(
    `SELECT id, campaign_id, cycle_number, cycle_start, cycle_end, target,
            completed_collaborations, remaining_collaborations, achievement_pct, cycle_health
     FROM campaign_cycles
     WHERE campaign_id = $1
     ORDER BY cycle_number`,
    [campaignId],
  );
  return rows.map(mapCycleRow);
}

async function insertMonthlyCycleRow(client, campaignId, cycleNumber, startIso, target) {
  return client.query(
    `INSERT INTO campaign_cycles (campaign_id, cycle_number, cycle_start, cycle_end, target)
     VALUES (
       $1::uuid,
       $2::integer,
       ($3::date + make_interval(months => $5::integer) - interval '1 month')::date,
       ($3::date + make_interval(months => $5::integer))::date,
       $4::integer
     )
     ON CONFLICT (campaign_id, cycle_number) DO NOTHING`,
    [campaignId, cycleNumber, startIso, target, cycleNumber],
  );
}

/**
 * Add or remove trailing monthly cycles when term_months changes.
 * Decrease is blocked if any removed cycle has completed_collaborations > 0.
 */
export async function adjustMonthlyCampaignTermMonths(client, campaign, newTermMonths) {
  const campaignId = campaign.id;
  const currentTermMonths = Number(campaign.term_months);
  const nextTermMonths = Number(newTermMonths);

  if (!Number.isInteger(nextTermMonths) || nextTermMonths < 1) {
    throw Object.assign(new Error('term_months must be a positive integer'), { status: 400 });
  }

  if (campaign.campaign_type !== 'monthly') {
    throw Object.assign(new Error('term_months applies only to monthly recurring campaigns'), {
      status: 400,
    });
  }

  if (nextTermMonths === currentTermMonths) {
    return false;
  }

  if (nextTermMonths < currentTermMonths) {
    const { rows: blocked } = await client.query(
      `SELECT cycle_number, completed_collaborations
       FROM campaign_cycles
       WHERE campaign_id = $1::uuid
         AND cycle_number > $2::integer
         AND completed_collaborations > 0
       ORDER BY cycle_number`,
      [campaignId, nextTermMonths],
    );

    if (blocked.length > 0) {
      const detail = blocked
        .map((row) => {
          const n = Number(row.completed_collaborations);
          const label = n === 1 ? 'collaboration' : 'collaborations';
          return `cycle ${Number(row.cycle_number)} has ${n} completed ${label}`;
        })
        .join('; ');
      throw Object.assign(
        new Error(
          `Cannot reduce to ${nextTermMonths} months — ${detail}. Reassign or complete differently before shortening the term.`,
        ),
        { status: 400 },
      );
    }

    await client.query(
      `DELETE FROM campaign_cycles
       WHERE campaign_id = $1::uuid AND cycle_number > $2::integer`,
      [campaignId, nextTermMonths],
    );
    return true;
  }

  const target = Number(campaign.target_collaborations);
  const startIso = toIsoDate(campaign.start_date);
  if (!startIso || !Number.isFinite(target)) {
    throw Object.assign(
      new Error('Campaign must have a start date and target before extending the term'),
      { status: 400 },
    );
  }

  await ensureCampaignCycles(client, {
    id: campaignId,
    campaign_type: 'monthly',
    start_date: campaign.start_date,
    term_months: currentTermMonths,
    target_collaborations: target,
  });

  for (let cycleNumber = currentTermMonths + 1; cycleNumber <= nextTermMonths; cycleNumber += 1) {
    await insertMonthlyCycleRow(client, campaignId, cycleNumber, startIso, target);
  }

  return true;
}

export async function ensureCampaignCycles(client, campaign) {
  const {
    id,
    campaign_type,
    start_date,
    end_date,
    term_months,
    target_collaborations,
  } = campaign;

  if (!start_date || target_collaborations == null) return false;

  const target = Number(target_collaborations);
  const startIso = toIsoDate(start_date);
  let materialized = false;

  if (campaign_type === 'project') {
    if (!end_date) return false;
    const endIso = toIsoDate(end_date);
    const result = await client.query(
      `INSERT INTO campaign_cycles (campaign_id, cycle_number, cycle_start, cycle_end, target)
       VALUES ($1::uuid, 1, $2::date, ($3::date + 1), $4::integer)
       ON CONFLICT (campaign_id, cycle_number) DO NOTHING`,
      [id, startIso, endIso, target],
    );
    return result.rowCount > 0;
  }

  if (campaign_type !== 'monthly') return false;

  const months = Number(term_months);
  if (!Number.isInteger(months) || months < 1) return false;

  for (let cycleNumber = 1; cycleNumber <= months; cycleNumber += 1) {
    const result = await insertMonthlyCycleRow(client, id, cycleNumber, startIso, target);
    if (result.rowCount > 0) materialized = true;
  }

  return materialized;
}
