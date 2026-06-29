import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { deliverableTypeFromDb } from '../lib/deliverableTypes.mjs';

export const reportsRouter = Router();

/**
 * Posted UNIT count for a deliverable row. Postgres returns integer columns as
 * numbers, but coerce defensively. A "Story ×2" posted row counts as 2, not 1.
 * Falls back to quantity for legacy posted rows where posted_quantity is unset.
 */
function postedUnits(deliverable) {
  const posted = Number(deliverable?.posted_quantity);
  if (Number.isFinite(posted) && posted > 0) return posted;
  return Number(deliverable?.quantity) || 1;
}

function parsePeriod(period) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return { start, end, label: new Date(`${start}T12:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) };
}

reportsRouter.get('/campaign/:campaignId', requireAuth, async (req, res) => {
  const period = parsePeriod(req.query.period);
  if (!period) return res.status(400).json({ error: 'period query required (YYYY-MM)' });

  const { rows: campaigns } = await pool.query(
    `SELECT cam.*, b.brand_name
     FROM campaigns cam
     JOIN brands b ON b.id = cam.brand_id
     WHERE cam.id = $1`,
    [req.params.campaignId],
  );
  if (!campaigns[0]) return res.status(404).json({ error: 'Campaign not found' });
  const campaign = campaigns[0];

  const { rows: engagements } = await pool.query(
    `SELECT e.id, e.completed_at, c.full_name AS contact_name
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     WHERE e.campaign_id = $1
       AND e.conversation_status = 'collaboration_complete'
       AND e.completed_at >= $2::date
       AND e.completed_at < $3::date`,
    [req.params.campaignId, period.start, period.end],
  );

  const engagementIds = engagements.map((e) => e.id);
  let deliverables = [];
  if (engagementIds.length) {
    const { rows } = await pool.query(
      `SELECT d.*, c.full_name AS contact_name,
              (SELECT count(*)::int FROM assets a WHERE a.deliverable_id = d.id AND a.asset_type = 'screenshot') AS screenshot_count
       FROM v_deliverables d
       JOIN engagements e ON e.id = d.engagement_id
       JOIN contacts c ON c.id = e.contact_id
       WHERE d.engagement_id = ANY($1::uuid[])
         AND d.status = 'posted'
         AND (
           (d.published_date IS NOT NULL AND d.published_date >= $2::date AND d.published_date < $3::date)
           OR (d.published_date IS NULL AND e.completed_at >= $2::date AND e.completed_at < $3::date)
         )`,
      [engagementIds, period.start, period.end],
    );
    deliverables = rows.map((d) => ({
      ...d,
      deliverable_type: deliverableTypeFromDb(d.deliverable_type),
    }));
  }

  const completedCount = engagements.length;
  const achievementPct = campaign.target_collaborations
    ? Math.round((completedCount / campaign.target_collaborations) * 100)
    : null;

  const byType = {};
  const gallery = [];
  const influencerMap = {};

  for (const eng of engagements) {
    const posted = deliverables.filter((d) => d.engagement_id === eng.id);
    if (posted.length) {
      influencerMap[eng.id] = {
        id: eng.id,
        contact_name: eng.contact_name,
        deliverables: posted.reduce((sum, d) => sum + postedUnits(d), 0),
      };
    }
    for (const d of posted) {
      byType[d.deliverable_type] = (byType[d.deliverable_type] ?? 0) + postedUnits(d);
      if (d.content_link || d.screenshot_count > 0) {
        gallery.push({
          id: d.id,
          contact_name: d.contact_name,
          deliverable_type: d.deliverable_type,
          quantity: d.quantity,
          content_link: d.content_link,
          screenshot_count: d.screenshot_count,
        });
      }
    }
  }

  res.json({
    campaign: {
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      brand_name: campaign.brand_name,
      target_collaborations: campaign.target_collaborations,
    },
    period: period.label,
    periodValue: req.query.period,
    completedCount,
    achievementPct,
    byType,
    gallery,
    influencers: Object.values(influencerMap),
  });
});

/** Distinct reporting periods from completed engagements (YYYY-MM, newest first). */
reportsRouter.get('/periods', requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT to_char(completed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS period
     FROM engagements
     WHERE completed_at IS NOT NULL
     ORDER BY period DESC
     LIMIT 24`,
  );
  res.json(rows.map((r) => r.period).filter(Boolean));
});
