const ALLOWED_ROLES = ['campaign_manager', 'senior_manager', 'admin'];
const MANAGER_ROLES = ['senior_manager', 'admin'];

export const USER_ADMIN_SELECT = `
  u.id, u.full_name, u.email, u.role, u.is_active, u.created_at, u.reports_to,
  m.full_name AS reports_to_name
`;

export const USER_ADMIN_FROM = `
  FROM users u
  LEFT JOIN users m ON m.id = u.reports_to
`;

export function isAllowedUserRole(role) {
  return ALLOWED_ROLES.includes(role);
}

export function isEligibleReportingManager(user) {
  return Boolean(user?.is_active) && MANAGER_ROLES.includes(user?.role);
}

export function normalizeUserEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function assertValidUserEmail(email) {
  const normalized = normalizeUserEmail(email);
  if (!normalized) {
    const err = new Error('Email is required');
    err.status = 400;
    throw err;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const err = new Error('Invalid email address');
    err.status = 400;
    throw err;
  }
  return normalized;
}

export async function validateReportsTo(pool, userId, reportsToId) {
  if (reportsToId == null || reportsToId === '') return null;

  if (userId && reportsToId === userId) {
    const err = new Error('User cannot report to themselves');
    err.status = 400;
    throw err;
  }

  const { rows } = await pool.query(
    'SELECT id, role, is_active FROM users WHERE id = $1',
    [reportsToId],
  );
  const manager = rows[0];
  if (!manager) {
    const err = new Error('Reporting manager not found');
    err.status = 400;
    throw err;
  }
  if (!isEligibleReportingManager(manager)) {
    const err = new Error('Reporting manager must be an active Senior Manager or Admin');
    err.status = 400;
    throw err;
  }

  if (userId) {
    const seen = new Set([userId]);
    let current = reportsToId;
    for (let depth = 0; depth < 50; depth += 1) {
      if (seen.has(current)) {
        const err = new Error('Reporting line would create a cycle');
        err.status = 400;
        throw err;
      }
      seen.add(current);
      const { rows: up } = await pool.query('SELECT reports_to FROM users WHERE id = $1', [current]);
      if (!up[0]?.reports_to) break;
      current = up[0].reports_to;
    }
  }

  return reportsToId;
}

export async function fetchUserAdminRow(pool, userId) {
  const { rows } = await pool.query(
    `SELECT ${USER_ADMIN_SELECT}
     ${USER_ADMIN_FROM}
     WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function listUsersAdmin(pool) {
  const { rows } = await pool.query(
    `SELECT ${USER_ADMIN_SELECT}
     ${USER_ADMIN_FROM}
     ORDER BY u.full_name
     LIMIT 200`,
  );
  return rows;
}
