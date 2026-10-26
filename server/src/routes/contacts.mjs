import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin, requireAdmin } from '../middleware/permissions.mjs';
import { findContactByMobile } from '../lib/mobileNumber.mjs';
import { applyContactPatch, loadContactDetail, CLASSIFICATION_VALUES } from '../lib/contactDetail.mjs';
import { createContactDeduped } from '../lib/contactCreate.mjs';
import { batchAddTagToContacts, batchSetContactStatus, batchSetPrimaryCategory } from '../lib/contactBatch.mjs';
import { syncContactTags } from '../lib/contactTags.mjs';
import { loadCreatorStats } from '../lib/creatorStats.mjs';
import {
  buildRequestMessage,
  connectConfigured,
  connectLink,
  loadConnection,
  mailtoUrl,
  publicConnection,
  whatsappUrl,
} from '../lib/instagramConnect.mjs';
import { fetchLatestInstagramMedia, syncContactSocial, syncProviders } from '../lib/socialSync.mjs';
import { listContactsPaginated, listPopulationContactsPaginated } from '../lib/contactList.mjs';

export const contactsRouter = Router();

contactsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const result = await listContactsPaginated(pool, req.query);
    res.json(result);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Could not load contacts' });
  }
});

contactsRouter.get('/:id/engagements', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, cam.campaign_name, b.brand_name, u.full_name AS owner_name,
            COALESCE((SELECT SUM(d.posted_quantity) FROM deliverables d WHERE d.engagement_id = e.id), 0)::int AS deliverables_posted,
            COALESCE((SELECT SUM(d.quantity) FROM deliverables d WHERE d.engagement_id = e.id), 0)::int AS deliverables_total
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

contactsRouter.get('/instagram-latest/:handle', requireAuth, async (req, res) => {
  try {
    const handle = String(req.params.handle).replace(/[^A-Za-z0-9._]/g, '');
    res.json(await fetchLatestInstagramMedia(handle, Math.min(Number(req.query.limit) || 12, 50)));
  } catch (err) {
    res.status(err.status ?? 502).json({ error: err.message ?? 'Instagram lookup failed' });
  }
});

async function requestInfo(contactId) {
  const { rows: [c] } = await pool.query(
    'SELECT id, full_name, mobile_number, email FROM contacts WHERE id = $1', [contactId]);
  if (!c) throw Object.assign(new Error('Contact not found'), { status: 404 });
  if (!connectConfigured()) return { configured: false, link: null, message: null, whatsapp_url: null, mailto_url: null };
  const link = connectLink(contactId);
  const message = buildRequestMessage({ name: c.full_name, link });
  return {
    configured: true,
    link,
    message,
    whatsapp_url: whatsappUrl(c.mobile_number, message),
    mailto_url: mailtoUrl(c.email, message),
  };
}

async function creatorStatsPayload(contactId) {
  const stats = await loadCreatorStats(pool, contactId);
  const connection = publicConnection(await loadConnection(pool, contactId));
  const { rows: requests } = await pool.query(
    `SELECT r.channel, r.requested_at, u.full_name AS requested_by_name
     FROM creator_instagram_requests r LEFT JOIN users u ON u.id = r.requested_by
     WHERE r.contact_id = $1 ORDER BY r.requested_at DESC LIMIT 5`, [contactId]);
  return {
    ...stats,
    instagram_connection: connection,
    instagram_requests: requests,
    instagram_request: await requestInfo(contactId),
    sync_available: syncProviders(),
  };
}

contactsRouter.get('/:id/creator-stats', requireAuth, async (req, res) => {
  try {
    res.json(await creatorStatsPayload(req.params.id));
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Could not load creator stats' });
  }
});

/** Record that a request was sent (WhatsApp / email / copied link). */
contactsRouter.post('/:id/instagram-request', requireAuth, async (req, res) => {
  const channel = ['whatsapp', 'email', 'link'].includes(req.body?.channel) ? req.body.channel : null;
  if (!channel) return res.status(400).json({ error: 'channel must be whatsapp, email or link' });
  try {
    await pool.query(
      `INSERT INTO creator_instagram_requests (contact_id, channel, requested_by) VALUES ($1,$2,$3)`,
      [req.params.id, channel, req.user.id]);
    res.json(await creatorStatsPayload(req.params.id));
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not record request' });
  }
});

/** Links for a selection of creators (nothing is recorded until a request is actually sent). */
contactsRouter.post('/batch/instagram-links', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.contact_ids) ? req.body.contact_ids.slice(0, 200) : [];
  if (!ids.length) return res.status(400).json({ error: 'contact_ids required' });
  if (!connectConfigured()) return res.status(503).json({ error: 'Instagram connect is not set up on the server' });
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.full_name, c.mobile_number, c.email,
              (SELECT status FROM creator_instagram_connections k WHERE k.contact_id = c.id) AS connection_status
       FROM contacts c WHERE c.id = ANY($1::uuid[]) ORDER BY c.full_name`, [ids]);
    res.json(rows.map((c) => {
      const message = buildRequestMessage({ name: c.full_name, link: connectLink(c.id) });
      return {
        id: c.id,
        full_name: c.full_name,
        connection_status: c.connection_status,
        whatsapp_url: whatsappUrl(c.mobile_number, message),
        mailto_url: mailtoUrl(c.email, message),
        message,
      };
    }));
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not build links' });
  }
});

contactsRouter.delete('/:id/instagram-connection', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM creator_instagram_connections WHERE contact_id = $1', [req.params.id]);
    res.json(await creatorStatsPayload(req.params.id));
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Could not disconnect' });
  }
});

contactsRouter.post('/:id/creator-stats/sync', requireAuth, async (req, res) => {
  try {
    const result = await syncContactSocial(pool, req.params.id);
    res.json({ result, ...(await creatorStatsPayload(req.params.id)) });
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Sync failed' });
  }
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

contactsRouter.post('/batch/set-primary-category', requireAuth, async (req, res) => {
  try {
    const result = await withUserTransaction(req.user.id, async (client) =>
      batchSetPrimaryCategory(client, req.body?.contact_ids, req.body?.primary_category_id),
    );
    res.json(result);
  } catch (err) {
    res.status(err.status ?? 503).json({ error: err.message ?? 'Batch category update failed' });
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
    primary_category_id,
    reel_rate,
    story_rate,
    post_rate,
    other_rate,
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
        primary_category_id: primary_category_id || null,
        open_to_paid: Boolean(open_to_paid),
        open_to_barter: Boolean(open_to_barter),
        reel_rate,
        story_rate,
        post_rate,
        other_rate,
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
  try {
    const result = await listPopulationContactsPaginated(pool, req.params.campaignId, req.query);
    res.json(result);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Could not load creators' });
  }
});
