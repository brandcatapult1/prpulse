import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth, scopeArchived, scopeBlacklisted } from '../middleware/auth.mjs';

export const contactsRouter = Router();

contactsRouter.get('/', requireAuth, async (req, res) => {
  const includeArchived = req.query.include_archived === 'true';
  const { rows } = await pool.query(
    `SELECT c.id, c.full_name, c.city, c.classification, c.status,
            c.is_blacklisted, c.mobile_number, c.contact_type
     FROM contacts c
     WHERE 1=1 ${scopeArchived(includeArchived)}
     ORDER BY c.full_name
     LIMIT 200`,
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
