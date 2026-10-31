import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export const notificationsRouter = Router();

const REMINDER_EVERY_HOURS = 3;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Campaign manager's own work due today (India time): deliverables to complete and follow-ups to do. */
async function dueTodayReminder(userId) {
  const { rows: [me] } = await pool.query(
    `SELECT (reminders_shown_at IS NULL OR reminders_shown_at < now() - make_interval(hours => $2)) AS due
     FROM users WHERE id = $1`,
    [userId, REMINDER_EVERY_HOURS],
  );
  if (!me?.due) return null;

  const { rows: [counts] } = await pool.query(
    `WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d)
     SELECT
       (SELECT count(*) FROM deliverables dl
          JOIN engagements e ON e.id = dl.engagement_id, today
         WHERE e.assigned_manager = $1 AND dl.status <> 'posted' AND dl.due_date = today.d)::int AS deliverables,
       (SELECT count(*) FROM engagements e, today
         WHERE e.assigned_manager = $1 AND e.next_follow_up_date IS NOT NULL
           AND e.next_follow_up_date <= today.d
           AND e.conversation_status IN ('not_contacted','in_conversation','scheduled','no_response'))::int AS follow_ups`,
    [userId],
  );
  if (!counts.deliverables && !counts.follow_ups) return null;

  await pool.query('UPDATE users SET reminders_shown_at = now() WHERE id = $1', [userId]);
  const parts = [];
  if (counts.deliverables) parts.push(`${plural(counts.deliverables, 'deliverable')} due to be completed today`);
  if (counts.follow_ups) parts.push(`${plural(counts.follow_ups, 'follow-up')} to do`);
  return { id: `reminder-${Date.now()}`, kind: 'reminder', message: `Reminder: ${parts.join(' · ')}` };
}

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
    if (req.user.role === 'campaign_manager') {
      const reminder = await dueTodayReminder(req.user.id);
      if (reminder) items.push(reminder);
    }
    res.json(items);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load notifications' });
  }
});
