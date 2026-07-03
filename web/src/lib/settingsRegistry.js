/**
 * Settings section registry — each section declares key, label, path segment,
 * and allowedRoles. Settings nav is visible only when the current role has at
 * least one permitted section.
 *
 * Role identifiers match AuthContext / USER_ROLES:
 *   'admin' | 'senior_manager' | 'campaign_manager'
 */

export const SETTINGS_SECTIONS = [
  {
    key: 'tags',
    label: 'Tags',
    path: 'tags',
    allowedRoles: ['admin', 'senior_manager'],
  },
];

export function getSettingsSection(key) {
  return SETTINGS_SECTIONS.find((s) => s.key === key) ?? null;
}

/** Sections the given role may open. */
export function sectionsForRole(role) {
  if (!role) return [];
  return SETTINGS_SECTIONS.filter((s) => s.allowedRoles.includes(role));
}

/** True when the role has at least one settings section (drives nav visibility). */
export function canAccessSettings(role) {
  return sectionsForRole(role).length > 0;
}

/** True when the role may open a specific section key. */
export function canAccessSettingsSection(role, key) {
  const section = getSettingsSection(key);
  return Boolean(section && role && section.allowedRoles.includes(role));
}
