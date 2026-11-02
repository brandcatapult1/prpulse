import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin } from '../middleware/permissions.mjs';
import {
  asOfLabel, buildPrProgressPdf, loadPrProgressCycles, loadPrProgressRows, sortPrProgressRows,
} from '../lib/prProgress.mjs';

export const prProgressRouter = Router();
prProgressRouter.use(requireAuth, requireSeniorOrAdmin);

function cycleParam(req) {
  const n = Number.parseInt(req.query.cycle, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

prProgressRouter.get('/cycles', async (_req, res) => {
  try {
    res.json(await loadPrProgressCycles(pool));
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load cycles' });
  }
});

prProgressRouter.get('/', async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    const rows = await loadPrProgressRows(pool, cycle);
    res.json({ cycle, as_of: asOfLabel(), rows });
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load PR progress' });
  }
});

prProgressRouter.get('/pdf', async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    const rows = sortPrProgressRows(await loadPrProgressRows(pool, cycle), req.query.sort, req.query.dir);
    const pdf = await buildPrProgressPdf({ rows, cycleNumber: cycle });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pr-progress-cycle-${cycle}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not export PDF' });
  }
});
