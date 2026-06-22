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
import {
  deliverableInsertFields,
  loadDeliverablesForEngagement,
  loadScreenshotsForDeliverables,
  mapDeliverableRow,
  syncDeliverableScreenshots,
} from '../lib/deliverableRows.mjs';
import {
  recordDeliverablePostedActivity,
  recordEngagementPatchActivity,
  recordFeedbackActivity,
} from '../lib/engagementActivity.mjs';

export const engagementsRouter = Router();

/** Contact fields joined onto engagement rows for board/drawer identity (no separate contacts fetch). */
const ENGAGEMENT_CONTACT_COLS = `
  c.full_name AS contact_name,
  c.mobile_number AS contact_mobile_number,
  c.email AS contact_email,
  c.instagram_url AS contact_instagram_url,
  c.youtube_url AS contact_youtube_url,
  c.city AS contact_city`;

const ENGAGEMENT_PATCH_FIELDS = [
  'conversation_status',
  'interest_level',
  'next_follow_up_date',
  'initial_contact_date',
  'last_contact_date',
  'visit_date',
  'visit_time',
  'visit_outlet',
  'visit_notes',
  'visit_completed_date',
  'notes',
  'agreed_fee',
  'collaboration_type',
  'primary_collaboration_reason',
  'secondary_collaboration_reason',
  'dropped_from',
  'no_reply_count',
  'last_contact_log_type',
];

engagementsRouter.get('/campaign/:campaignId', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, ${ENGAGEMENT_CONTACT_COLS}, u.full_name AS owner_name,
            cam.campaign_name
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN users u ON u.id = e.assigned_manager
     JOIN campaigns cam ON cam.id = e.campaign_id
     WHERE e.campaign_id = $1
     ORDER BY e.updated_at DESC`,
    [req.params.campaignId],
  );
  res.json(rows);
});

/** Engagements assigned to the current user (dashboard workspace). */
engagementsRouter.get('/assigned/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, c.full_name AS contact_name, u.full_name AS owner_name,
            cam.campaign_name, cam.status AS campaign_status
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN users u ON u.id = e.assigned_manager
     JOIN campaigns cam ON cam.id = e.campaign_id
     WHERE e.assigned_manager = $1 AND cam.status <> 'archived'
     ORDER BY e.updated_at DESC`,
    [req.user.id],
  );
  res.json(rows);
});

