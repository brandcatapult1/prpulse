import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

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

  res.status(201).json(created);
});
