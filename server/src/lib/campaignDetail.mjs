import { syncCampaignTags, loadCampaignTags } from './contactTags.mjs';

const SCALAR_FIELDS = new Set([
  'campaign_name',
  'status',
  'target_collaborations',
  'start_date',
  'end_date',
  'campaign_type',
]);

const ALLOWED_STATUSES = new Set(['draft', 'active', 'paused', 'completed', 'archived']);
const ALLOWED_TYPES = new Set(['monthly', 'project']);

function trimOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function parseCampaignPatch(body) {
  const input = body ?? {};
  const scalars = {};
  let hasChange = false;

  for (const key of SCALAR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    hasChange = true;

    if (key === 'campaign_name') {
      const name = trimOrNull(input[key]);
      if (!name) throw Object.assign(new Error('Campaign name cannot be empty'), { status: 400 });
      scalars[key] = name;
      continue;
    }

    if (key === 'status') {
      if (!ALLOWED_STATUSES.has(input[key])) {
        throw Object.assign(new Error('Invalid campaign status'), { status: 400 });
      }
      scalars[key] = input[key];
      continue;
    }

    if (key === 'campaign_type') {
      if (!ALLOWED_TYPES.has(input[key])) {
        throw Object.assign(new Error('Invalid campaign type'), { status: 400 });
      }
      scalars[key] = input[key];
      continue;
    }

    if (key === 'target_collaborations') {
      if (input[key] === '' || input[key] == null) {
        scalars[key] = null;
      } else {
        const n = Number(input[key]);
        if (!Number.isFinite(n) || n < 0) {
          throw Object.assign(new Error('Target collaborations must be a non-negative number'), { status: 400 });
        }
        scalars[key] = n;
      }
      continue;
    }

    scalars[key] = input[key] || null;
  }

  let tag_ids;
  if (Object.prototype.hasOwnProperty.call(input, 'tag_ids')) {
    hasChange = true;
    if (!Array.isArray(input.tag_ids)) {
      throw Object.assign(new Error('tag_ids must be an array'), { status: 400 });
    }
    tag_ids = [...new Set(input.tag_ids.filter(Boolean))];
  }

  if (!hasChange) {
    throw Object.assign(new Error('No valid fields to update'), { status: 400 });
  }

  return { scalars, tag_ids };
}

export async function loadCampaignDetail(client, campaignId) {
  const { rows } = await client.query(
    `SELECT cam.*, b.brand_name
     FROM campaigns cam
     JOIN brands b ON b.id = cam.brand_id
     WHERE cam.id = $1`,
    [campaignId],
  );
  const row = rows[0];
  if (!row) return null;

  const tags = await loadCampaignTags(client, campaignId);
  return { ...row, tags, tag_names: tags.map((t) => t.name) };
}

async function assertTagIdsExist(client, tagIds) {
  if (!tagIds?.length) return;
  const { rows } = await client.query('SELECT id FROM tags WHERE id = ANY($1::uuid[])', [tagIds]);
  if (rows.length !== tagIds.length) {
    throw Object.assign(new Error('One or more tag ids are invalid'), { status: 400 });
  }
}

export async function applyCampaignPatch(client, campaignId, body) {
  const patch = parseCampaignPatch(body);

  const existing = await client.query('SELECT id FROM campaigns WHERE id = $1', [campaignId]);
  if (!existing.rows[0]) {
    throw Object.assign(new Error('Campaign not found'), { status: 404 });
  }

  if (patch.tag_ids !== undefined) {
    await assertTagIdsExist(client, patch.tag_ids);
  }

  const sets = [];
  const params = [campaignId];
  let idx = 2;

  for (const [key, value] of Object.entries(patch.scalars)) {
    sets.push(`${key} = $${idx}`);
    params.push(value);
    idx += 1;
  }

  if (sets.length > 0) {
    await client.query(
      `UPDATE campaigns SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
      params,
    );
  }

  if (patch.tag_ids !== undefined) {
    await syncCampaignTags(client, campaignId, patch.tag_ids);
  }

  return loadCampaignDetail(client, campaignId);
}

export async function assignCampaignTagsOnCreate(client, campaignId, tagIds) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) return;
  await assertTagIdsExist(client, tagIds);
  await syncCampaignTags(client, campaignId, tagIds);
}
