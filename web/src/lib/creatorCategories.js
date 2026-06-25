/** Format stored category value for display (legacy text or joined name). */
export function formatCategories(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (!value) return '—';
  return value;
}

/** Primary category label from registration or contact row. */
export function formatPrimaryCategory(row) {
  if (row?.primary_category_name) return row.primary_category_name;
  return formatCategories(row?.category);
}
