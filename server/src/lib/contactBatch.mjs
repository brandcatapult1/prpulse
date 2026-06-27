import { logContactTagAudit } from './contactTags.mjs';
import { assertValidCategoryId } from './categories.mjs';

function parseContactIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw Object.assign(new Error('contact_ids array required'), { status: 400 });
  }
  return [...new Set(value.filter(Boolean))];
}

/** Set explicit active/inactive on selected contacts; archived rows are skipped. */
export async function batchSetContactStatus(client, contactIds, status) {
  if (!['active', 'inactive'].includes(status)) {
    throw Object.assign(new Error('status must be active or inactive'), { status: 400 });
  }

  const ids = parseContactIds(contactIds);

  const { rows } = await client.query(
    `UPDATE contacts
     SET status = $2::contact_status
     WHERE id = ANY($1::uuid[])
       AND status <> 'archived'
     RETURNING id, status`,
    [ids, status],
  );

  return {
    updated: rows.length,
    skipped: ids.length - rows.length,
    status,
    contacts: rows,
  };
}

/** Add one admin-managed tag to each selected contact (additive, idempotent). */
export async function batchAddTagToContacts(client, contactIds, tagId, { userId } = {}) {
  const ids = parseContactIds(contactIds);
  if (!tagId) {
    throw Object.assign(new Error('tag_id required'), { status: 400 });
  }

  const { rows: tagRows } = await client.query('SELECT id, name FROM tags WHERE id = $1', [tagId]);
  if (!tagRows[0]) {
    throw Object.assign(new Error('Tag not found'), { status: 404 });
  }
  const tagName = tagRows[0].name;

  const { rows: inserted } = await client.query(
    `INSERT INTO contact_tags (contact_id, tag_id)
     SELECT unnest($1::uuid[]), $2
     ON CONFLICT DO NOTHING
     RETURNING contact_id`,
    [ids, tagId],
  );

  for (const row of inserted) {
    await logContactTagAudit(client, {
      contactId: row.contact_id,
      userId,
      action: 'tag_added',
      tagId,
      tagName,
      extra: { source: 'manual', batch: true },
    });
  }

  return {
    tagged: inserted.length,
    skipped: ids.length - inserted.length,
    tag: { id: tagId, name: tagName },
  };
}

/** Set primary category on selected contacts in one batched write. */
export async function batchSetPrimaryCategory(client, contactIds, primaryCategoryId) {
  const ids = parseContactIds(contactIds);
  if (!primaryCategoryId) {
    throw Object.assign(new Error('primary_category_id required'), { status: 400 });
  }

  const category = await assertValidCategoryId(client, primaryCategoryId);

  const { rows } = await client.query(
    `UPDATE contacts
     SET primary_category_id = $2
     WHERE id = ANY($1::uuid[])
     RETURNING id`,
    [ids, category.id],
  );

  return {
    updated: rows.length,
    skipped: ids.length - rows.length,
    category: { id: category.id, name: category.name },
  };
}
