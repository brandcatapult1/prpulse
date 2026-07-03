import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin } from '../middleware/permissions.mjs';
import {
  createTag,
  findTagById,
  listTags,
  parseTagName,
  parseTagType,
  renameTag,
  setTagActive,
} from '../lib/tagsAdmin.mjs';

export const tagsRouter = Router();

tagsRouter.use(requireAuth, requireSeniorOrAdmin);

/** GET /api/tags — active tags by default; ?includeArchived=true for all. */
tagsRouter.get('/', async (req, res) => {
  const includeArchived =
    req.query.includeArchived === 'true' || req.query.includeArchived === '1';
  try {
    const rows = await listTags(pool, { includeArchived });
    res.json(rows);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load tags' });
  }
});

/** POST /api/tags — create tag { name, type }. */
tagsRouter.post('/', async (req, res) => {
  let name;
  let type;
  try {
    name = parseTagName(req.body?.name);
    type = parseTagType(req.body?.type);
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  try {
    const row = await createTag(pool, {
      name,
      type,
      createdBy: req.user.id,
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not create tag' });
  }
});

/**
 * PATCH /api/tags/:id
 * Rename: { name }
 * Archive / unarchive: { is_active: false | true }
 * No hard-delete.
 */
tagsRouter.patch('/:id', async (req, res) => {
  const id = req.params.id;
  const body = req.body ?? {};
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasActive = Object.prototype.hasOwnProperty.call(body, 'is_active');

  if (!hasName && !hasActive) {
    return res.status(400).json({ error: 'Provide name and/or is_active' });
  }

  try {
    const existing = await findTagById(pool, id);
    if (!existing) return res.status(404).json({ error: 'Tag not found' });

    let row = existing;

    if (hasName) {
      const name = parseTagName(body.name);
      row = await renameTag(pool, id, name);
      if (!row) return res.status(404).json({ error: 'Tag not found' });
    }

    if (hasActive) {
      if (typeof body.is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active must be a boolean' });
      }
      row = await setTagActive(pool, id, body.is_active);
      if (!row) return res.status(404).json({ error: 'Tag not found' });
    }

    res.json(row);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not update tag' });
  }
});
