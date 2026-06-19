import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

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
      `SELECT d.id, d.due_date, d.deliverable_type, c.full_name, cam.campaign_name
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
