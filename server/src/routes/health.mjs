import { Router } from 'express';
import { pool } from '../db.mjs';

export const healthRouter = Router();

/**
 * Render liveness probe — must return 2xx while the Node process is up.
 * DB connectivity is reported in the body but must not fail the probe; Neon cold
 * starts and transient network blips otherwise mark the instance as failed.
 */
healthRouter.get('/', async (_req, res) => {
  let db = 'missing';
  if (!process.env.DATABASE_URL) {
    db = 'not_configured';
  } else {
    try {
      await pool.query('SELECT 1');
      db = 'connected';
    } catch {
      db = 'unreachable';
    }
  }

  res.json({
    ok: true,
    service: 'pr-pulse',
    db,
    time: new Date().toISOString(),
  });
});

/** Optional readiness check for ops — returns 503 when the database is required but down. */
healthRouter.get('/ready', async (_req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ ok: false, error: 'DATABASE_URL not configured' });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'pr-pulse', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, error: 'Database unreachable' });
  }
});
