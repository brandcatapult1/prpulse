import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export const notificationsRouter = Router();

/**
 * Toasts this user has not seen yet (newest 10, including ones from while they were away).
 * Reading marks them seen. A user's first check starts from now, so old history is not replayed.
 */
notificationsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const { rows: [me] } = await pool.query(
      'SELECT notifications_seen_at FROM users WHERE id = $1',
      [req.user.id],
    );
    const seenAt = me?.notifications_seen_at;
    let items = [];
    if (seenAt) {
      const { rows } = await pool.query(
        `SELECT id, kind, message, created_at FROM notifications
         WHERE created_at > $1 AND $2 = ANY(audience_roles)
           AND (actor_id IS NULL OR actor_id <> $3)
         ORDER BY created_at DESC LIMIT 10`,
        [seenAt, req.user.role, req.user.id],
      );
      items = rows.reverse();
    }
    await pool.query('UPDATE users SET notifications_seen_at = now() WHERE id = $1', [req.user.id]);
    res.json(items);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load notifications' });
  }
});
