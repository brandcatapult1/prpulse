/** Admin-only access (PRD Module 11). */
export function canAccessAdmin(role) {
  return role === 'admin';
}

export const USER_ROLES = [
  { value: 'campaign_manager', label: 'Campaign Manager' },
  { value: 'senior_manager', label: 'Senior Manager' },
  { value: 'admin', label: 'Admin' },
];

/** Active Senior Managers and Admins eligible as reporting managers. */
export function eligibleReportingManagers(users, { excludeUserId = null, includeUserId = null } = {}) {
  const eligible = (users ?? []).filter(
    (u) =>
      u.id !== excludeUserId &&
      u.is_active &&
      (u.role === 'senior_manager' || u.role === 'admin'),
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
