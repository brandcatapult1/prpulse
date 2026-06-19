import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export const importRouter = Router();

function requireImportRole(req, res, next) {
  if (!['admin', 'senior_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Senior Manager or Admin access required' });
  }
  return next();
}

importRouter.post('/contacts', requireAuth, requireImportRole, async (req, res) => {
  const rows = req.body?.rows ?? req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array required' });
  }

  try {
    const created = await withUserTransaction(req.user.id, async (client) => {
      const results = [];
      for (const row of rows) {
        const { full_name, mobile_number, city, instagram_url } = row;
        if (!full_name?.trim() || !mobile_number?.trim()) continue;

        const dup = await client.query(
          'SELECT id FROM contacts WHERE mobile_number = $1 LIMIT 1',
          [mobile_number.trim()],
        );
        if (dup.rows[0]) continue;

        const { rows: inserted } = await client.query(
          `INSERT INTO contacts (full_name, mobile_number, city, instagram_url, source, created_by)
           VALUES ($1, $2, $3, $4, 'bulk_upload', $5)
           RETURNING id, full_name, mobile_number, city, status`,
          [full_name.trim(), mobile_number.trim(), city ?? null, instagram_url ?? null, req.user.id],
        );
        if (inserted[0]) results.push(inserted[0]);
      }
      return results;
    });
    res.status(201).json({ imported: created.length, contacts: created });
  } catch (err) {
    console.warn('Contact import failed:', err.message ?? err);
    res.status(503).json({ error: 'Import failed' });
  }
});

importRouter.post('/campaigns', requireAuth, requireImportRole, async (req, res) => {
  const rows = req.body?.rows ?? req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array required' });
  }

  try {
    const created = await withUserTransaction(req.user.id, async (client) => {
      const results = [];
      for (const row of rows) {
        const { campaign_name, brand_id, target_collaborations, status } = row;
        if (!campaign_name?.trim() || !brand_id) continue;

        const { rows: inserted } = await client.query(
          `INSERT INTO campaigns (campaign_name, brand_id, target_collaborations, status, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, campaign_name, status`,
          [
            campaign_name.trim(),
            brand_id,
            target_collaborations ?? null,
            status ?? 'draft',
            req.user.id,
          ],
        );
        if (inserted[0]) results.push(inserted[0]);
      }
      return results;
    });
    res.status(201).json({ imported: created.length, campaigns: created });
  } catch (err) {
    console.warn('Campaign import failed:', err.message ?? err);
    res.status(503).json({ error: 'Import failed' });
  }
});
