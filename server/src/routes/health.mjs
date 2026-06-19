import { Router } from 'express';
import { pool } from '../db.mjs';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'pr-pulse', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, error: 'Database unreachable' });
  }
});
