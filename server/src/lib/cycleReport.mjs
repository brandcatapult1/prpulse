import { deliverableTypeFromDb } from './deliverableTypes.mjs';
import {
  buildDeliverableProofItems,
  deliverableAwaitedUnits,
} from './deliverableProof.mjs';
import { mapCycleRow, pickCurrentCycle } from './campaignCycles.mjs';
import { todayIst } from './constants.mjs';

const CYCLE_BOUNDS_JOIN = `
  CROSS JOIN (
    SELECT min(cycle_start) AS first_start,
           max(cycle_end) AS last_end,
           min(cycle_number) AS first_num,
           max(cycle_number) AS last_num
    FROM campaign_cycles
    WHERE campaign_id = cc.campaign_id
  ) bounds
`;

const ENGAGEMENT_IN_CYCLE_SQL = `
  fn_engagement_counted(e.id)
  AND e.completed_at IS NOT NULL
  AND (
    (
      (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= cc.cycle_start
      AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date < cc.cycle_end
    )
    OR (
      cc.cycle_number = bounds.first_num
      AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date < bounds.first_start
    )
    OR (
      cc.cycle_number = bounds.last_num
      AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= bounds.last_end
    )
  )
`;

export async function loadCampaignCyclesForReport(client, campaignId) {
  const { rows } = await client.query(
    `SELECT id, campaign_id, cycle_number, cycle_start, cycle_end, target,
            completed_collaborations, remaining_collaborations, achievement_pct, cycle_health
     FROM campaign_cycles
     WHERE campaign_id = $1::uuid
     ORDER BY cycle_number`,
    [campaignId],
  );
  const cycles = rows.map(mapCycleRow);
  const current_cycle = pickCurrentCycle(cycles, todayIst());
  return { cycles, current_cycle };
}

