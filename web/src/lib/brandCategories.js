/** Brand categories for Module 3 reference data. */
export const BRAND_CATEGORIES = [
  'Food & Beverage',
  'Luxury',
  'Beauty',
  'Travel',
  'Lifestyle',
  'Tech',
  'Fashion',
  'Auto',
  'Finance',
  'Health & Wellness',
];

export function canManageBrands(role) {
  return role === 'admin' || role === 'senior_manager';
}
