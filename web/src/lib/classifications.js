/** PRD Module 1 classification enum labels. */
export const CLASSIFICATION_OPTIONS = [
  { value: 'nano', label: 'Nano' },
  { value: 'micro', label: 'Micro' },
  { value: 'mid', label: 'Mid' },
  { value: 'category_a', label: 'Category A' },
  { value: 'macro', label: 'Macro' },
  { value: 'hni', label: 'HNI' },
  { value: 'fnb_specialist', label: 'F&B Specialist' },
];

export function formatClassification(value) {
  if (!value) return '—';
  const match = CLASSIFICATION_OPTIONS.find((o) => o.value === value);
  return match?.label ?? value.replace(/_/g, ' ');
}
