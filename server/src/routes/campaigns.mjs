import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { listActivityEventsForCampaign } from '../lib/activityEvents.mjs';

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

campaignsRouter.post('/', requireAuth, async (req, res) => {
  const { campaign_name, brand_id, target_collaborations, status } = req.body ?? {};
  if (!campaign_name?.trim() || !brand_id) {
    return res.status(400).json({ error: 'Campaign name and brand are required' });
  }

  const allowedStatuses = new Set(['draft', 'active', 'paused', 'completed', 'archived']);
  const campaignStatus = allowedStatuses.has(status) ? status : 'draft';
  const target =
    target_collaborations === '' || target_collaborations == null
      ? null
      : Number(target_collaborations);

  if (target != null && (Number.isNaN(target) || target < 0)) {
    return res.status(400).json({ error: 'Target collaborations must be a non-negative number' });
  }

  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      const brand = await client.query('SELECT id, brand_name FROM brands WHERE id = $1', [brand_id]);
      if (!brand.rows[0]) throw Object.assign(new Error('Brand not found'), { status: 404 });

      const { rows } = await client.query(
        `INSERT INTO campaigns (campaign_name, brand_id, target_collaborations, status, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [campaign_name.trim(), brand_id, target, campaignStatus, req.user.id],
      );

      await client.query(
        `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [rows[0].id, req.user.id],
      );

      return { ...rows[0], brand_name: brand.rows[0].brand_name };
    });

    res.status(201).json(row);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not create campaign' });
  }
});

campaignsRouter.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cam.*, b.brand_name
     FROM campaigns cam
     JOIN brands b ON b.id = cam.brand_id
     WHERE cam.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });
  res.json(rows[0]);
});

campaignsRouter.get('/:id/activity-events', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM campaigns WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });

  const events = await listActivityEventsForCampaign(pool, req.params.id);
  res.json(events);
});

campaignsRouter.post('/:id/populate', requireAuth, async (req, res) => {
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
