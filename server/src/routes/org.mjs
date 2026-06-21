import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export const orgRouter = Router();

orgRouter.get('/branding', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT logo_url FROM org_settings WHERE id = 1');
    res.json({ logo_url: rows[0]?.logo_url ?? null });
  } catch (err) {
    if (err.code === '42P01') return res.json({ logo_url: null });
    res.status(503).json({ error: 'Could not load branding' });
  }
});
