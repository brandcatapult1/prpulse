import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { addDaysIst } from '../lib/constants.mjs';

export const engagementsRouter = Router();

engagementsRouter.get('/campaign/:campaignId', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, c.full_name AS contact_name, u.full_name AS owner_name
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN users u ON u.id = e.assigned_manager
     WHERE e.campaign_id = $1
     ORDER BY e.updated_at DESC`,
    [req.params.campaignId],
  );
  res.json(rows);
});

engagementsRouter.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, c.full_name AS contact_name, cam.campaign_name, b.brand_name,
            u.full_name AS owner_name
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN campaigns cam ON cam.id = e.campaign_id
     JOIN brands b ON b.id = cam.brand_id
     JOIN users u ON u.id = e.assigned_manager
     WHERE e.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Engagement not found' });
  res.json(rows[0]);
});

engagementsRouter.patch('/:id/status', requireAuth, async (req, res) => {
  const { conversation_status, visit_date, visit_time, visit_outlet, visit_notes, primary_collaboration_reason } = req.body;

  try {
    const updated = await withUserTransaction(req.user.id, async (client) => {
      const current = await client.query('SELECT * FROM engagements WHERE id = $1', [req.params.id]);
      if (!current.rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });

      let next_follow_up_date = current.rows[0].next_follow_up_date;
      if (conversation_status === 'in_conversation') next_follow_up_date = addDaysIst(3);
      if (conversation_status === 'no_response') next_follow_up_date = addDaysIst(7);
      if (conversation_status === 'scheduled' && visit_date) next_follow_up_date = visit_date;
      if (conversation_status?.startsWith('dropped_') || conversation_status === 'collaboration_complete') {
        next_follow_up_date = null;
      }

      const { rows } = await client.query(
        `UPDATE engagements SET
           conversation_status = COALESCE($2, conversation_status),
           visit_date = COALESCE($3, visit_date),
           visit_time = COALESCE($4, visit_time),
           visit_outlet = COALESCE($5, visit_outlet),
           visit_notes = COALESCE($6, visit_notes),
           primary_collaboration_reason = COALESCE($7, primary_collaboration_reason),
           next_follow_up_date = $8
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          conversation_status,
          visit_date,
          visit_time,
          visit_outlet,
          visit_notes,
          primary_collaboration_reason,
          next_follow_up_date,
        ],
      );
      return rows[0];
    });
    res.json(updated);
  } catch (err) {
    const status = err.status ?? (err.code === '23514' || err.code === 'check_violation' ? 422 : 500);
    res.status(status).json({ error: err.message });
  }
});

engagementsRouter.get('/:id/deliverables', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM v_deliverables WHERE engagement_id = $1', [req.params.id]);
  res.json(rows);
});

engagementsRouter.get('/:id/timeline', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM timeline_entries WHERE engagement_id = $1 ORDER BY occurred_at DESC`,
    [req.params.id],
  );
  res.json(rows);
});
