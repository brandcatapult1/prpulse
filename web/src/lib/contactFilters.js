/** Default filter state for the contacts page (includes status). */
export const CONTACT_PAGE_FILTER_DEFAULTS = {
  status: '',
  classification: '',
  city: '',
  openToPaid: false,
  openToBarter: false,
  tagIds: [],
  primaryCategoryIds: [],
};

/** Filter state for campaign add-creators drawer (active-only pool; no status filter). */
export const CONTACT_DRAWER_FILTER_DEFAULTS = {
  classification: '',
  city: '',
  openToPaid: false,
  openToBarter: false,
  tagIds: [],
  primaryCategoryIds: [],
};

function selectedTagNames(tagIds, tagOptions) {
  return (tagIds ?? [])
    .map((id) => tagOptions.find((t) => t.id === id)?.name)
    .filter(Boolean);
}

/**
 * Shared contacts-page filter logic — AND-combined search + facet filters.
 * When `includeStatusFilter` is false (drawer), status is not applied (pool is
 * already scoped to active creators server-side).
 */
export function filterContacts(
  contacts,
  { query = '', filters = {}, tagOptions = [], includeStatusFilter = true } = {},
) {
  let result = contacts ?? [];
  const q = query.trim().toLowerCase();

  if (q) {
    result = result.filter(
      (r) =>
        r.full_name?.toLowerCase().includes(q)
        || r.mobile_number?.includes(q)
        || r.city?.toLowerCase().includes(q)
        || r.primary_category_name?.toLowerCase().includes(q)
        || r.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }

  if (includeStatusFilter) {
    if (filters.status === 'active' || filters.status === 'inactive' || filters.status === 'archived') {
      result = result.filter((r) => r.status === filters.status);
    } else if (filters.status === '') {
      result = result.filter((r) => r.status !== 'archived');
    }
  }

  if (filters.classification) {
    result = result.filter((r) => r.classification === filters.classification);
  }
  if (filters.city) {
    result = result.filter((r) => r.city === filters.city);
  }
  if (filters.openToBarter) {
    result = result.filter((r) => r.open_to_barter);
  }
  if (filters.openToPaid) {
    result = result.filter((r) => r.open_to_paid);
  }

  const tagNames = selectedTagNames(filters.tagIds, tagOptions);
  if (tagNames.length > 0) {
    result = result.filter((r) =>
      tagNames.every((name) => r.tags?.includes(name)),
    );
  }

  if (filters.primaryCategoryIds?.length > 0) {
    result = result.filter((r) =>
      filters.primaryCategoryIds.includes(r.primary_category_id),
    );
  }

  return result;
}

export function contactFiltersActive(filters, { query = '', includeStatus = true } = {}) {
  return Boolean(
    (includeStatus && filters.status)
    || filters.classification
    || filters.city
    || filters.openToPaid
    || filters.openToBarter
    || (filters.tagIds?.length ?? 0) > 0
    || (filters.primaryCategoryIds?.length ?? 0) > 0
    || query.trim(),
  );
}
