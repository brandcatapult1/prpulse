import { isAdmin, isBroadRole } from './permissions.mjs';

export async function listDirectReports(pool, managerId) {
  const { rows } = await pool.query(
    `SELECT id, full_name, role, is_active
     FROM users
     WHERE reports_to = $1 AND is_active = true
     ORDER BY full_name`,
    [managerId],
  );
  return rows;
}

/**
 * Who may load dashboard workspace data for scopeUserId.
 * Allowed: self, direct manager of scope user, or Admin (any user).
 */
export async function assertCanViewDashboardFor(pool, requester, scopeUserId) {
  const targetId = scopeUserId ?? requester.id;

  const { rows: targetRows } = await pool.query(
    'SELECT id FROM users WHERE id = $1',
    [targetId],
  );
  if (!targetRows[0]) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  if (targetId === requester.id) {
    return targetId;
  }

  if (isAdmin(requester.role)) {
    return targetId;
  }

  const { rows: reportRows } = await pool.query(
    'SELECT id FROM users WHERE id = $1 AND reports_to = $2',
    [targetId, requester.id],
  );
  if (!reportRows[0]) {
    const err = new Error('Insufficient permissions to view this dashboard');
    err.status = 403;
    throw err;
  }

  return targetId;
}

export function canListDirectReports(role) {
  return isBroadRole(role);
}
