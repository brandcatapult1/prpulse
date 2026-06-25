import { normalizeMobileToE164 } from './phone.js';

function cloneLinks(links) {
  if (!Array.isArray(links) || links.length === 0) return [{ label: '', url: '' }];
  return links.map((item) => ({
    label: item?.label ?? '',
    url: item?.url ?? '',
  }));
}

export function tagNamesFromContact(contact) {
  return (contact?.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean);
}

export function buildDraftFromContact(contact) {
  if (!contact) return {};

  return {
    full_name: contact.full_name ?? '',
    mobile_number: contact.mobile_number ?? '',
    email: contact.email ?? '',
    city: contact.city ?? '',
    state: contact.state ?? '',
    country: contact.country ?? '',
    instagram_url: contact.instagram_url ?? '',
    youtube_url: contact.youtube_url ?? '',
    other_platform_links: cloneLinks(contact.other_platform_links),
    primary_category_id: contact.primary_category_id ?? contact.primary_category?.id ?? '',
    secondary_category_ids: (contact.secondary_categories ?? []).map((c) => c.id),
    open_to_paid: Boolean(contact.open_to_paid),
    open_to_barter: Boolean(contact.open_to_barter),
    reel_rate: contact.reel_rate ?? '',
    story_rate: contact.story_rate ?? '',
    post_rate: contact.post_rate ?? '',
    other_rate: contact.other_rate ?? '',
    classification: contact.classification ?? '',
    tag_ids: (contact.tags ?? []).map((t) => t.id).filter(Boolean),
    status: contact.status ?? 'active',
    notes: contact.notes ?? '',
  };
}

function emptyToNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function rateToPayload(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildPatchFromDraft(draft) {
  const links = (draft.other_platform_links ?? [])
    .map((item) => ({
      label: String(item.label ?? '').trim(),
      url: String(item.url ?? '').trim(),
    }))
    .filter((item) => item.label && item.url);

  return {
    full_name: draft.full_name.trim(),
    mobile_number: draft.mobile_number.trim(),
    email: emptyToNull(draft.email),
    city: emptyToNull(draft.city),
    state: emptyToNull(draft.state),
    country: emptyToNull(draft.country),
    instagram_url: emptyToNull(draft.instagram_url),
    youtube_url: emptyToNull(draft.youtube_url),
    other_platform_links: links,
    primary_category_id: draft.primary_category_id || null,
    secondary_category_ids: draft.secondary_category_ids ?? [],
    open_to_paid: Boolean(draft.open_to_paid),
    open_to_barter: Boolean(draft.open_to_barter),
    reel_rate: rateToPayload(draft.reel_rate),
    story_rate: rateToPayload(draft.story_rate),
    post_rate: rateToPayload(draft.post_rate),
    other_rate: rateToPayload(draft.other_rate),
    classification: draft.classification || null,
    tag_ids: draft.tag_ids ?? [],
    status: draft.status || 'active',
    notes: emptyToNull(draft.notes),
  };
}

export function isDraftMobileValid(draft) {
  return Boolean(normalizeMobileToE164(draft.mobile_number));
}

export function isDraftSaveable(draft, { duplicateId, contactId } = {}) {
  if (!draft.full_name?.trim()) return false;
  if (!isDraftMobileValid(draft)) return false;
  if (duplicateId && duplicateId !== contactId) return false;
  return true;
}
