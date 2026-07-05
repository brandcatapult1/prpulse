import {
  resolveDeliverablePostedProof,
  deliverableInsertFields,
  loadDeliverablesForEngagement,
  syncDeliverableScreenshots,
} from './deliverableRows.mjs';
import {
  getDefaultOutletForCampaign,
  normalizeVisitTime,
  syncVisitOutletText,
} from './outlets.mjs';
import { recordEngagementPatchActivity, recordDeliverableDemotedActivity } from './engagementActivity.mjs';

function isTempDeliverableId(id) {
  return id == null || String(id).startsWith('d-');
}

/** Replace deliverable rows for an engagement inside an open transaction. */
export async function syncDeliverablesInTransaction(client, engagementId, desiredList, user) {
  const userId = user?.id ?? user;
  const { rows: engRows } = await client.query(
    'SELECT campaign_id, contact_id FROM engagements WHERE id = $1',
    [engagementId],
  );
  const { campaign_id: campaignId, contact_id: contactId } = engRows[0] ?? {};

  const before = await loadDeliverablesForEngagement(client, engagementId);
  const beforeById = new Map(before.map((d) => [d.id, d]));
  const keepIds = new Set(
    (desiredList ?? [])
      .filter((d) => !isTempDeliverableId(d.id))
      .map((d) => d.id),
  );

  for (const item of before) {
    if (!keepIds.has(item.id)) {
      await client.query('DELETE FROM deliverables WHERE id = $1 AND engagement_id = $2', [
        item.id,
        engagementId,
      ]);
    }
  }

  for (const item of desiredList ?? []) {
    const fields = deliverableInsertFields(item);
    const isNew = isTempDeliverableId(item.id) || !beforeById.has(item.id);

    if (isNew) {
      const { fields: resolvedFields } = await resolveDeliverablePostedProof(client, {
        before: null,
        fields,
        deliverableId: null,
        bodyScreenshots: item.screenshots,
      });
      const { rows } = await client.query(
        `INSERT INTO deliverables (
           engagement_id, deliverable_type, quantity, posted_quantity, unit_proofs,
           due_date, status, published_date, content_link,
           brief_compliance, brand_tag_verified, internal_rating
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          engagementId,
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
      if (item.screenshots?.length) {
        await syncDeliverableScreenshots(client, rows[0].id, item.screenshots, userId);
      }
      continue;
    }

    const beforeRow = beforeById.get(item.id);
    const { fields: resolvedFields, demoted, demoteMessage } = await resolveDeliverablePostedProof(
      client,
      {
        before: beforeRow,
        fields,
        deliverableId: item.id,
        bodyScreenshots: item.screenshots,
      },
    );

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
        item.id,
        engagementId,
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
    if (item.screenshots?.length) {
      await syncDeliverableScreenshots(client, rows[0].id, item.screenshots, userId);
    }

    if (demoted && user?.id) {
      const demotedRow = (await loadDeliverablesForEngagement(client, engagementId)).find(
        (d) => d.id === item.id,
      );
      await recordDeliverableDemotedActivity(client, user, {
        campaignId,
        engagementId,
        contactId,
        deliverable: demotedRow ?? rows[0],
        message: demoteMessage,
      });
    }
  }

  return loadDeliverablesForEngagement(client, engagementId);
}

function validateScheduleBody(body) {
  if (!body?.visit_date) {
    throw Object.assign(new Error('Visit date is required'), { status: 422 });
  }
  if (!body?.primary_collaboration_reason) {
    throw Object.assign(new Error('Collab reason is required'), { status: 422 });
  }
  if (!Array.isArray(body.deliverables) || body.deliverables.length === 0) {
    throw Object.assign(new Error('At least one deliverable is required'), { status: 422 });
  }
}

/**
 * Atomically sync deliverables and move engagement to scheduled.
 * Returns { engagement, deliverables } row shapes for the client.
 */
export async function commitScheduleEngagement(client, user, engagementId, body, loadEngagementRow) {
  validateScheduleBody(body);

  const { rows: curRows } = await client.query('SELECT * FROM engagements WHERE id = $1', [engagementId]);
  const cur = curRows[0];
  if (!cur) throw Object.assign(new Error('Not found'), { status: 404 });

  const savedDeliverables = await syncDeliverablesInTransaction(
    client,
    engagementId,
    body.deliverables,
    user,
  );

  const patch = {
    conversation_status: 'scheduled',
    visit_date: body.visit_date,
    visit_time: normalizeVisitTime(body.visit_time),
    visit_notes: body.visit_notes?.trim() || null,
    primary_collaboration_reason: body.primary_collaboration_reason,
    notes: body.notes?.trim() || null,
    next_follow_up_date: body.visit_date,
  };

  if (body.last_contact_date) {
    patch.last_contact_date = body.last_contact_date;
    patch.last_contact_log_type = body.last_contact_log_type ?? 'conversation';
    patch.no_reply_count = body.no_reply_count ?? 0;
  }

  if (body.visit_outlet_id) {
    patch.visit_outlet_id = body.visit_outlet_id;
  } else if (!cur.visit_outlet_id) {
    const outlet = await getDefaultOutletForCampaign(client, cur.campaign_id);
    if (outlet) patch.visit_outlet_id = outlet.id;
  }

  if (body.collaboration_type != null) {
    patch.collaboration_type = body.collaboration_type;
  } else if (cur.collaboration_type == null) {
    patch.collaboration_type = 'barter';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'agreed_fee')) {
    patch.agreed_fee = body.agreed_fee;
  }

  if (patch.visit_outlet_id) {
    const outletName = await syncVisitOutletText(client, patch.visit_outlet_id);
    if (outletName) patch.visit_outlet = outletName;
  }

  const sets = [];
  const params = [engagementId];
  let idx = 2;

  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${key} = $${idx}`);
    params.push(value);
    idx += 1;
  }
  sets.push('last_status_change_at = now()');

  const { rows: updatedRows } = await client.query(
    `UPDATE engagements SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    params,
  );
  const updated = updatedRows[0];
  await recordEngagementPatchActivity(client, user, cur, updated, patch);

  const engagement = await loadEngagementRow(client, engagementId);
  return { engagement, deliverables: savedDeliverables };
}
