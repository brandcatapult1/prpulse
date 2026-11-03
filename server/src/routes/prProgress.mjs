import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { assertStaffUser } from '../lib/permissions.mjs';
import {
  asOfLabel, buildPrProgressPdf, buildPrProgressTeamPdf, loadPrProgressTeamRows, sortTeamRows, loadCampaignCreatorDeliverables, loadPrProgressCampaigns, loadPrProgressManagers, loadPrProgressCycles, loadPrProgressRows, progressScope, sortPrProgressRows,
} from '../lib/prProgress.mjs';

export const prProgressRouter = Router();
prProgressRouter.use(requireAuth, (req, res, next) => {
  try {
    assertStaffUser(req.user);
    if (progressScope(req.user) !== null) {
      return res.status(403).json({ error: 'Reports are for admins and senior managers only' });
    }
    next();
  } catch (err) {
    res.status(err.status ?? 403).json({ error: err.message });
  }
});

/** 'current' / 'previous' → the running cycle or the one before it (number null); a number → that cycle. */
function cycleParam(req) {
  if (req.query.cycle === 'current') return { number: null, back: 0 };
  if (req.query.cycle === 'previous') return { number: null, back: 1 };
  const n = Number.parseInt(req.query.cycle, 10);
  return Number.isInteger(n) && n >= 1 ? { number: n, back: 0 } : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const campaignParam = (req) => (UUID_RE.test(req.query.campaign ?? '') ? req.query.campaign : null);

/** Account-manager filter is for admins and senior managers only. */
const managerParam = (req) =>
  progressScope(req.user) === null && UUID_RE.test(req.query.manager ?? '') ? req.query.manager : null;

const prevParam = (req) => (/^\d{4}-\d{2}-\d{2}$/.test(req.query.prev ?? '') ? req.query.prev : null);
const beforeParam = (req) => (/^\d{4}-\d{2}-\d{2}$/.test(req.query.before ?? '') ? req.query.before : null);

const creatorParam = (req) => {
  const q = String(req.query.creator ?? '').trim().slice(0, 80);
  return q || null;
};

prProgressRouter.get('/managers', async (req, res) => {
  try {
    if (progressScope(req.user) !== null) return res.json([]);
    res.json(await loadPrProgressManagers(pool, null, campaignParam(req)));
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load account managers' });
  }
});

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
    res.json(await loadCampaignCreatorDeliverables(pool, req.params.id, progressScope(req.user), managerParam(req), creatorParam(req), beforeParam(req), prevParam(req)));
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
    const rows = await loadPrProgressRows(pool, cycle.number, progressScope(req.user), campaignParam(req), managerParam(req), creatorParam(req), cycle.back);
    res.json({ cycle: cycle.number ?? (cycle.back ? 'previous' : 'current'), as_of: asOfLabel(), rows });
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load PR progress' });
  }
});

/** Team view: one row per account manager (admins and senior managers only). */
function teamGuard(req, res, next) {
  if (progressScope(req.user) !== null) return res.status(403).json({ error: 'Only admins and senior managers can view the team report' });
  next();
}

prProgressRouter.get('/team', teamGuard, async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    res.json({ cycle: cycle.number ?? 'current', as_of: asOfLabel(), rows: await loadPrProgressTeamRows(pool, cycle.number, cycle.back) });
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load team progress' });
  }
});

prProgressRouter.get('/team/pdf', teamGuard, async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    const rows = sortTeamRows(await loadPrProgressTeamRows(pool, cycle.number, cycle.back), req.query.sort, req.query.dir);
    const { cycles } = await loadPrProgressCycles(pool, null, null);
    const picked = cycles.find((c) => String(c.number) === String(req.query.cycle));
    const pdf = await buildPrProgressTeamPdf({ rows, cycleLabel: picked?.label ?? 'Current cycle', range: picked?.range ?? '' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pr-progress-team-cycle-${req.query.cycle}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not export PDF' });
  }
});

prProgressRouter.get('/pdf', async (req, res) => {
  try {
    const cycle = cycleParam(req);
    if (!cycle) return res.status(400).json({ error: 'Select a cycle' });
    const rows = sortPrProgressRows(
      await loadPrProgressRows(pool, cycle.number, progressScope(req.user), campaignParam(req), managerParam(req), creatorParam(req), cycle.back), req.query.sort, req.query.dir,
    );
    // Campaigns that were expanded on screen get their creator-wise deliverables in the PDF too.
    const expanded = new Set(String(req.query.expanded ?? '').split(',').filter((id) => UUID_RE.test(id)).slice(0, 100));
    for (const row of rows) {
      if (expanded.has(row.id)) {
        row.details = await loadCampaignCreatorDeliverables(
          pool, row.id, progressScope(req.user), managerParam(req), creatorParam(req), row.cycle_start, row.prev_start,
        );
      }
    }
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
