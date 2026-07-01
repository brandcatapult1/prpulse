const ALLOWED_ROLES = ['campaign_manager', 'senior_manager', 'admin'];

const ROLE_LEVEL = {
  campaign_manager: 1,
  senior_manager: 2,
  admin: 3,
};

export function roleLevel(role) {
  return ROLE_LEVEL[role] ?? 0;
}

export function isAllowedUserRole(role) {
  return ALLOWED_ROLES.includes(role);
}

export function adminHasNoReportingManager(role) {
  return role === 'admin';
}

export function assertReportingHierarchy(userRole, managerRole) {
  if (adminHasNoReportingManager(userRole)) {
    const err = new Error('Admins are top of the org chart and cannot have a reporting manager');
    err.status = 400;
    throw err;
  }
  if (managerRole === 'campaign_manager') {
    const err = new Error('A Campaign Manager cannot be a reporting manager');
    err.status = 400;
    throw err;
  }
  if (roleLevel(managerRole) < roleLevel(userRole)) {
    const err = new Error('Reporting manager must be at the same level or higher in the org');
    err.status = 400;
    throw err;
  }
}

export function isEligibleManagerForRole(manager, userRole) {
  return (
    Boolean(manager?.is_active) &&
    manager.role !== 'campaign_manager' &&
    roleLevel(manager.role) >= roleLevel(userRole)
  );
}

export const USER_ADMIN_SELECT = `
  u.id, u.full_name, u.email, u.role, u.is_active, u.created_at, u.reports_to,
  m.full_name AS reports_to_name
`;

export const USER_ADMIN_FROM = `
  FROM users u
  LEFT JOIN users m ON m.id = u.reports_to
`;

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

async function assertNoReportingCycle(pool, userId, reportsToId) {
  let current = reportsToId;
  const visited = new Set();

  for (let depth = 0; depth < 50; depth += 1) {
    if (current === userId) {
      const err = new Error(
        'Cannot report to someone who reports to you — that would create a circular reporting line',
      );
      err.status = 400;
      throw err;
    }
    if (visited.has(current)) break;
    visited.add(current);
    const { rows } = await pool.query('SELECT reports_to FROM users WHERE id = $1', [current]);
    if (!rows[0]?.reports_to) break;
    current = rows[0].reports_to;
  }
}

export async function validateReportsTo(pool, userId, reportsToId, userRole = null) {
  if (reportsToId == null || reportsToId === '') {
    return null;
  }

  let effectiveUserRole = userRole;
  if (!effectiveUserRole && userId) {
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    effectiveUserRole = rows[0]?.role;
  }

  if (adminHasNoReportingManager(effectiveUserRole)) {
    const err = new Error('Admins are top of the org chart and cannot have a reporting manager');
    err.status = 400;
    throw err;
  }

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
  if (!manager.is_active) {
    const err = new Error('Reporting manager must be active');
    err.status = 400;
    throw err;
  }

  assertReportingHierarchy(effectiveUserRole, manager.role);

  if (userId) {
    await assertNoReportingCycle(pool, userId, reportsToId);
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
