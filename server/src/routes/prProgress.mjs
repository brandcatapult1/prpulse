import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { assertStaffUser } from '../lib/permissions.mjs';
import {
  asOfLabel, buildPrProgressPdf, loadPrProgressCycles, loadPrProgressRows, progressScope, sortPrProgressRows,
} from '../lib/prProgress.mjs';

export const prProgressRouter = Router();
prProgressRouter.use(requireAuth, (req, res, next) => {
  try {
    assertStaffUser(req.user);
    next();
  } catch (err) {
    res.status(err.status ?? 403).json({ error: err.message });
  }
});

/** 'current' → { number: null }; a positive integer → { number }; anything else → null. */
function cycleParam(req) {
  if (req.query.cycle === 'current') return { number: null };
  const n = Number.parseInt(req.query.cycle, 10);
  return Number.isInteger(n) && n >= 1 ? { number: n } : null;
}

prProgressRouter.get('/cycles', async (req, res) => {
  try {
    res.json(await loadPrProgressCycles(pool, progressScope(req.user)));
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load cycles' });
  }
});

prProgressRouter.get('/', async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    const rows = await loadPrProgressRows(pool, cycle.number, progressScope(req.user));
    res.json({ cycle: cycle.number ?? 'current', as_of: asOfLabel(), rows });
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load PR progress' });
  }
});

prProgressRouter.get('/pdf', async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    const rows = sortPrProgressRows(
      await loadPrProgressRows(pool, cycle.number, progressScope(req.user)), req.query.sort, req.query.dir,
    );
    const { cycles } = await loadPrProgressCycles(pool, progressScope(req.user));
    const picked = cycles.find((c) => String(c.number) === String(req.query.cycle));
    const pdf = await buildPrProgressPdf({
      rows,
      cycleLabel: picked?.label ?? 'Current cycle',
      range: picked?.range ?? '',
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pr-progress-cycle-${req.query.cycle}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not export PDF' });
  }
});
