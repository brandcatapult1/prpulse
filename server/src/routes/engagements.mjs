import { Router } from 'express';
import multer from 'multer';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import {
  requireDidntDeliverPermission,
  requireEngagementWriteAccess,
  requireSeniorOrAdmin,
} from '../middleware/permissions.mjs';
import { isCloudinaryConfigured, uploadProofScreenshot } from '../lib/cloudinary.mjs';
import {
  ACTIVITY_ACTION,
  activityRowToTimelineEntry,
  legacyTimelineRowToEntry,
  tryInsertActivityEvent,
  listActivityEventsForCampaign,
  listActivityEventsForEngagement,
} from '../lib/activityEvents.mjs';
import {
  resolveDeliverablePostedProof,
  deliverableInsertFields,
  loadDeliverablesForEngagement,
  loadScreenshotsForDeliverables,
  mapDeliverableRow,
  syncDeliverableScreenshots,
} from '../lib/deliverableRows.mjs';
import {
  ENGAGEMENT_OUTLET_JOINS,
  ENGAGEMENT_OUTLET_SELECT,
  getDefaultOutletForCampaign,
  normalizeVisitTime,
  syncVisitOutletText,
} from '../lib/outlets.mjs';
import {
  recordDeliverablePostedActivity,
  recordDeliverableDemotedActivity,
  recordDidntDeliverActivity,
  recordEngagementPatchActivity,
  recordFeedbackActivity,
} from '../lib/engagementActivity.mjs';
import { commitScheduleEngagement } from '../lib/scheduleEngagement.mjs';
import { assertDeliverablesEditable } from '../lib/engagementDeliverableRules.mjs';

export const engagementsRouter = Router();

const proofScreenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true);
    else cb(Object.assign(new Error('Only image files are allowed'), { status: 400 }));
  },
});

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
  'visit_outlet_id',
  'visit_notes',
  'visit_completed_date',
  'notes',
  'agreed_fee',
  'collaboration_type',
  'primary_collaboration_reason',
  'secondary_collaboration_reason',
  'dropped_from',
  'drop_reason',
  'no_reply_count',
  'last_contact_log_type',
];

engagementsRouter.get('/campaign/:campaignId', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, ${ENGAGEMENT_CONTACT_COLS}, u.full_name AS owner_name,
            cam.campaign_name, ${ENGAGEMENT_OUTLET_SELECT}
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN users u ON u.id = e.assigned_manager
     JOIN campaigns cam ON cam.id = e.campaign_id
     ${ENGAGEMENT_OUTLET_JOINS}
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
            cam.campaign_name, cam.status AS campaign_status, ${ENGAGEMENT_OUTLET_SELECT}
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN users u ON u.id = e.assigned_manager
     JOIN campaigns cam ON cam.id = e.campaign_id
     ${ENGAGEMENT_OUTLET_JOINS}
     WHERE e.assigned_manager = $1 AND cam.status <> 'archived'
     ORDER BY e.updated_at DESC`,
    [req.user.id],
  );
  res.json(rows);
});

engagementsRouter.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, ${ENGAGEMENT_CONTACT_COLS}, cam.campaign_name, b.brand_name,
            u.full_name AS owner_name, ${ENGAGEMENT_OUTLET_SELECT}
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN campaigns cam ON cam.id = e.campaign_id
     JOIN brands b ON b.id = cam.brand_id
     JOIN users u ON u.id = e.assigned_manager
     ${ENGAGEMENT_OUTLET_JOINS}
     WHERE e.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Engagement not found' });
  res.json(rows[0]);
});

engagementsRouter.patch('/:id', requireAuth, requireEngagementWriteAccess('id'), requireDidntDeliverPermission, patchEngagement);
engagementsRouter.patch('/:id/status', requireAuth, requireEngagementWriteAccess('id'), requireDidntDeliverPermission, patchEngagement);

const REOPEN_COMPLETE_STATUS = 'awaiting_final_deliverables';

/**
 * Sanctioned reopen from Collaboration Complete → Awaiting Final Deliverables.
 * Admin / Senior Manager only. Status UPDATE fires trg_engagement_after_status →
 * fn_refresh_engagement_completion (metrics + campaign tags). completed_at retained.
 */
engagementsRouter.post(
  '/:id/reopen',
  requireAuth,
  requireEngagementWriteAccess('id'),
  requireSeniorOrAdmin,
  async (req, res) => {
    try {
      const updated = await withUserTransaction(req.user.id, async (client) => {
        const current = await client.query('SELECT * FROM engagements WHERE id = $1', [req.params.id]);
        if (!current.rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
        const cur = current.rows[0];

        if (cur.conversation_status !== 'collaboration_complete') {
          throw Object.assign(
            new Error('Only a completed collaboration can be reopened'),
            { status: 409 },
          );
        }

        const patch = { conversation_status: REOPEN_COMPLETE_STATUS };
        const { rows } = await client.query(
          `UPDATE engagements
           SET conversation_status = $2,
               last_status_change_at = now(),
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [req.params.id, REOPEN_COMPLETE_STATUS],
        );

        await recordEngagementPatchActivity(client, req.user, cur, rows[0], patch);
        return loadEngagementRow(client, req.params.id);
      });
      res.json(updated);
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  },
);

