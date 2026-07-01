/** Admin-only access (PRD Module 11). */
export function canAccessAdmin(role) {
  return role === 'admin';
}

export const USER_ROLES = [
  { value: 'campaign_manager', label: 'Campaign Manager' },
  { value: 'senior_manager', label: 'Senior Manager' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_LEVEL = {
  campaign_manager: 1,
  senior_manager: 2,
  admin: 3,
};

function roleLevel(role) {
  return ROLE_LEVEL[role] ?? 0;
}

/** Admins sit at the top of the org chart and do not report to anyone. */
export function reportsToEditableForRole(role) {
  return role !== 'admin';
}

/** Managers eligible for a user's role, respecting org hierarchy. */
export function eligibleReportingManagers(users, { userRole, excludeUserId = null, includeUserId = null } = {}) {
  if (!userRole || userRole === 'admin') return [];

  const eligible = (users ?? []).filter(
    (u) =>
      u.id !== excludeUserId &&
      u.is_active &&
      u.role !== 'campaign_manager' &&
      roleLevel(u.role) >= roleLevel(userRole),
  );

  if (includeUserId && !eligible.some((u) => u.id === includeUserId)) {
    const extra = (users ?? []).find((u) => u.id === includeUserId);
    if (extra) return [...eligible, extra];
  }
  return eligible;
}

export const AUDIT_ENTITY_TYPES = [
  'contact',
  'campaign',
  'engagement',
  'deliverable',
  'feedback',
  'blacklist',
];
