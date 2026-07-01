import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import {
  assertCanViewCampaignReport,
  assertCanViewCycleReport,
  listAccessibleCampaignIds,
} from '../lib/reportAccess.mjs';
import { loadCampaignCyclesForReport, loadCycleReport } from '../lib/cycleReport.mjs';
import { ensureCampaignCycles } from '../lib/campaignCycles.mjs';

export const reportsRouter = Router();

reportsRouter.get('/brands', requireAuth, async (req, res) => {
  try {
    const campaignIds = await listAccessibleCampaignIds(pool, req.user);
    if (!campaignIds.length) {
      return res.json([]);
    }

    const { rows } = await pool.query(
      `SELECT b.id, b.brand_name,
              count(DISTINCT cam.id)::int AS campaign_count
       FROM brands b
       JOIN campaigns cam ON cam.brand_id = b.id
       WHERE cam.id = ANY($1::uuid[])
         AND cam.status <> 'archived'
       GROUP BY b.id, b.brand_name
       ORDER BY b.brand_name`,
      [campaignIds],
    );
    res.json(rows);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not load clients' });
  }
});

reportsRouter.get('/brands/:brandId/campaigns', requireAuth, async (req, res) => {
  try {
    const campaignIds = await listAccessibleCampaignIds(pool, req.user);
    if (!campaignIds.length) {
      return res.json([]);
    }

    const { rows } = await pool.query(
      `SELECT cam.id, cam.campaign_name, cam.campaign_type, cam.term_months, cam.start_date
       FROM campaigns cam
       WHERE cam.brand_id = $1::uuid
         AND cam.id = ANY($2::uuid[])
         AND cam.status <> 'archived'
       ORDER BY cam.campaign_name`,
      [req.params.brandId, campaignIds],
    );
    res.json(rows);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not load campaigns' });
  }
});

reportsRouter.get('/campaigns/:campaignId/cycles', requireAuth, async (req, res) => {
  try {
    await assertCanViewCampaignReport(pool, req.user, req.params.campaignId);

    const { rows: campaigns } = await pool.query(
      `SELECT * FROM campaigns WHERE id = $1::uuid`,
      [req.params.campaignId],
    );
    if (!campaigns[0]) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureCampaignCycles(client, campaigns[0]);
      const { cycles, current_cycle } = await loadCampaignCyclesForReport(
        client,
        req.params.campaignId,
      );
      await client.query('COMMIT');
      res.json({ cycles, current_cycle });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not load cycles' });
  }
});

reportsRouter.get('/cycles/:cycleId', requireAuth, async (req, res) => {
  try {
    await assertCanViewCycleReport(pool, req.user, req.params.cycleId);
    const report = await loadCycleReport(pool, req.params.cycleId);
    if (!report) {
      return res.status(404).json({ error: 'Cycle not found' });
    }
    res.json(report);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not load report' });
  }
});