engagementsRouter.post('/:id/schedule', requireAuth, requireEngagementWriteAccess('id'), async (req, res) => {
  try {
    const result = await withUserTransaction(req.user.id, async (client) =>
      commitScheduleEngagement(client, req.user, req.params.id, req.body, loadEngagementRow),
    );
    res.json(result);
  } catch (err) {
    const status = err.status ?? (err.code === '23514' || err.code === 'check_violation' ? 422 : 500);
    res.status(status).json({ error: err.message });
  }
});

async function loadEngagementRow(client, engagementId) {
  const { rows } = await client.query(
    `SELECT e.*, ${ENGAGEMENT_CONTACT_COLS}, cam.campaign_name, b.brand_name,
            u.full_name AS owner_name, ${ENGAGEMENT_OUTLET_SELECT}
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     JOIN campaigns cam ON cam.id = e.campaign_id
     JOIN brands b ON b.id = cam.brand_id
     JOIN users u ON u.id = e.assigned_manager
     ${ENGAGEMENT_OUTLET_JOINS}
     WHERE e.id = $1`,
    [engagementId],
  );
  return rows[0] ?? null;
}

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

      if (Object.prototype.hasOwnProperty.call(patch, 'visit_time')) {
        patch.visit_time = normalizeVisitTime(patch.visit_time);
      }

      if (
        cur.conversation_status === 'collaboration_complete'
        && patch.conversation_status
        && patch.conversation_status !== 'collaboration_complete'
      ) {
        throw Object.assign(
          new Error('Use Reopen to move an engagement out of Collaboration Complete'),
          { status: 409 },
        );
      }

      const newStatus = patch.conversation_status ?? cur.conversation_status;
      const followUpExplicit = Object.prototype.hasOwnProperty.call(req.body, 'next_follow_up_date');
      let followUp = cur.next_follow_up_date;

      if (followUpExplicit) {
        followUp = patch.next_follow_up_date;
      } else if (Object.prototype.hasOwnProperty.call(patch, 'visit_date') && patch.visit_date) {
        followUp = patch.visit_date;
      } else if (patch.conversation_status && patch.conversation_status !== cur.conversation_status) {
        if (newStatus === 'scheduled' && (patch.visit_date ?? cur.visit_date)) {
          followUp = patch.visit_date ?? cur.visit_date;
        }
        if (newStatus?.startsWith('dropped_') || newStatus === 'collaboration_complete' || newStatus === 'dropped') {
          followUp = null;
        }
      }

      const visitFieldsTouched =
        Object.prototype.hasOwnProperty.call(patch, 'visit_date')
        || Object.prototype.hasOwnProperty.call(patch, 'visit_time')
        || Object.prototype.hasOwnProperty.call(patch, 'visit_notes')
        || newStatus === 'scheduled'
        || cur.conversation_status === 'scheduled';

      if (
        visitFieldsTouched
        && !Object.prototype.hasOwnProperty.call(req.body, 'visit_outlet_id')
        && !patch.visit_outlet_id
        && !cur.visit_outlet_id
      ) {
        const outlet = await getDefaultOutletForCampaign(client, cur.campaign_id);
        if (outlet) {
          patch.visit_outlet_id = outlet.id;
        }
      }

      if (patch.visit_outlet_id) {
        const outletName = await syncVisitOutletText(client, patch.visit_outlet_id);
        if (outletName) patch.visit_outlet = outletName;
      }

      const sets = [];
      const params = [req.params.id];
      let idx = 2;

      for (const key of ENGAGEMENT_PATCH_FIELDS) {
        if (key === 'next_follow_up_date') continue;
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        sets.push(`${key} = $${idx}`);
        params.push(patch[key]);
        idx += 1;
      }

      const statusChanged =
        patch.conversation_status && patch.conversation_status !== cur.conversation_status;
      if (
        followUpExplicit
        || statusChanged
        || Object.prototype.hasOwnProperty.call(patch, 'visit_date')
      ) {
        if (
          followUp !== cur.next_follow_up_date
          || followUpExplicit
          || Object.prototype.hasOwnProperty.call(patch, 'visit_date')
        ) {
          sets.push(`next_follow_up_date = $${idx}`);
          params.push(followUp);
          idx += 1;
        }
      }

      if (patch.conversation_status && patch.conversation_status !== cur.conversation_status) {
        sets.push('last_status_change_at = now()');
      }

      if (sets.length === 0) return loadEngagementRow(client, req.params.id);

      const { rows } = await client.query(
        `UPDATE engagements SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        params,
      );

      const updated = rows[0];
      await recordEngagementPatchActivity(client, req.user, cur, updated, patch);
      if (
        patch.drop_reason === 'didnt_deliver'
        && cur.drop_reason !== 'didnt_deliver'
      ) {
        await recordDidntDeliverActivity(client, req.user, {
          campaignId: cur.campaign_id,
          engagementId: cur.id,
          engagementPatch: patch,
          blacklist: Boolean(req.body.blacklist),
          contactId: cur.contact_id,
        });
      }
      return loadEngagementRow(client, req.params.id);
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

/** Upload a proof screenshot to Cloudinary; returns hosted URL for unit_proofs / assets. */
engagementsRouter.post(
  '/:engagementId/proof-screenshots',
  requireAuth,
  requireEngagementWriteAccess('engagementId'),
  (req, res, next) => {
    proofScreenshotUpload.single('file')(req, res, (err) => {
      if (err) {
        const status = err.status ?? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
        return res.status(status).json({ error: err.message ?? 'Upload failed' });
      }
      next();
    });
  },
  async (req, res) => {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'Image upload is not configured on the server' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    try {
      const client = await pool.connect();
      try {
        await assertDeliverablesEditable(client, req.params.engagementId);
      } finally {
        client.release();
      }
      const uploaded = await uploadProofScreenshot(req.file.buffer, {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      res.json({
        id: `s-${Date.now()}-${req.file.originalname}`,
        label: req.file.originalname,
        url: uploaded.url,
      });
    } catch (err) {
      res.status(err.status ?? 502).json({ error: err.message ?? 'Could not upload screenshot' });
    }
  },
);

engagementsRouter.post('/:id/deliverables', requireAuth, requireEngagementWriteAccess('id'), async (req, res) => {
  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      await assertDeliverablesEditable(client, req.params.id);
      const eng = await client.query('SELECT id, campaign_id FROM engagements WHERE id = $1', [req.params.id]);
      if (!eng.rows[0]) throw Object.assign(new Error('Engagement not found'), { status: 404 });

      const fields = deliverableInsertFields(req.body);
      const { fields: resolvedFields } = await resolveDeliverablePostedProof(client, {
        before: null,
        fields,
        deliverableId: null,
        bodyScreenshots: req.body.screenshots,
      });
      const { rows } = await client.query(
        `INSERT INTO deliverables (
           engagement_id, deliverable_type, quantity, posted_quantity, unit_proofs,
           due_date, status, published_date, content_link,
           brief_compliance, brand_tag_verified, internal_rating
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          req.params.id,
          resolvedFields.deliverable_type,
          resolvedFields.quantity,
          resolvedFields.posted_quantity,
          JSON.stringify(resolvedFields.unit_proofs),
          resolvedFields.due_date,
          resolvedFields.status,
          resolvedFields.published_date,
          resolvedFields.content_link,
          resolvedFields.brief_compliance,
          resolvedFields.brand_tag_verified,
          resolvedFields.internal_rating,
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

engagementsRouter.patch('/:engagementId/deliverables/:deliverableId', requireAuth, requireEngagementWriteAccess('engagementId'), async (req, res) => {
  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      await assertDeliverablesEditable(client, req.params.engagementId);
      const cur = await client.query(
        `SELECT d.*, e.campaign_id, e.contact_id FROM deliverables d
         JOIN engagements e ON e.id = d.engagement_id
         WHERE d.id = $1 AND d.engagement_id = $2`,
        [req.params.deliverableId, req.params.engagementId],
      );
      if (!cur.rows[0]) throw Object.assign(new Error('Deliverable not found'), { status: 404 });
      const before = cur.rows[0];

      const draftFields = deliverableInsertFields({ ...before, ...req.body });
      const { fields, demoted, demoteMessage } = await resolveDeliverablePostedProof(client, {
        before,
        fields: draftFields,
        deliverableId: req.params.deliverableId,
        bodyScreenshots: Object.prototype.hasOwnProperty.call(req.body, 'screenshots')
          ? req.body.screenshots
          : undefined,
      });
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

      const updated = (await loadDeliverablesForEngagement(client, req.params.engagementId))
        .find((d) => d.id === req.params.deliverableId);

      if (before.status !== 'posted' && rows[0].status === 'posted') {
        await recordDeliverablePostedActivity(client, req.user, {
          campaignId: before.campaign_id,
          engagementId: req.params.engagementId,
          deliverable: updated ?? mapDeliverableRow(rows[0], req.body.screenshots ?? []),
        });
      }

      if (demoted) {
        await recordDeliverableDemotedActivity(client, req.user, {
          campaignId: before.campaign_id,
          engagementId: req.params.engagementId,
          contactId: before.contact_id,
          deliverable: updated ?? mapDeliverableRow(rows[0], req.body.screenshots ?? []),
          message: demoteMessage,
        });
      }

      const result = updated ?? mapDeliverableRow(rows[0], []);
      if (demoted) {
        result.proof_demoted = true;
        result.proof_demote_message = demoteMessage;
      }
      return result;
    });
    res.json(row);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

engagementsRouter.delete('/:engagementId/deliverables/:deliverableId', requireAuth, requireEngagementWriteAccess('engagementId'), async (req, res) => {
  try {
    await withUserTransaction(req.user.id, async (client) => {
      await assertDeliverablesEditable(client, req.params.engagementId);
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

engagementsRouter.put('/:id/feedback', requireAuth, requireEngagementWriteAccess('id'), async (req, res) => {
  const {
    content_quality,
    professionalism,
    timeliness,
    adherence_to_terms,
    would_work_again,
    internal_notes,
  } = req.body ?? {};

  function parseOptionalRating(value, label) {
    if (value == null || value === '' || value === 0) return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw Object.assign(new Error(`${label} must be 1-5 or omitted`), { status: 400 });
    }
    return n;
  }

  let parsed;
  try {
    parsed = {
      content_quality: parseOptionalRating(content_quality, 'Content quality'),
      professionalism: parseOptionalRating(professionalism, 'Professionalism'),
      timeliness: parseOptionalRating(timeliness, 'Timeliness'),
    };
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
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
          parsed.content_quality,
          parsed.professionalism,
          parsed.timeliness,
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
  res.json(rows.map(legacyTimelineRowToEntry));
});

/** Log visit reminder (WhatsApp opened — client-side action). */
engagementsRouter.post('/:id/visit-reminder', requireAuth, requireEngagementWriteAccess('id'), async (req, res) => {
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
