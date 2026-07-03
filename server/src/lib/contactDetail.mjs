import { findContactByMobile, normalizeMobileToE164 } from './mobileNumber.mjs';
import { syncContactTags } from './contactTags.mjs';
import { assertValidCity } from './cities.mjs';
import {
  assertCollaborationPreference,
  effectiveCollaborationPreference,
} from './collaborationPrefs.mjs';

export const CLASSIFICATION_VALUES = [
  'nano',
  'micro',
  'mid',
  'category_a',
  'macro',
  'hni',
  'fnb_specialist',
];

export const CONTACT_STATUS_VALUES = ['active', 'inactive', 'archived'];

const SCALAR_FIELDS = new Set([
  'full_name',
  'email',
  'city',
  'state',
  'country',
  'instagram_url',
  'youtube_url',
  'open_to_paid',
  'open_to_barter',
  'reel_rate',
  'story_rate',
  'post_rate',
  'other_rate',
  'classification',
  'status',
  'notes',
  'primary_category_id',
]);

function trimOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseOptionalRate(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw Object.assign(new Error('Rates must be non-negative numbers'), { status: 400 });
  }
  return n;
}

function parseOptionalBool(value) {
  if (value == null) return undefined;
  return Boolean(value);
}

function parsePlatformLinks(value) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('other_platform_links must be an array'), { status: 400 });
  }
  return value.map((item, index) => {
    const label = trimOrNull(item?.label);
    const url = trimOrNull(item?.url);
    if (!label || !url) {
      throw Object.assign(new Error(`other_platform_links[${index}] requires label and url`), {
        status: 400,
      });
    }
    return { label, url };
  });
}

function parseUuidList(value, fieldName) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw Object.assign(new Error(`${fieldName} must be an array of ids`), { status: 400 });
  }
  return [...new Set(value.filter(Boolean))];
}

/**
 * Parse PATCH body into scalar updates and relation payloads.
 * @returns {{ scalars: Record<string, unknown>, mobile?: string, other_platform_links?: object[], tag_ids?: string[] }}
 */
export function parseContactPatch(body) {
  const input = body ?? {};
  const scalars = {};
  let hasChange = false;

  for (const key of SCALAR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    hasChange = true;

    if (key === 'open_to_paid' || key === 'open_to_barter') {
      scalars[key] = parseOptionalBool(input[key]);
      continue;
    }

    if (key.endsWith('_rate')) {
      scalars[key] = parseOptionalRate(input[key]);
      continue;
    }

    if (key === 'classification') {
      const val = input[key];
      if (val == null || val === '') {
        scalars[key] = null;
      } else if (!CLASSIFICATION_VALUES.includes(val)) {
        throw Object.assign(new Error('Invalid classification'), { status: 400 });
      } else {
        scalars[key] = val;
      }
      continue;
    }

    if (key === 'status') {
      if (!CONTACT_STATUS_VALUES.includes(input[key])) {
        throw Object.assign(new Error('Invalid lifecycle status'), { status: 400 });
      }
      scalars[key] = input[key];
      continue;
    }

    if (key === 'primary_category_id') {
      scalars[key] = input[key] || null;
      continue;
    }

    if (key === 'full_name') {
      const name = trimOrNull(input[key]);
      if (!name) throw Object.assign(new Error('Full name cannot be empty'), { status: 400 });
      scalars[key] = name;
      continue;
    }

    scalars[key] = trimOrNull(input[key]);
  }

  let mobile;
  if (Object.prototype.hasOwnProperty.call(input, 'mobile_number')) {
    hasChange = true;
    const country = input.mobile_country_code ?? undefined;
    const e164 = normalizeMobileToE164(input.mobile_number, country);
    if (!e164) {
      throw Object.assign(new Error('Enter a valid mobile number'), { status: 400 });
    }
    mobile = e164;
  }

  const other_platform_links = parsePlatformLinks(
    Object.prototype.hasOwnProperty.call(input, 'other_platform_links')
      ? input.other_platform_links
      : undefined,
  );
  if (other_platform_links !== undefined) hasChange = true;

  const tag_ids = parseUuidList(
    Object.prototype.hasOwnProperty.call(input, 'tag_ids') ? input.tag_ids : undefined,
    'tag_ids',
  );
  if (tag_ids !== undefined) hasChange = true;

  if (!hasChange) {
    throw Object.assign(new Error('No valid fields to update'), { status: 400 });
  }

  return {
    scalars,
    mobile,
    other_platform_links,
    tag_ids,
  };
}

