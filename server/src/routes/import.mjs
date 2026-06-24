import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin } from '../middleware/permissions.mjs';
import { findContactByMobile, normalizeMobileToE164 } from '../lib/mobileNumber.mjs';

export const importRouter = Router();

function requireImportRole(req, res, next) {
  return requireSeniorOrAdmin(req, res, next);
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

        const e164 = normalizeMobileToE164(mobile_number);
        if (!e164) continue;

        const { contact: dup } = await findContactByMobile(client, mobile_number);
        if (dup) continue;

        const { rows: inserted } = await client.query(
          `INSERT INTO contacts (full_name, mobile_number, city, instagram_url, source, created_by)
           VALUES ($1, $2, $3, $4, 'bulk_upload', $5)
           RETURNING id, full_name, mobile_number, city, status`,
          [full_name.trim(), e164, city ?? null, instagram_url ?? null, req.user.id],
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
