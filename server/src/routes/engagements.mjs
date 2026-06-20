import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import {
  ACTIVITY_ACTION,
  activityRowToTimelineEntry,
  tryInsertActivityEvent,
  listActivityEventsForCampaign,
  listActivityEventsForEngagement,
} from '../lib/activityEvents.mjs';

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

engagementsRouter.patch('/:id', requireAuth, patchEngagement);
engagementsRouter.patch('/:id/status', requireAuth, patchEngagement);

async function patchEngagement(req, res) {
  const {
    conversation_status,
    interest_level,
    next_follow_up_date,
    visit_date,
    visit_time,
    visit_outlet,
    visit_notes,
    notes,
    primary_collaboration_reason,
  } = req.body;

  try {
    const updated = await withUserTransaction(req.user.id, async (client) => {
      const current = await client.query('SELECT * FROM engagements WHERE id = $1', [req.params.id]);
      if (!current.rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
      const cur = current.rows[0];
      const newStatus = conversation_status ?? cur.conversation_status;

      let followUp = cur.next_follow_up_date;
      if (Object.prototype.hasOwnProperty.call(req.body, 'next_follow_up_date')) {
        followUp = next_follow_up_date;
      } else if (conversation_status && conversation_status !== cur.conversation_status) {
        if (newStatus === 'scheduled' && visit_date) followUp = visit_date;
        if (newStatus?.startsWith('dropped_') || newStatus === 'collaboration_complete') {
          followUp = null;
        }
      }

      const { rows } = await client.query(
        `UPDATE engagements SET
           conversation_status = COALESCE($2, conversation_status),
           interest_level = COALESCE($3, interest_level),
           next_follow_up_date = $4,
           visit_date = COALESCE($5, visit_date),
           visit_time = COALESCE($6, visit_time),
           visit_outlet = COALESCE($7, visit_outlet),
           visit_notes = COALESCE($8, visit_notes),
           notes = COALESCE($9, notes),
           primary_collaboration_reason = COALESCE($10, primary_collaboration_reason)
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          conversation_status ?? null,
          interest_level ?? null,
          followUp,
          visit_date ?? null,
          visit_time ?? null,
          visit_outlet ?? null,
          visit_notes ?? null,
          notes ?? null,
          primary_collaboration_reason ?? null,
        ],
      );

      const updated = rows[0];
      if (updated && conversation_status && conversation_status !== cur.conversation_status) {
        await tryInsertActivityEvent(client, req.user, {
          campaignId: cur.campaign_id,
          engagementId: cur.id,
          action: ACTIVITY_ACTION.STAGE_CHANGED,
          details: {
            fromStage: cur.conversation_status,
            toStage: conversation_status,
            reason: conversation_status.startsWith('dropped_') ? conversation_status : null,
            droppedFrom: updated.dropped_from ?? null,
          },
        });
      }
      return updated;
    });
    res.json(updated);
  } catch (err) {
    const status = err.status ?? (err.code === '23514' || err.code === 'check_violation' ? 422 : 500);
    res.status(status).json({ error: err.message });
  }
}

engagementsRouter.get('/:id/deliverables', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM v_deliverables WHERE engagement_id = $1', [req.params.id]);
  res.json(rows);
});

engagementsRouter.get('/:id/timeline', requireAuth, async (req, res) => {
  const activityRows = await listActivityEventsForEngagement(pool, req.params.id);
  if (activityRows.length > 0) {
    return res.json(activityRows.map(activityRowToTimelineEntry));
  }

  const { rows } = await pool.query(
    `SELECT te.*, u.full_name AS user_name
     FROM timeline_entries te
     LEFT JOIN users u ON u.id = te.user_id
     WHERE te.engagement_id = $1
     ORDER BY te.occurred_at DESC`,
    [req.params.id],
  );
  res.json(rows);
});
