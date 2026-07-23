/** Serialize contacts-page filters into GET /contacts query params. */
export function buildContactListSearchParams({
  page = 1,
  pageSize = 50,
  query = '',
  filters = {},
  includeArchived = false,
} = {}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));

  const q = query.trim();
  if (q) params.set('q', q);

  if (filters.status) params.set('status', filters.status);
  if (filters.classification) params.set('classification', filters.classification);
  if (filters.city) params.set('city', filters.city);
  if (filters.openToPaid) params.set('open_to_paid', 'true');
  if (filters.openToBarter) params.set('open_to_barter', 'true');
  if (filters.tagIds?.length) params.set('tag_ids', filters.tagIds.join(','));
  if (filters.primaryCategoryIds?.length) {
    params.set('primary_category_ids', filters.primaryCategoryIds.join(','));
  }
  if (includeArchived) params.set('include_archived', 'true');

  return params;
}
