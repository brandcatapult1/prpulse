import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth, requireRole } from '../middleware/auth.mjs';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/users', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, email, role, is_active, created_at
       FROM users
       ORDER BY full_name
       LIMIT 200`,
    );
    res.json(rows);
  } catch (err) {
    console.warn('Admin users list failed:', err.message ?? err);
    res.json([]);
  }
});

adminRouter.patch('/users/:id', async (req, res) => {
  const { role, is_active } = req.body ?? {};
  const allowedRoles = ['campaign_manager', 'senior_manager', 'admin'];

  if (role != null && !allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users SET
        role = COALESCE($1, role),
        is_active = COALESCE($2, is_active),
        updated_at = now()
       WHERE id = $3
       RETURNING id, full_name, email, role, is_active`,
      [role ?? null, is_active ?? null, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
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
