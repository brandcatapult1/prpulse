import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { assertStaffUser } from '../lib/permissions.mjs';
import {
  asOfLabel, buildPrProgressPdf, loadCampaignCreatorDeliverables, loadPrProgressCampaigns, loadPrProgressCycles, loadPrProgressRows, progressScope, sortPrProgressRows,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const campaignParam = (req) => (UUID_RE.test(req.query.campaign ?? '') ? req.query.campaign : null);

prProgressRouter.get('/campaigns', async (req, res) => {
  try {
    res.json(await loadPrProgressCampaigns(pool, progressScope(req.user)));
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load campaigns' });
  }
});

prProgressRouter.get('/campaigns/:id/creators', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid campaign' });
    res.json(await loadCampaignCreatorDeliverables(pool, req.params.id, progressScope(req.user)));
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load creators' });
  }
});

prProgressRouter.get('/cycles', async (req, res) => {
  try {
    res.json(await loadPrProgressCycles(pool, progressScope(req.user), campaignParam(req)));
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load cycles' });
  }
});

prProgressRouter.get('/', async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    const rows = await loadPrProgressRows(pool, cycle.number, progressScope(req.user), campaignParam(req));
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
      await loadPrProgressRows(pool, cycle.number, progressScope(req.user), campaignParam(req)), req.query.sort, req.query.dir,
    );
    const { cycles } = await loadPrProgressCycles(pool, progressScope(req.user), campaignParam(req));
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
