import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth, scopeArchived, scopeBlacklisted } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin, requireAdmin } from '../middleware/permissions.mjs';
import { findContactByMobile } from '../lib/mobileNumber.mjs';
import { applyContactPatch, loadContactDetail, CLASSIFICATION_VALUES } from '../lib/contactDetail.mjs';
import { createContactDeduped } from '../lib/contactCreate.mjs';
import { batchAddTagToContacts, batchSetContactStatus } from '../lib/contactBatch.mjs';
import { syncContactTags } from '../lib/contactTags.mjs';

export const contactsRouter = Router();

contactsRouter.get('/', requireAuth, async (req, res) => {
  const includeArchived = req.query.include_archived === 'true';
  const { rows } = await pool.query(
    `SELECT c.id, c.full_name, c.city, c.classification, c.status,
            c.is_blacklisted, c.mobile_number, c.contact_type,
            c.open_to_paid, c.open_to_barter,
            COALESCE(
              (
                SELECT array_agg(t.name ORDER BY t.name)
                FROM contact_tags ct
                JOIN tags t ON t.id = ct.tag_id
                WHERE ct.contact_id = c.id
              ),
              ARRAY[]::text[]
            ) AS tags
     FROM contacts c
     WHERE 1=1 ${scopeArchived(includeArchived)}
     ORDER BY c.full_name
     LIMIT 200`,
  );
  res.json(rows);
});

contactsRouter.get('/:id/engagements', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, cam.campaign_name, b.brand_name, u.full_name AS owner_name
     FROM engagements e
     JOIN campaigns cam ON cam.id = e.campaign_id
     JOIN brands b ON b.id = cam.brand_id
     JOIN users u ON u.id = e.assigned_manager
     WHERE e.contact_id = $1
     ORDER BY e.updated_at DESC`,
    [req.params.id],
  );
  res.json(rows);
});

contactsRouter.get('/:id', requireAuth, async (req, res) => {
  const contact = await loadContactDetail(pool, req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json(contact);
});

contactsRouter.post('/batch/set-status', requireAuth, async (req, res) => {
  try {
    const result = await withUserTransaction(req.user.id, async (client) =>
      batchSetContactStatus(client, req.body?.contact_ids, req.body?.status),
    );
    res.json(result);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Batch update failed' });
  }
});

contactsRouter.post('/batch/add-tag', requireAuth, async (req, res) => {
  try {
    const result = await withUserTransaction(req.user.id, async (client) =>
      batchAddTagToContacts(client, req.body?.contact_ids, req.body?.tag_id, {
        userId: req.user.id,
      }),
    );
    res.json(result);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Batch tag failed' });
  }
});

contactsRouter.post('/quick-add', requireAuth, async (req, res) => {
  const {
    full_name,
    mobile_number,
    mobile_country_code,
    instagram_url,
    city,
    country,
    classification,
    open_to_paid,
    open_to_barter,
    tag_ids,
  } = req.body;
  if (!full_name?.trim() || !mobile_number?.trim()) {
    return res.status(400).json({ error: 'Full name and mobile are required' });
  }

  if (classification != null && classification !== '' && !CLASSIFICATION_VALUES.includes(classification)) {
    return res.status(400).json({ error: 'Invalid classification' });
  }

  try {
    const contact = await withUserTransaction(req.user.id, async (client) => {
      const created = await createContactDeduped(client, {
        full_name,
        mobile_number,
        mobile_country_code: mobile_country_code ?? country ?? undefined,
        instagram_url: instagram_url ?? null,
        city: city ?? null,
        country: country ?? mobile_country_code ?? null,
        classification: classification || null,
        open_to_paid: Boolean(open_to_paid),
        open_to_barter: Boolean(open_to_barter),
        source: 'quick_add',
        created_by: req.user.id,
      });

      if (Array.isArray(tag_ids) && tag_ids.length > 0) {
        await syncContactTags(client, created.id, tag_ids, { userId: req.user.id });
      }

      return loadContactDetail(client, created.id);
    });

    res.status(201).json({ contact });
  } catch (err) {
    if (err.code === 'duplicate_contact') {
      return res.status(409).json({
        error: 'A contact with this mobile number already exists',
        existing: err.existing,
      });
    }
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not save contact' });
  }
});

contactsRouter.get('/lookup/mobile/:mobile', requireAuth, async (req, res) => {
  const raw = decodeURIComponent(req.params.mobile ?? '');
  const country = req.query.country ?? undefined;
  const { contact } = await findContactByMobile(pool, raw, country);
  res.json(contact ?? null);
});

contactsRouter.patch('/:id', requireAuth, async (req, res) => {
  try {
    const contact = await withUserTransaction(req.user.id, async (client) =>
      applyContactPatch(client, req.params.id, req.body, { userId: req.user.id }),
    );
    res.json(contact);
  } catch (err) {
    if (err.duplicate) {
      return res.status(409).json({
        error: err.message,
        duplicate: err.duplicate,
      });
    }
    res.status(err.status ?? 503).json({ error: err.message ?? 'Update failed' });
  }
});

contactsRouter.post('/:id/blacklist', requireAuth, requireSeniorOrAdmin, async (req, res) => {
  const { reason } = req.body ?? {};
  if (!reason?.trim()) return res.status(400).json({ error: 'Reason is required' });

  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      const contact = await client.query('SELECT id FROM contacts WHERE id = $1', [req.params.id]);
      if (!contact.rows[0]) throw Object.assign(new Error('Contact not found'), { status: 404 });

      await client.query(
        `UPDATE blacklist_records SET is_active = false, lifted_by = $2, lifted_at = now()
         WHERE contact_id = $1 AND is_active`,
        [req.params.id, req.user.id],
      );

      const { rows } = await client.query(
        `INSERT INTO blacklist_records (contact_id, reason, blacklisted_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [req.params.id, reason.trim(), req.user.id],
      );
      return rows[0];
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

contactsRouter.delete('/:id/blacklist', requireAuth, requireSeniorOrAdmin, async (req, res) => {
  try {
    await withUserTransaction(req.user.id, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE blacklist_records SET is_active = false, lifted_by = $2, lifted_at = now()
         WHERE contact_id = $1 AND is_active`,
        [req.params.id, req.user.id],
      );
      if (rowCount === 0) throw Object.assign(new Error('No active blacklist record'), { status: 404 });
    });
    res.status(204).end();
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

/** Hard delete — Admin only (PRD). Fails when engagements still reference the contact. */
contactsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await withUserTransaction(req.user.id, async (client) => {
      const { rowCount } = await client.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
      if (rowCount === 0) throw Object.assign(new Error('Contact not found'), { status: 404 });
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'Contact cannot be deleted while engagements or other records reference it',
      });
    }
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

contactsRouter.get('/population/campaign/:campaignId', requireAuth, async (req, res) => {
  const includeBlacklisted = req.query.include_blacklisted === 'true';
  const { rows } = await pool.query(
    `SELECT c.id, c.full_name, c.city, c.classification, c.is_blacklisted
     FROM contacts c
     WHERE c.status <> 'archived'
       ${scopeBlacklisted(includeBlacklisted)}
       AND NOT EXISTS (
         SELECT 1 FROM engagements e
         WHERE e.contact_id = c.id AND e.campaign_id = $1
       )
     ORDER BY c.full_name
     LIMIT 200`,
    [req.params.campaignId],
  );
  res.json(rows);
});
