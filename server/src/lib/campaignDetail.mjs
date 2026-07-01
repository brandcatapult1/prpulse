import { syncCampaignTags, loadCampaignTags } from './contactTags.mjs';
import {
  assertMonthlyTermMonths,
  parseRequiredTargetCollaborations,
} from './campaignValidation.mjs';
import {
  ensureCampaignCycles,
  listCampaignCycles,
  pickCurrentCycle,
} from './campaignCycles.mjs';
import { todayIst } from './constants.mjs';

const SCALAR_FIELDS = new Set([
  'campaign_name',
  'status',
  'target_collaborations',
  'term_months',
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
      if (input[key] === 'project') {
        scalars.term_months = null;
      }
      continue;
    }

    if (key === 'target_collaborations') {
      scalars[key] = parseRequiredTargetCollaborations(input[key]);
      continue;
    }

    if (key === 'term_months') {
      if (input[key] === '' || input[key] == null) {
        scalars[key] = null;
      } else {
        const n = Number(input[key]);
        if (!Number.isInteger(n) || n < 1) {
          throw Object.assign(new Error('term_months must be a positive integer'), { status: 400 });
        }
        scalars[key] = n;
      }
      continue;
    }

    scalars[key] = input[key] || null;
  }

  if (scalars.campaign_type === 'project') {
    scalars.term_months = null;
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

function coerceCampaignScalars(row) {
  return {
    ...row,
    target_collaborations:
      row.target_collaborations != null ? Number(row.target_collaborations) : null,
    term_months: row.term_months != null ? Number(row.term_months) : null,
    completed_collaborations: Number(row.completed_collaborations ?? 0),
    remaining_collaborations:
      row.remaining_collaborations != null ? Number(row.remaining_collaborations) : null,
    achievement_pct: row.achievement_pct != null ? Number(row.achievement_pct) : null,
  };
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

  const campaign = coerceCampaignScalars(row);
  const materialized = await ensureCampaignCycles(client, campaign);
  if (materialized) {
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [campaignId]);
    const refreshed = await client.query(
      `SELECT cam.*, b.brand_name
       FROM campaigns cam
       JOIN brands b ON b.id = cam.brand_id
       WHERE cam.id = $1`,
      [campaignId],
    );
    if (refreshed.rows[0]) {
      Object.assign(campaign, coerceCampaignScalars(refreshed.rows[0]));
    }
  }

  const tags = await loadCampaignTags(client, campaignId);
  const cycles = await listCampaignCycles(client, campaignId);
  const current_cycle = pickCurrentCycle(cycles, todayIst());

  return {
    ...campaign,
    tags,
    tag_names: tags.map((t) => t.name),
    cycles,
    current_cycle,
  };
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

  const existing = await client.query(
    'SELECT campaign_type, term_months, target_collaborations FROM campaigns WHERE id = $1',
    [campaignId],
  );
  if (!existing.rows[0]) {
    throw Object.assign(new Error('Campaign not found'), { status: 404 });
  }

  const current = existing.rows[0];
  const effectiveType = patch.scalars.campaign_type ?? current.campaign_type;
  const effectiveTermMonths = Object.prototype.hasOwnProperty.call(patch.scalars, 'term_months')
    ? patch.scalars.term_months
    : current.term_months;

  if (Object.prototype.hasOwnProperty.call(patch.scalars, 'target_collaborations')) {
    assertMonthlyTermMonths(effectiveType, effectiveTermMonths);
  }
  if (
    Object.prototype.hasOwnProperty.call(patch.scalars, 'term_months')
    || Object.prototype.hasOwnProperty.call(patch.scalars, 'campaign_type')
  ) {
    assertMonthlyTermMonths(effectiveType, effectiveTermMonths);
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

  // Changing the target re-bases remaining_collaborations, achievement_pct and
  // campaign_health, but no deliverable/status trigger fires on a target edit.
  // Recompute in-transaction so the rollups update immediately (and commit with
  // this same campaign update), rather than going stale until the next event.
  if (Object.prototype.hasOwnProperty.call(patch.scalars, 'target_collaborations')) {
    await client.query('SELECT recompute_campaign_metrics($1::uuid)', [campaignId]);
  }

  return loadCampaignDetail(client, campaignId);
}

export async function assignCampaignTagsOnCreate(client, campaignId, tagIds) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) return;
  await assertTagIdsExist(client, tagIds);
  await syncCampaignTags(client, campaignId, tagIds);
}
