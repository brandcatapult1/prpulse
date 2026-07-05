import { deliverableTypeFromDb, deliverableTypeToDb } from './deliverableTypes.mjs';
import {
  deliverablePostedProofSatisfied,
  deliverableProofDemotionMessage,
  deliverableProofRequirementMessage,
} from './deliverableProofRules.mjs';
import { mergeDeliverableProofForDisplay } from './deliverableProofDisplay.mjs';

export function mapDeliverableRow(row, screenshots = []) {
  if (!row) return null;
  const unit_proofs = Array.isArray(row.unit_proofs) ? row.unit_proofs : [];
  const merged = mergeDeliverableProofForDisplay(row, screenshots);
  return {
    id: row.id,
    engagement_id: row.engagement_id,
    deliverable_type: deliverableTypeFromDb(row.deliverable_type),
    quantity: row.quantity,
    posted_quantity: row.posted_quantity ?? 0,
    unit_proofs,
    due_date: row.due_date,
    status: row.status,
    published_date: row.published_date,
    content_link: merged.content_link,
    brief_compliance: row.brief_compliance,
    brand_tag_verified: row.brand_tag_verified,
    internal_rating: row.internal_rating,
    line_fee: row.line_fee != null ? Number(row.line_fee) : null,
    is_overdue: row.is_overdue ?? false,
    screenshots: merged.screenshots,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function loadScreenshotsForDeliverables(client, deliverableIds) {
  if (!deliverableIds.length) return new Map();
  const { rows } = await client.query(
    `SELECT id, deliverable_id, label, url, file_path
     FROM assets
     WHERE deliverable_id = ANY($1::uuid[])
       AND asset_type = 'screenshot'
     ORDER BY created_at`,
    [deliverableIds],
  );
  const byDeliverable = new Map();
  for (const asset of rows) {
    const list = byDeliverable.get(asset.deliverable_id) ?? [];
    list.push({
      id: asset.id,
      label: asset.label ?? 'Screenshot',
      url: asset.url ?? asset.file_path ?? null,
    });
    byDeliverable.set(asset.deliverable_id, list);
  }
  return byDeliverable;
}

export async function loadDeliverablesForEngagement(client, engagementId) {
  const { rows } = await client.query(
    'SELECT * FROM v_deliverables WHERE engagement_id = $1 ORDER BY created_at',
    [engagementId],
  );
  const ids = rows.map((r) => r.id);
  const screenshotsById = await loadScreenshotsForDeliverables(client, ids);
  return rows.map((row) => mapDeliverableRow(row, screenshotsById.get(row.id) ?? []));
}

export async function syncDeliverableScreenshots(client, deliverableId, screenshots, userId) {
  await client.query('DELETE FROM assets WHERE deliverable_id = $1 AND asset_type = $2', [
    deliverableId,
    'screenshot',
  ]);
  for (const shot of screenshots ?? []) {
    const url = shot.url ?? shot.file_path ?? null;
    const filePath = shot.file_path ?? null;
    if (!url && !filePath) continue;
    await client.query(
      `INSERT INTO assets (asset_type, label, url, file_path, deliverable_id, uploaded_by)
       VALUES ('screenshot', $1, $2, $3, $4, $5)`,
      [shot.label ?? 'Screenshot', url, filePath, deliverableId, userId ?? null],
    );
  }
}

function coerceLineFee(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export function deliverableInsertFields(body) {
  return {
    deliverable_type: deliverableTypeToDb(body.deliverable_type),
    quantity: body.quantity ?? 1,
    posted_quantity: body.posted_quantity ?? 0,
    unit_proofs: body.unit_proofs ?? [],
    due_date: body.due_date ?? null,
    status: body.status ?? 'pending',
    published_date: body.published_date ?? null,
    content_link: body.content_link ?? null,
    brief_compliance: body.brief_compliance ?? null,
    brand_tag_verified: body.brand_tag_verified ?? null,
    internal_rating: body.internal_rating ?? null,
    line_fee: coerceLineFee(body.line_fee),
  };
}

/**
 * Enforce proof on every write that would leave status='posted'.
 * Entering posted without proof => 422. Already-posted without proof => demote to pending.
 */
export async function resolveDeliverablePostedProof(
  client,
  { before, fields, deliverableId, bodyScreenshots },
) {
  if (fields.status !== 'posted') {
    return { fields, demoted: false };
  }

  let screenshots = bodyScreenshots;
  if (screenshots === undefined && deliverableId) {
    const map = await loadScreenshotsForDeliverables(client, [deliverableId]);
    screenshots = map.get(deliverableId) ?? [];
  }

  const satisfied = deliverablePostedProofSatisfied({
    deliverable_type: fields.deliverable_type,
    content_link: fields.content_link,
    unit_proofs: fields.unit_proofs,
    screenshots: screenshots ?? [],
    quantity: fields.quantity,
    status: 'posted',
  });

  if (satisfied) {
    return { fields, demoted: false };
  }

  const wasPosted = before?.status === 'posted';
  if (!wasPosted) {
    throw Object.assign(
      new Error(deliverableProofRequirementMessage(fields.deliverable_type)),
      { status: 422 },
    );
  }

  const demoteMessage = deliverableProofDemotionMessage(fields.deliverable_type);
  return {
    fields: {
      ...fields,
      status: 'pending',
      posted_quantity: 0,
    },
    demoted: true,
    demoteMessage,
  };
}

/** @deprecated use resolveDeliverablePostedProof */
export const assertDeliverablePostedTransition = resolveDeliverablePostedProof;
