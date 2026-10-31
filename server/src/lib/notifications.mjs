/** Who is told about which event. Admin and senior managers only; the person who did it is never told. */
const AUDIENCE = {
  campaign_completed: ['senior_manager', 'admin'],
  campaign_created: ['senior_manager'],
  creator_added: ['senior_manager'],
  registration_new: ['admin'],
};

/** Best-effort: a failed notification never fails the action that caused it. */
export async function notify(pool, kind, message, actorId = null) {
  try {
    await pool.query(
      `INSERT INTO notifications (kind, message, actor_id, audience_roles) VALUES ($1, $2, $3, $4)`,
      [kind, message, actorId, AUDIENCE[kind]],
    );
  } catch (err) {
    console.warn('Notification failed:', err.message ?? err);
  }
}
