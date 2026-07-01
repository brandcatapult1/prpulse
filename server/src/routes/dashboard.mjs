import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import {
  assertCanViewDashboardFor,
  canListDirectReports,
  listDirectReports,
} from '../lib/dashboardAccess.mjs';
import { loadDashboardWorkspace } from '../lib/dashboardWorkspace.mjs';

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
         AND e.conversation_status NOT IN ('collaboration_complete', 'dropped_profile_rejected', 'dropped_not_interested', 'dropped_terms_disagreement', 'dropped')
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

/** Direct reports for tabbed manager dashboard (Senior Manager / Admin only). */
dashboardRouter.get('/direct-reports', requireAuth, async (req, res) => {
  if (!canListDirectReports(req.user.role)) {
    return res.json([]);
  }
  try {
    const rows = await listDirectReports(pool, req.user.id);
    res.json(rows);
  } catch (err) {
    console.warn('Direct reports list failed:', err.message ?? err);
    res.json([]);
  }
});

/** Full workspace payload for the dashboard — optionally scoped to a team member. */
dashboardRouter.get('/workspace', requireAuth, async (req, res) => {
  const scopeUserId = req.query.scope_user_id?.trim() || null;

  try {
    const allowedScopeId = await assertCanViewDashboardFor(pool, req.user, scopeUserId);
    const payload = await loadDashboardWorkspace(
      pool,
      scopeUserId ? allowedScopeId : null,
      req.user.id,
      req.user.role,
    );
    res.json(payload);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not load dashboard' });
  }
});
