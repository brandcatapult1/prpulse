import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export const brandsRouter = Router();

const SELECT_FIELDS = `
  b.id, b.brand_name, b.brand_category, b.logo_path AS logo_label,
  b.primary_contact, b.contact_email, b.is_active,
  b.account_manager AS account_manager_id,
  u.full_name AS account_manager_name,
  (SELECT count(*)::int FROM campaigns c WHERE c.brand_id = b.id AND c.status <> 'archived') AS campaign_count
`;

brandsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS}
       FROM brands b
       LEFT JOIN users u ON u.id = b.account_manager
       ORDER BY b.brand_name
       LIMIT 200`,
    );
    res.json(rows);
  } catch (err) {
    console.warn('Brand list failed:', err.message ?? err);
    res.json([]);
  }
});

brandsRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS}
       FROM brands b
       LEFT JOIN users u ON u.id = b.account_manager
       WHERE b.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Brand not found' });

    const { rows: campaigns } = await pool.query(
      `SELECT id, campaign_name, status, target_collaborations, completed_collaborations, campaign_health
       FROM campaigns
       WHERE brand_id = $1 AND status <> 'archived'
       ORDER BY created_at DESC`,
      [req.params.id],
    );

    res.json({ ...rows[0], campaigns });
  } catch (err) {
    console.warn('Brand get failed:', err.message ?? err);
    res.status(503).json({ error: 'Brand unavailable' });
  }
});

brandsRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!['admin', 'senior_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Senior Manager or Admin access required' });
  }

  const {
    brand_name,
    brand_category,
    logo_label,
    primary_contact,
    contact_email,
    account_manager_id,
    is_active,
  } = req.body ?? {};

  try {
    const { rows } = await pool.query(
      `UPDATE brands SET
        brand_name = COALESCE($1, brand_name),
        brand_category = COALESCE($2, brand_category),
        logo_path = COALESCE($3, logo_path),
        primary_contact = COALESCE($4, primary_contact),
        contact_email = COALESCE($5, contact_email),
        account_manager = COALESCE($6, account_manager),
        is_active = COALESCE($7, is_active),
        updated_at = now()
       WHERE id = $8
       RETURNING id, brand_name, brand_category, logo_path AS logo_label,
         primary_contact, contact_email, is_active,
         account_manager AS account_manager_id`,
      [
        brand_name ?? null,
        brand_category ?? null,
        logo_label ?? null,
        primary_contact ?? null,
        contact_email ?? null,
        account_manager_id ?? null,
        is_active ?? null,
        req.params.id,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Brand not found' });

    let account_manager_name = null;
    if (rows[0].account_manager_id) {
      const { rows: mgr } = await pool.query(
        'SELECT full_name FROM users WHERE id = $1',
        [rows[0].account_manager_id],
      );
      account_manager_name = mgr[0]?.full_name ?? null;
    }

    res.json({ ...rows[0], account_manager_name });
  } catch (err) {
    console.warn('Brand update failed:', err.message ?? err);
    res.status(503).json({ error: 'Update failed' });
  }
});