export async function loadContactDetail(client, contactId) {
  const { rows } = await client.query(
    `SELECT c.*,
            pc.id AS primary_category_id_resolved,
            pc.name AS primary_category_name,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', t.id,
                    'name', t.name,
                    'type', t.type,
                    'is_active', t.is_active
                  )
                  ORDER BY t.name
                )
                FROM contact_tags ct
                JOIN tags t ON t.id = ct.tag_id
                WHERE ct.contact_id = c.id
              ),
              '[]'::json
            ) AS tags
     FROM contacts c
     LEFT JOIN categories pc ON pc.id = c.primary_category_id
     WHERE c.id = $1`,
    [contactId],
  );

  const row = rows[0];
  if (!row) return null;

  const tags = Array.isArray(row.tags) ? row.tags : [];

  return {
    ...row,
    primary_category: row.primary_category_id
      ? { id: row.primary_category_id, name: row.primary_category_name }
      : null,
    tags,
    tag_names: tags.map((t) => t.name),
    primary_category_id_resolved: undefined,
    primary_category_name: undefined,
  };
}

async function assertIdsExist(client, table, ids, label) {
  if (!ids?.length) return;
  const { rows } = await client.query(
    `SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  if (rows.length !== ids.length) {
    throw Object.assign(new Error(`One or more ${label} ids are invalid`), { status: 400 });
  }
}

export async function applyContactPatch(client, contactId, body, { userId } = {}) {
  const patch = parseContactPatch(body);

  const existing = await client.query(
    'SELECT id, mobile_number, open_to_paid, open_to_barter FROM contacts WHERE id = $1',
    [contactId],
  );
  if (!existing.rows[0]) {
    throw Object.assign(new Error('Contact not found'), { status: 404 });
  }

  const bodyInput = body ?? {};
  const touchesCollaborationPrefs =
    Object.prototype.hasOwnProperty.call(bodyInput, 'open_to_paid')
    || Object.prototype.hasOwnProperty.call(bodyInput, 'open_to_barter');

  if (touchesCollaborationPrefs) {
    const { openToPaid, openToBarter } = effectiveCollaborationPreference(
      existing.rows[0],
      patch.scalars,
    );
    assertCollaborationPreference(openToPaid, openToBarter);
  }

  if (patch.mobile) {
    const country = body?.mobile_country_code ?? undefined;
    const { contact: dup } = await findContactByMobile(client, patch.mobile, country);
    if (dup && dup.id !== contactId) {
      throw Object.assign(
        new Error('A contact with this mobile number already exists'),
        { status: 409, duplicate: dup },
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'city')) {
    const cityVal = trimOrNull(body.city);
    if (cityVal) {
      const row = await assertValidCity(
        client,
        cityVal,
        body.country ?? body.mobile_country_code ?? 'IN',
      );
      patch.scalars.city = row.name;
      patch.scalars.country = row.country;
    } else {
      patch.scalars.city = null;
    }
  }

  if (patch.scalars.primary_category_id) {
    await assertIdsExist(client, 'categories', [patch.scalars.primary_category_id], 'category');
  }

  if (patch.tag_ids !== undefined) {
    await assertIdsExist(client, 'tags', patch.tag_ids, 'tag');
  }

  if (patch.scalars.open_to_paid === false) {
    patch.scalars.reel_rate = null;
    patch.scalars.story_rate = null;
    patch.scalars.post_rate = null;
    patch.scalars.other_rate = null;
  }

  const sets = [];
  const params = [contactId];
  let idx = 2;

  if (patch.mobile) {
    sets.push(`mobile_number = $${idx}`);
    params.push(patch.mobile);
    idx += 1;
  }

  for (const [key, value] of Object.entries(patch.scalars)) {
    sets.push(`${key} = $${idx}`);
    params.push(value);
    idx += 1;
  }

  if (patch.other_platform_links !== undefined) {
    sets.push(`other_platform_links = $${idx}::jsonb`);
    params.push(JSON.stringify(patch.other_platform_links));
    idx += 1;
  }

  if (sets.length > 0) {
    await client.query(
      `UPDATE contacts SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
      params,
    );
  }

  if (patch.tag_ids !== undefined) {
    await syncContactTags(client, contactId, patch.tag_ids, { userId });
  }

  return loadContactDetail(client, contactId);
}