engagementsRouter.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, ${ENGAGEMENT_CONTACT_COLS}, cam.campaign_name, b.brand_name,
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
  try {
    const updated = await withUserTransaction(req.user.id, async (client) => {
      const current = await client.query('SELECT * FROM engagements WHERE id = $1', [req.params.id]);
      if (!current.rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
      const cur = current.rows[0];

      const patch = {};
      for (const key of ENGAGEMENT_PATCH_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          patch[key] = req.body[key];
        }
      }

      const newStatus = patch.conversation_status ?? cur.conversation_status;
      let followUp = cur.next_follow_up_date;
      if (Object.prototype.hasOwnProperty.call(req.body, 'next_follow_up_date')) {
        followUp = patch.next_follow_up_date;
      } else if (patch.conversation_status && patch.conversation_status !== cur.conversation_status) {
        if (newStatus === 'scheduled' && (patch.visit_date ?? cur.visit_date)) {
          followUp = patch.visit_date ?? cur.visit_date;
        }
        if (newStatus?.startsWith('dropped_') || newStatus === 'collaboration_complete') {
          followUp = null;
        }
      }

      const sets = [];
      const params = [req.params.id];
      let idx = 2;

      for (const key of ENGAGEMENT_PATCH_FIELDS) {
        if (key === 'next_follow_up_date') continue;
        if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
        sets.push(`${key} = $${idx}`);
        params.push(patch[key]);
        idx += 1;
      }

      const followUpExplicit = Object.prototype.hasOwnProperty.call(req.body, 'next_follow_up_date');
      const statusChanged =
        patch.conversation_status && patch.conversation_status !== cur.conversation_status;
      if (followUpExplicit || (statusChanged && followUp !== cur.next_follow_up_date)) {
        sets.push(`next_follow_up_date = $${idx}`);
        params.push(followUp);
        idx += 1;
      }

      if (patch.conversation_status && patch.conversation_status !== cur.conversation_status) {
        sets.push('last_status_change_at = now()');
      }

      if (sets.length === 0) return cur;

      const { rows } = await client.query(
        `UPDATE engagements SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        params,
      );

      const updated = rows[0];
      await recordEngagementPatchActivity(client, req.user, cur, updated, patch);
      return updated;
    });
    res.json(updated);
  } catch (err) {
    const status = err.status ?? (err.code === '23514' || err.code === 'check_violation' ? 422 : 500);
    res.status(status).json({ error: err.message });
  }
}

engagementsRouter.get('/:id/deliverables', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const list = await loadDeliverablesForEngagement(client, req.params.id);
    res.json(list);
  } finally {
    client.release();
  }
});

engagementsRouter.post('/:id/deliverables', requireAuth, async (req, res) => {
  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      const eng = await client.query('SELECT id, campaign_id FROM engagements WHERE id = $1', [req.params.id]);
      if (!eng.rows[0]) throw Object.assign(new Error('Engagement not found'), { status: 404 });

      const fields = deliverableInsertFields(req.body);
      const { rows } = await client.query(
        `INSERT INTO deliverables (
           engagement_id, deliverable_type, quantity, posted_quantity, unit_proofs,
           due_date, status, published_date, content_link,
           brief_compliance, brand_tag_verified, internal_rating
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          req.params.id,
          fields.deliverable_type,
          fields.quantity,
          fields.posted_quantity,
          JSON.stringify(fields.unit_proofs),
          fields.due_date,
          fields.status,
          fields.published_date,
          fields.content_link,
          fields.brief_compliance,
          fields.brand_tag_verified,
          fields.internal_rating,
        ],
      );
      const inserted = rows[0];
      if (req.body.screenshots?.length) {
        await syncDeliverableScreenshots(client, inserted.id, req.body.screenshots, req.user.id);
      }
      const screenshotsById = await loadScreenshotsForDeliverables(client, [inserted.id]);
      return mapDeliverableRow(inserted, screenshotsById.get(inserted.id) ?? []);
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

engagementsRouter.patch('/:engagementId/deliverables/:deliverableId', requireAuth, async (req, res) => {
  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      const cur = await client.query(
        `SELECT d.*, e.campaign_id FROM deliverables d
         JOIN engagements e ON e.id = d.engagement_id
         WHERE d.id = $1 AND d.engagement_id = $2`,
        [req.params.deliverableId, req.params.engagementId],
      );
      if (!cur.rows[0]) throw Object.assign(new Error('Deliverable not found'), { status: 404 });
      const before = cur.rows[0];

      const fields = deliverableInsertFields({ ...before, ...req.body });
      const { rows } = await client.query(
        `UPDATE deliverables SET
           deliverable_type = $3,
           quantity = $4,
           posted_quantity = $5,
           unit_proofs = $6,
           due_date = $7,
           status = $8,
           published_date = $9,
           content_link = $10,
           brief_compliance = $11,
           brand_tag_verified = $12,
           internal_rating = $13,
           updated_at = now()
         WHERE id = $1 AND engagement_id = $2
         RETURNING *`,
        [
          req.params.deliverableId,
          req.params.engagementId,
          fields.deliverable_type,
          fields.quantity,
          fields.posted_quantity,
          JSON.stringify(fields.unit_proofs),
          fields.due_date,
          fields.status,
          fields.published_date,
          fields.content_link,
          fields.brief_compliance,
          fields.brand_tag_verified,
          fields.internal_rating,
        ],
      );

      if (Object.prototype.hasOwnProperty.call(req.body, 'screenshots')) {
        await syncDeliverableScreenshots(
          client,
          req.params.deliverableId,
          req.body.screenshots,
          req.user.id,
        );
      }

      const [mapped] = await loadDeliverablesForEngagement(client, req.params.engagementId);
      const updated = (await loadDeliverablesForEngagement(client, req.params.engagementId))
        .find((d) => d.id === req.params.deliverableId);

      if (before.status !== 'posted' && rows[0].status === 'posted') {
        await recordDeliverablePostedActivity(client, req.user, {
          campaignId: before.campaign_id,
          engagementId: req.params.engagementId,
          deliverable: updated ?? mapDeliverableRow(rows[0], req.body.screenshots ?? []),
        });
      }

      return updated ?? mapDeliverableRow(rows[0], []);
    });
    res.json(row);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

engagementsRouter.delete('/:engagementId/deliverables/:deliverableId', requireAuth, async (req, res) => {
  try {
    await withUserTransaction(req.user.id, async (client) => {
      const { rowCount } = await client.query(
        'DELETE FROM deliverables WHERE id = $1 AND engagement_id = $2',
        [req.params.deliverableId, req.params.engagementId],
      );
      if (rowCount === 0) throw Object.assign(new Error('Deliverable not found'), { status: 404 });
    });
    res.status(204).end();
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

engagementsRouter.get('/:id/feedback', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM feedback WHERE engagement_id = $1', [req.params.id]);
  res.json(rows[0] ?? null);
});

engagementsRouter.put('/:id/feedback', requireAuth, async (req, res) => {
  const {
    content_quality,
    professionalism,
    timeliness,
    adherence_to_terms,
    would_work_again,
    internal_notes,
  } = req.body ?? {};

  if (!content_quality || !professionalism || !timeliness) {
    return res.status(400).json({ error: 'All three ratings are required' });
  }

  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      const eng = await client.query('SELECT id, campaign_id FROM engagements WHERE id = $1', [req.params.id]);
      if (!eng.rows[0]) throw Object.assign(new Error('Engagement not found'), { status: 404 });

      const { rows } = await client.query(
        `INSERT INTO feedback (
           engagement_id, content_quality, professionalism, timeliness,
           adherence_to_terms, would_work_again, internal_notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (engagement_id) DO UPDATE SET
           content_quality = EXCLUDED.content_quality,
           professionalism = EXCLUDED.professionalism,
           timeliness = EXCLUDED.timeliness,
           adherence_to_terms = EXCLUDED.adherence_to_terms,
           would_work_again = EXCLUDED.would_work_again,
           internal_notes = EXCLUDED.internal_notes,
           updated_at = now()
         RETURNING *`,
        [
          req.params.id,
          content_quality,
          professionalism,
          timeliness,
          adherence_to_terms ?? true,
          would_work_again ?? true,
          internal_notes ?? null,
          req.user.id,
        ],
      );

      await recordFeedbackActivity(client, req.user, {
        campaignId: eng.rows[0].campaign_id,
        engagementId: req.params.id,
        feedback: rows[0],
      });

      return rows[0];
    });
    res.json(row);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
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

/** Log visit reminder (WhatsApp opened — client-side action). */
engagementsRouter.post('/:id/visit-reminder', requireAuth, async (req, res) => {
  try {
    await withUserTransaction(req.user.id, async (client) => {
      const eng = await client.query('SELECT id, campaign_id FROM engagements WHERE id = $1', [req.params.id]);
      if (!eng.rows[0]) throw Object.assign(new Error('Engagement not found'), { status: 404 });
      await tryInsertActivityEvent(client, req.user, {
        campaignId: eng.rows[0].campaign_id,
        engagementId: req.params.id,
        action: 'visit_reminded',
        details: req.body ?? {},
      });
    });
    res.status(204).end();
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});
