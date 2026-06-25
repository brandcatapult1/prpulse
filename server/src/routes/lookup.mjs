import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { ensureReferenceData } from '../lib/referenceData.mjs';
import { loadCities } from '../lib/cities.mjs';
import { loadCategories } from '../lib/categories.mjs';

export const lookupRouter = Router();

lookupRouter.use(requireAuth);

lookupRouter.get('/tags', async (_req, res) => {
  try {
    await ensureReferenceData(pool);
    const { rows } = await pool.query(
      `SELECT id, name, created_at FROM tags ORDER BY name`,
    );
    res.json(rows);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load tags' });
  }
});

lookupRouter.get('/categories', async (_req, res) => {
  try {
    const categories = await loadCategories(pool);
    res.json(categories);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load categories' });
  }
});

lookupRouter.get('/cities', async (req, res) => {
  try {
    const cities = await loadCities(pool, { country: req.query.country });
    res.json(cities);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load cities' });
  }
});
