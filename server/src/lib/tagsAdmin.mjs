/** Admin-managed tags master list (lookup only — does not touch contact_tags). */

export const TAG_TYPES = new Set(['influencer', 'campaign']);

const TAG_SELECT = `id, name, type, is_active, created_by, created_at`;

export function parseTagName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  return name;
}

export function parseTagType(raw) {
  const type = String(raw ?? '').trim();
  if (!TAG_TYPES.has(type)) {
    const err = new Error("type must be 'influencer' or 'campaign'");
    err.status = 400;
    throw err;
  }
  return type;
}

export async function listTags(client, { includeArchived = false } = {}) {
  const { rows } = await client.query(
    includeArchived
      ? `SELECT ${TAG_SELECT} FROM tags ORDER BY lower(name)`
      : `SELECT ${TAG_SELECT} FROM tags WHERE is_active = true ORDER BY lower(name)`,
  );
  return rows;
}

export async function findTagById(client, id) {
  const { rows } = await client.query(
    `SELECT ${TAG_SELECT} FROM tags WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createTag(client, { name, type, createdBy }) {
  try {
    const { rows } = await client.query(
      `INSERT INTO tags (name, type, is_active, created_by)
       VALUES ($1, $2, true, $3)
       RETURNING ${TAG_SELECT}`,
      [name, type, createdBy ?? null],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      const conflict = new Error('A tag with this name already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

export async function renameTag(client, id, name) {
  try {
    const { rows } = await client.query(
      `UPDATE tags SET name = $1 WHERE id = $2
       RETURNING ${TAG_SELECT}`,
      [name, id],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err.code === '23505') {
      const conflict = new Error('A tag with this name already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

export async function setTagActive(client, id, isActive) {
  const { rows } = await client.query(
    `UPDATE tags SET is_active = $1 WHERE id = $2
     RETURNING ${TAG_SELECT}`,
    [Boolean(isActive), id],
  );
  return rows[0] ?? null;
}
