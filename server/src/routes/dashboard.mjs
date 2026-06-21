import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { loadDeliverablesForEngagement } from '../lib/deliverableRows.mjs';

export const dashboardRouter = Router();

function todayIst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

dashboardRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const today = todayIst();

  const [followUps, overdue, campaigns] = await Promise.all([
    pool.query(
      `SELECT e.id, e.next_follow_up_date, c.full_name, cam.campaign_name
       FROM engagements e
       JOIN contacts c ON c.id = e.contact_id
       JOIN campaigns cam ON cam.id = e.campaign_id
       WHERE e.assigned_manager = $1
         AND e.next_follow_up_date IS NOT NULL
         AND e.next_follow_up_date <= $2
         AND e.conversation_status NOT IN ('collaboration_complete', 'dropped_profile_rejected', 'dropped_not_interested', 'dropped_terms_disagreement')
       ORDER BY e.next_follow_up_date
       LIMIT 20`,
      [userId, today],
    ),
    pool.query(
      `SELECT d.id, d.engagement_id, d.due_date, d.deliverable_type, c.full_name, cam.campaign_name
       FROM v_deliverables d
       JOIN engagements e ON e.id = d.engagement_id
       JOIN contacts c ON c.id = e.contact_id
       JOIN campaigns cam ON cam.id = e.campaign_id
       WHERE d.is_overdue = true AND e.assigned_manager = $1
       LIMIT 20`,
      [userId],
    ),
    pool.query(
      `SELECT id, campaign_name, completed_collaborations, target_collaborations,
              achievement_pct, campaign_health
       FROM campaigns
       WHERE status = 'active'
       ORDER BY updated_at DESC
       LIMIT 6`,
    ),
  ]);

  res.json({
    follow_ups_due: followUps.rows,
    overdue_deliverables: overdue.rows,
    active_campaigns: campaigns.rows,
  });
});

/** Full workspace payload for the AM dashboard (engagements + campaigns + deliverables). */
dashboardRouter.get('/workspace', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [engagementsRes, campaignsRes] = await Promise.all([
    pool.query(
      `SELECT e.*, c.full_name AS contact_name, u.full_name AS owner_name,
              cam.campaign_name, cam.status AS campaign_status
       FROM engagements e
       JOIN contacts c ON c.id = e.contact_id
       JOIN users u ON u.id = e.assigned_manager
       JOIN campaigns cam ON cam.id = e.campaign_id
       WHERE e.assigned_manager = $1 AND cam.status <> 'archived'
       ORDER BY e.updated_at DESC`,
      [userId],
    ),
    pool.query(
      `SELECT cam.*, b.brand_name
       FROM campaigns cam
       JOIN brands b ON b.id = cam.brand_id
       WHERE cam.status = 'active'
       ORDER BY cam.updated_at DESC`,
    ),
  ]);

  const engagements = engagementsRes.rows;
  const deliverablesByEngagement = {};

  const client = await pool.connect();
  try {
    for (const eng of engagements) {
      deliverablesByEngagement[eng.id] = await loadDeliverablesForEngagement(client, eng.id);
    }
  } finally {
    client.release();
  }

  res.json({
    engagements,
    campaigns: campaignsRes.rows,
    deliverablesByEngagement,
  });
});
