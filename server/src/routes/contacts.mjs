import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth, scopeArchived, scopeBlacklisted } from '../middleware/auth.mjs';

export const contactsRouter = Router();

contactsRouter.get('/', requireAuth, async (req, res) => {
  const includeArchived = req.query.include_archived === 'true';
  const { rows } = await pool.query(
    `SELECT c.id, c.full_name, c.city, c.classification, c.status,
            c.is_blacklisted, c.mobile_number, c.contact_type,
            c.open_to_paid, c.open_to_barter
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
  const { rows } = await pool.query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Contact not found' });
  res.json(rows[0]);
});

contactsRouter.post('/quick-add', requireAuth, async (req, res) => {
  const { full_name, mobile_number, instagram_url, city } = req.body;
  if (!full_name || !mobile_number) {
    return res.status(400).json({ error: 'Full name and mobile are required' });
  }

  const dup = await pool.query(
    'SELECT id, full_name FROM contacts WHERE mobile_number = $1 LIMIT 1',
    [mobile_number],
  );

  const contact = await withUserTransaction(req.user.id, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO contacts (full_name, mobile_number, instagram_url, city, source, created_by)
       VALUES ($1, $2, $3, $4, 'quick_add', $5)
       RETURNING *`,
      [full_name, mobile_number, instagram_url ?? null, city ?? null, req.user.id],
    );
    return rows[0];
  });

  res.status(201).json({
    contact,
    duplicate_warning: dup.rows[0]
      ? { id: dup.rows[0].id, full_name: dup.rows[0].full_name }
      : null,
  });
});

contactsRouter.get('/lookup/mobile/:mobile', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, full_name FROM contacts WHERE mobile_number = $1 LIMIT 1',
    [req.params.mobile],
  );
  res.json(rows[0] ?? null);
});

contactsRouter.patch('/:id', requireAuth, async (req, res) => {
  const allowed = ['full_name', 'email', 'city', 'instagram_url', 'youtube_url', 'notes'];
  const patch = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, key)) {
      patch[key] = req.body[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const sets = [];
    const params = [req.params.id];
    let idx = 2;
    for (const [key, value] of Object.entries(patch)) {
      sets.push(`${key} = $${idx}`);
      params.push(value);
      idx += 1;
    }
    const { rows } = await pool.query(
      `UPDATE contacts SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Contact not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Update failed' });
  }
});

contactsRouter.post('/:id/blacklist', requireAuth, async (req, res) => {
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

contactsRouter.delete('/:id/blacklist', requireAuth, async (req, res) => {
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
