import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireCampaignWriteAccess, requireStaffRole } from '../middleware/permissions.mjs';
import { assertCreatorAssignedForCampaignManager } from '../lib/permissions.mjs';
import { listActivityEventsForCampaign } from '../lib/activityEvents.mjs';
import {
  applyCampaignPatch,
  assignCampaignTagsOnCreate,
  loadCampaignDetail,
} from '../lib/campaignDetail.mjs';
import {
  parseRequiredTargetCollaborations,
  parseTermMonths,
} from '../lib/campaignValidation.mjs';
import { ensureCampaignCycles } from '../lib/campaignCycles.mjs';

export const campaignsRouter = Router();

campaignsRouter.get('/', requireAuth, async (req, res) => {
  let query = `
    SELECT cam.*, b.brand_name
    FROM campaigns cam
    JOIN brands b ON b.id = cam.brand_id
    WHERE cam.status <> 'archived'
  `;
  const params = [];

  if (req.user.role === 'campaign_manager') {
    params.push(req.user.id);
    query += ` AND EXISTS (
      SELECT 1 FROM campaign_managers cm
      WHERE cm.campaign_id = cam.id AND cm.user_id = $1
    )`;
  }

  query += ' ORDER BY cam.created_at DESC LIMIT 100';
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

campaignsRouter.get('/assignable-managers', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, role FROM users
       WHERE is_active AND role IN ('campaign_manager', 'senior_manager', 'admin')
       ORDER BY full_name`,
    );
    res.json(rows);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load managers' });
  }
});

campaignsRouter.post('/', requireAuth, requireStaffRole, async (req, res) => {
  const {
    campaign_name,
    brand_id,
    campaign_type,
    start_date,
    end_date,
    target_collaborations,
    term_months,
    status,
    manager_ids,
  } = req.body ?? {};
  if (!campaign_name?.trim() || !brand_id) {
    return res.status(400).json({ error: 'Campaign name and brand are required' });
  }

  const allowedTypes = new Set(['monthly', 'project']);
  if (!allowedTypes.has(campaign_type)) {
    return res.status(400).json({ error: 'Campaign type is required (monthly or project)' });
  }
  if (!start_date) {
    return res.status(400).json({ error: 'Start date is required' });
  }
  if (campaign_type === 'project') {
    if (!end_date) {
      return res.status(400).json({ error: 'End date is required for one-time projects' });
    }
    if (end_date < start_date) {
      return res.status(400).json({ error: 'End date must be on or after start date' });
    }
  }

  const allowedStatuses = new Set(['draft', 'active', 'paused', 'completed', 'archived']);
  const campaignStatus = allowedStatuses.has(status) ? status : 'draft';

  let target;
  let storedTermMonths;
  try {
    target = parseRequiredTargetCollaborations(target_collaborations);
    storedTermMonths = parseTermMonths(term_months, campaign_type);
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  const storedEndDate = campaign_type === 'project' ? end_date : null;

  const managerIdSet = new Set(
    Array.isArray(manager_ids) ? manager_ids.filter(Boolean).map(String) : [],
  );
  managerIdSet.add(String(req.user.id));

  try {
    assertCreatorAssignedForCampaignManager(req.user, [...managerIdSet]);
    const row = await withUserTransaction(req.user.id, async (client) => {
      const brand = await client.query('SELECT id, brand_name FROM brands WHERE id = $1', [brand_id]);
      if (!brand.rows[0]) throw Object.assign(new Error('Brand not found'), { status: 404 });

      const { rows: validManagers } = await client.query(
        `SELECT id FROM users
         WHERE id = ANY($1::uuid[])
           AND is_active
           AND role IN ('campaign_manager', 'senior_manager', 'admin')`,
        [[...managerIdSet]],
      );
      if (validManagers.length === 0) {
        throw Object.assign(new Error('Select at least one account manager'), { status: 400 });
      }

      const { rows } = await client.query(
        `INSERT INTO campaigns (
           campaign_name, brand_id, campaign_type, start_date, end_date,
           target_collaborations, term_months, status, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          campaign_name.trim(),
          brand_id,
          campaign_type,
          start_date,
          storedEndDate,
          target,
          storedTermMonths,
          campaignStatus,
          req.user.id,
        ],
      );

      for (const { id: managerId } of validManagers) {
        await client.query(
          `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [rows[0].id, managerId],
        );
      }

      const tagIds = Array.isArray(req.body?.tag_ids) ? req.body.tag_ids.filter(Boolean) : [];
      await assignCampaignTagsOnCreate(client, rows[0].id, tagIds);

      await ensureCampaignCycles(client, {
        id: rows[0].id,
        campaign_type: rows[0].campaign_type,
        start_date: rows[0].start_date,
        end_date: rows[0].end_date,
        term_months: rows[0].term_months,
        target_collaborations: rows[0].target_collaborations,
      });
      await client.query('SELECT recompute_campaign_metrics($1::uuid)', [rows[0].id]);

      return loadCampaignDetail(client, rows[0].id);
    });

    res.status(201).json(row);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not create campaign' });
  }
});

campaignsRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const campaign = await withUserTransaction(req.user.id, async (client) =>
      loadCampaignDetail(client, req.params.id),
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not load campaign' });
  }
});

campaignsRouter.patch('/:id', requireAuth, requireCampaignWriteAccess('id'), async (req, res) => {
  try {
    const campaign = await withUserTransaction(req.user.id, async (client) =>
      applyCampaignPatch(client, req.params.id, req.body, req.user),
    );
    res.json(campaign);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Update failed' });
  }
});

campaignsRouter.get('/:id/activity-events', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM campaigns WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });

  const events = await listActivityEventsForCampaign(pool, req.params.id);
  res.json(events);
});

campaignsRouter.post('/:id/populate', requireAuth, requireCampaignWriteAccess('id'), async (req, res) => {
  const { contact_ids = [], assigned_manager } = req.body;
  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return res.status(400).json({ error: 'contact_ids required' });
  }

  const managerId = assigned_manager ?? req.user.id;
  const created = await withUserTransaction(req.user.id, async (client) => {
    const results = [];
    for (const contactId of contact_ids) {
      const { rows } = await client.query(
        `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (contact_id, campaign_id) DO NOTHING
         RETURNING *`,
        [contactId, req.params.id, managerId, req.user.id],
      );
      if (rows[0]) results.push(rows[0]);
    }
    return results;
  });

  const createdIds = new Set(created.map((row) => String(row.contact_id)));
  const skipped = contact_ids.filter((id) => !createdIds.has(String(id)));

  res.status(201).json({ created, skipped });
});