export async function loadCycleReport(client, cycleId) {
  const { rows: cycleRows } = await client.query(
    `SELECT cc.*, cam.campaign_name, cam.campaign_type, cam.term_months, cam.brand_id, b.brand_name
     FROM campaign_cycles cc
     JOIN campaigns cam ON cam.id = cc.campaign_id
     JOIN brands b ON b.id = cam.brand_id
     WHERE cc.id = $1::uuid`,
    [cycleId],
  );
  const cycleRow = cycleRows[0];
  if (!cycleRow) return null;

  const cycle = mapCycleRow(cycleRow);
  const campaignId = cycleRow.campaign_id;

  const completedCountResult = await client.query(
    `SELECT count(*)::int AS n
     FROM engagements e
     CROSS JOIN campaign_cycles cc
     ${CYCLE_BOUNDS_JOIN}
     WHERE cc.id = $1::uuid
       AND e.campaign_id = cc.campaign_id
       AND ${ENGAGEMENT_IN_CYCLE_SQL}`,
    [cycleId],
  );
  const collaborationsComplete = Number(completedCountResult.rows[0]?.n ?? 0);

  const visitsResult = await client.query(
    `SELECT count(*)::int AS n
     FROM engagements e
     WHERE e.campaign_id = $1::uuid
       AND e.visit_completed_date IS NOT NULL
       AND e.visit_completed_date >= $2::date
       AND e.visit_completed_date < $3::date`,
    [campaignId, cycle.cycle_start, cycle.cycle_end],
  );
  const visitsCompleted = Number(visitsResult.rows[0]?.n ?? 0);

  const { rows: deliverableRows } = await client.query(
    `SELECT d.id, d.engagement_id, d.deliverable_type, d.quantity, d.posted_quantity,
            d.unit_proofs, d.due_date, d.status, d.content_link
     FROM deliverables d
     JOIN engagements e ON e.id = d.engagement_id
     WHERE e.campaign_id = $1::uuid
       AND d.due_date IS NOT NULL
       AND d.due_date >= $2::date
       AND d.due_date < $3::date`,
    [campaignId, cycle.cycle_start, cycle.cycle_end],
  );

  let deliverablesAwaited = 0;
  for (const row of deliverableRows) {
    deliverablesAwaited += deliverableAwaitedUnits({
      ...row,
      quantity: Number(row.quantity),
      posted_quantity: Number(row.posted_quantity ?? 0),
      unit_proofs: Array.isArray(row.unit_proofs) ? row.unit_proofs : [],
    });
  }

  const { rows: engagementRows } = await client.query(
    `SELECT e.id, e.contact_id, c.full_name AS contact_name,
            (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date AS completed_at_ist
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     CROSS JOIN campaign_cycles cc
     ${CYCLE_BOUNDS_JOIN}
     WHERE cc.id = $1::uuid
       AND e.campaign_id = cc.campaign_id
       AND ${ENGAGEMENT_IN_CYCLE_SQL}
     ORDER BY e.completed_at, c.full_name`,
    [cycleId],
  );

  const engagementIds = engagementRows.map((r) => r.id);
  let collaborations = [];

  if (engagementIds.length) {
    const { rows: dels } = await client.query(
      `SELECT d.id, d.engagement_id, d.deliverable_type, d.quantity, d.posted_quantity,
              d.unit_proofs, d.status, d.content_link
       FROM deliverables d
       WHERE d.engagement_id = ANY($1::uuid[])`,
      [engagementIds],
    );

    const deliverableIds = dels.map((d) => d.id);
    const screenshotsById = new Map();
    if (deliverableIds.length) {
      const { rows: assets } = await client.query(
        `SELECT id, deliverable_id, label, url, file_path
         FROM assets
         WHERE deliverable_id = ANY($1::uuid[]) AND asset_type = 'screenshot'
         ORDER BY created_at`,
        [deliverableIds],
      );
      for (const asset of assets) {
        const list = screenshotsById.get(asset.deliverable_id) ?? [];
        list.push({
          id: asset.id,
          label: asset.label ?? 'Screenshot',
          url: asset.url ?? asset.file_path ?? null,
        });
        screenshotsById.set(asset.deliverable_id, list);
      }
    }

    const deliverablesByEngagement = new Map();
    for (const row of dels) {
      const mapped = {
        id: row.id,
        engagement_id: row.engagement_id,
        deliverable_type: deliverableTypeFromDb(row.deliverable_type),
        quantity: Number(row.quantity),
        posted_quantity: Number(row.posted_quantity ?? 0),
        unit_proofs: Array.isArray(row.unit_proofs) ? row.unit_proofs : [],
        status: row.status,
        content_link: row.content_link,
        screenshots: screenshotsById.get(row.id) ?? [],
      };
      const list = deliverablesByEngagement.get(row.engagement_id) ?? [];
      list.push(mapped);
      deliverablesByEngagement.set(row.engagement_id, list);
    }

    collaborations = engagementRows.map((eng) => ({
      id: eng.id,
      contact_id: eng.contact_id,
      contact_name: eng.contact_name,
      completed_at_ist: eng.completed_at_ist,
      proof: buildDeliverableProofItems(deliverablesByEngagement.get(eng.id) ?? []),
    }));
  }

  const target = Number(cycle.target);
  const storedCompleted = Number(cycle.completed_collaborations);
  const achievementPct =
    cycle.achievement_pct != null ? Number(cycle.achievement_pct) : null;

  return {
    brand: {
      id: cycleRow.brand_id,
      brand_name: cycleRow.brand_name,
    },
    campaign: {
      id: campaignId,
      campaign_name: cycleRow.campaign_name,
      campaign_type: cycleRow.campaign_type,
      term_months: cycleRow.term_months != null ? Number(cycleRow.term_months) : null,
    },
    cycle,
    hero: {
      completed_collaborations: storedCompleted,
      target,
      remaining_collaborations:
        cycle.remaining_collaborations != null ? Number(cycle.remaining_collaborations) : null,
      achievement_pct: achievementPct,
      cycle_health: cycle.cycle_health,
    },
    stats: {
      collaborations_complete: collaborationsComplete,
      deliverables_awaited: deliverablesAwaited,
      visits_completed: visitsCompleted,
    },
    collaborations,
  };
}
