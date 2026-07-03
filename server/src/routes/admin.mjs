import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth, requireRole } from '../middleware/auth.mjs';
import { runDemoSeed } from '../../../scripts/seed-demo.mjs';
import { assertSupportedCountry } from '../lib/cities.mjs';
import {
  assertValidUserEmail,
  fetchUserAdminRow,
  isAllowedUserRole,
  listUsersAdmin,
  validateReportsTo,
} from '../lib/userAdmin.mjs';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/users', async (_req, res) => {
  try {
    const rows = await listUsersAdmin(pool);
    res.json(rows);
  } catch (err) {
    console.warn('Admin users list failed:', err.message ?? err);
    res.json([]);
  }
});

adminRouter.post('/users', async (req, res) => {
  const body = req.body ?? {};
  const fullName = String(body.full_name ?? '').trim();
  const role = body.role;
  const isActive = body.is_active !== false;

  if (!fullName) {
    return res.status(400).json({ error: 'full_name is required' });
  }
  if (!isAllowedUserRole(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  let email;
  try {
    email = assertValidUserEmail(body.email);
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  let reportsTo = null;
  try {
    reportsTo = await validateReportsTo(pool, null, body.reports_to ?? null, role);
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  if (role === 'admin') {
    reportsTo = null;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, role, reports_to, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [fullName, email, role, reportsTo, isActive],
    );
    const saved = await fetchUserAdminRow(pool, rows[0].id);
    res.status(201).json(saved);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    console.warn('Admin user create failed:', err.message ?? err);
    res.status(503).json({ error: 'Could not create user' });
  }
});

adminRouter.patch('/users/:id', async (req, res) => {
  const body = req.body ?? {};
  const patches = [];
  const params = [];
  let paramIndex = 1;

  let currentUser;
  try {
    const { rows } = await pool.query('SELECT role, reports_to FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    currentUser = rows[0];
  } catch (err) {
    console.warn('Admin user load failed:', err.message ?? err);
    return res.status(503).json({ error: 'Update failed' });
  }

  const nextRole = body.role ?? currentUser.role;

  if (body.role != null) {
    if (!isAllowedUserRole(body.role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    patches.push(`role = $${paramIndex++}`);
    params.push(body.role);
  }

  if ('is_active' in body) {
    patches.push(`is_active = $${paramIndex++}`);
    params.push(Boolean(body.is_active));
  }

  if (nextRole === 'admin') {
    patches.push(`reports_to = $${paramIndex++}`);
    params.push(null);
  } else if ('reports_to' in body) {
    try {
      const reportsTo = await validateReportsTo(pool, req.params.id, body.reports_to ?? null, nextRole);
      patches.push(`reports_to = $${paramIndex++}`);
      params.push(reportsTo);
    } catch (err) {
      return res.status(err.status ?? 400).json({ error: err.message });
    }
  } else if (body.role != null && currentUser.reports_to) {
    try {
      await validateReportsTo(pool, req.params.id, currentUser.reports_to, nextRole);
    } catch (err) {
      return res.status(err.status ?? 400).json({ error: err.message });
    }
  }

  if (patches.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  patches.push('updated_at = now()');
  params.push(req.params.id);

  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET ${patches.join(', ')} WHERE id = $${paramIndex}`,
      params,
    );
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    const saved = await fetchUserAdminRow(pool, req.params.id);
    res.json(saved);
  } catch (err) {
    console.warn('Admin user update failed:', err.message ?? err);
    res.status(503).json({ error: 'Update failed' });
  }
});

adminRouter.get('/audit-log', async (req, res) => {
  const entityType = req.query.entity_type;
  const params = [];
  let where = '';

  if (entityType && entityType !== 'all') {
    params.push(entityType);
    where = `WHERE a.entity_type = $1`;
  }

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.occurred_at, a.entity_type, a.entity_id, a.action_type,
              a.previous_value, a.new_value,
              u.full_name AS user_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.occurred_at DESC
       LIMIT 200`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.warn('Audit log list failed:', err.message ?? err);
    res.json([]);
  }
});

adminRouter.get('/org-branding', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT logo_url, updated_at FROM org_settings WHERE id = 1');
    res.json({ logo_url: rows[0]?.logo_url ?? null, updated_at: rows[0]?.updated_at ?? null });
  } catch (err) {
    if (err.code === '42P01') return res.json({ logo_url: null });
    res.status(503).json({ error: 'Could not load branding' });
  }
});

adminRouter.patch('/org-branding', async (req, res) => {
  const { logo_url: logoUrl } = req.body ?? {};

  if (logoUrl != null && typeof logoUrl !== 'string') {
    return res.status(400).json({ error: 'logo_url must be a string or null' });
  }
  if (logoUrl && logoUrl.length > 1_200_000) {
    return res.status(400).json({ error: 'Logo file is too large (max ~900 KB image)' });
  }

  try {
    let updatedBy = req.user.id;
    const userRow = await pool.query('SELECT id FROM users WHERE id = $1', [req.user.id]);
    if (!userRow.rows[0]) updatedBy = null;

    const { rows } = await pool.query(
      `INSERT INTO org_settings (id, logo_url, updated_by)
       VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE
         SET logo_url = EXCLUDED.logo_url,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING logo_url, updated_at`,
      [logoUrl ?? null, updatedBy],
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({
        error: 'Org settings table is missing — redeploy the app or contact support.',
      });
    }
    console.warn('Org branding save failed:', err.message ?? err);
    res.status(503).json({ error: err.message ?? 'Could not save branding' });
  }
});

adminRouter.post('/categories', async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO categories (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, created_at`,
      [name],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not create category' });
  }
});

adminRouter.delete('/categories/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    res.status(204).end();
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not delete category' });
  }
});

adminRouter.post('/cities', async (req, res) => {
  const name = req.body?.name?.trim();
  const country = req.body?.country?.trim();
  if (!name) return res.status(400).json({ error: 'City name is required' });
  try {
    assertSupportedCountry(country);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO cities (name, country) VALUES ($1, $2)
       ON CONFLICT (country, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, country, created_at`,
      [name, country],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'Cities table is missing — run migrations.' });
    }
    res.status(503).json({ error: err.message ?? 'Could not create city' });
  }
});

adminRouter.delete('/cities/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM cities WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'City not found' });
    res.status(204).end();
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not delete city' });
  }
});

adminRouter.post('/seed-demo', async (req, res) => {
  const reset = req.body?.reset === true;
  try {
    const result = await runDemoSeed({ reset, actorUserId: req.user.id });
    res.json(result);
  } catch (err) {
    console.warn('Demo seed failed:', err.message ?? err);
    res.status(503).json({ error: err.message ?? 'Demo seed failed' });
  }
});
