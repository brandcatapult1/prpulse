/** PRD contact lifecycle — orthogonal to blacklist. */
export const CONTACT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

export function formatContactStatus(value) {
  if (!value) return '—';
  const match = CONTACT_STATUS_OPTIONS.find((o) => o.value === value);
  return match?.label ?? value;
}
