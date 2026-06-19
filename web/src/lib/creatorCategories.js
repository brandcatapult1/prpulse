/** Admin-configurable creator categories (PRD Module 1 / registration form). */
export const CREATOR_CATEGORIES = [
  'Food & Beverage',
  'Beauty',
  'Lifestyle',
  'Luxury',
  'Travel',
  'Tech',
  'Fashion',
  'Fitness',
  'Parenting',
  'Finance',
  'Auto',
  'UGC',
];

/** Format stored category value for display (string or array). */
export function formatCategories(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (!value) return '—';
  return value;
}

/** Parse legacy single-string category into array. */
export function parseCategories(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}
