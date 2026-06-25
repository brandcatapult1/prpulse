/** PRD Module 1 classification enum — display labels only; stored values unchanged. */
export const CLASSIFICATION_OPTIONS = [
  { value: 'nano', label: 'Nano', selectLabel: 'Nano (<10K)' },
  { value: 'micro', label: 'Micro', selectLabel: 'Micro (10K–25K)' },
  { value: 'mid', label: 'Mid', selectLabel: 'Mid (25K–100K)' },
  { value: 'category_a', label: 'Category A', selectLabel: 'Category A (100K–1M)' },
  { value: 'macro', label: 'Macro', selectLabel: 'Macro (1M+)' },
  { value: 'hni', label: 'HNI', selectLabel: 'HNI — high-net-worth creator' },
  {
    value: 'fnb_specialist',
    label: 'F&B Specialist',
    selectLabel: 'F&B Specialist — food & beverage focus',
  },
];

/** Short label for read-only display (tables, profile header). */
export function formatClassification(value) {
  if (!value) return '—';
  const match = CLASSIFICATION_OPTIONS.find((o) => o.value === value);
  return match?.label ?? value.replace(/_/g, ' ');
}

/** Dropdown option text — includes follower bands or type descriptors. */
export function classificationSelectLabel(valueOrOption) {
  const opt = typeof valueOrOption === 'string'
    ? CLASSIFICATION_OPTIONS.find((o) => o.value === valueOrOption)
    : valueOrOption;
  return opt?.selectLabel ?? opt?.label ?? valueOrOption ?? '';
}
