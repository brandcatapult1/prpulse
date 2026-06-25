import { ensureReferenceData } from './referenceData.mjs';

export async function loadCategories(client) {
  await ensureReferenceData(client);
  const { rows } = await client.query(
    `SELECT id, name, created_at FROM categories ORDER BY name`,
  );
  return rows;
}

/** Validate category id exists on the admin-managed list. */
export async function assertValidCategoryId(client, categoryId) {
  const id = String(categoryId ?? '').trim();
  if (!id) return null;

  await ensureReferenceData(client);
  const { rows } = await client.query(
    `SELECT id, name FROM categories WHERE id = $1`,
    [id],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Select a category from the list'), { status: 400 });
  }
  return rows[0];
}
