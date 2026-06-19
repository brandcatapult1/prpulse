/** Admin-only access (PRD Module 11). */
export function canAccessAdmin(role) {
  return role === 'admin';
}

export const USER_ROLES = [
  { value: 'campaign_manager', label: 'Campaign Manager' },
  { value: 'senior_manager', label: 'Senior Manager' },
  { value: 'admin', label: 'Admin' },
];

export const AUDIT_ENTITY_TYPES = [
  'contact',
  'campaign',
  'engagement',
  'deliverable',
  'feedback',
  'blacklist',
];
