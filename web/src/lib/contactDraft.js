import { normalizeMobileToE164, splitMobileForForm, isMobileValid } from './phone.js';
import { matchCityName, normalizeCountryCode } from './locations.js';
import {
  indicativeRatesPayload,
  hasCollaborationPreference,
  COLLABORATION_PREFERENCE_ERROR,
} from './collaborationPrefs.js';

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

export function buildDraftFromContact(contact, { cities = [] } = {}) {
  if (!contact) return {};

  const countryCode = normalizeCountryCode(contact.country);
  const mobileParts = splitMobileForForm(contact.mobile_number, countryCode);
  const matchedCity = matchCityName(cities, contact.city, countryCode);

  return {
    full_name: contact.full_name ?? '',
    mobile_country_code: mobileParts.countryCode,
    mobile_number: mobileParts.nationalNumber,
    email: contact.email ?? '',
    country: countryCode,
    city: matchedCity || contact.city || '',
    state: contact.state ?? '',
    instagram_url: contact.instagram_url ?? '',
    youtube_url: contact.youtube_url ?? '',
    other_platform_links: cloneLinks(contact.other_platform_links),
    primary_category_id: contact.primary_category_id ?? contact.primary_category?.id ?? '',
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
    mobile_country_code: draft.mobile_country_code ?? 'IN',
    email: emptyToNull(draft.email),
    city: emptyToNull(draft.city),
    country: draft.country ?? draft.mobile_country_code ?? 'IN',
    state: emptyToNull(draft.state),
    instagram_url: emptyToNull(draft.instagram_url),
    youtube_url: emptyToNull(draft.youtube_url),
    other_platform_links: links,
    primary_category_id: draft.primary_category_id || null,
    open_to_paid: Boolean(draft.open_to_paid),
    open_to_barter: Boolean(draft.open_to_barter),
    ...indicativeRatesPayload(Boolean(draft.open_to_paid), draft, rateToPayload),
    classification: draft.classification || null,
    tag_ids: draft.tag_ids ?? [],
    status: draft.status || 'active',
    notes: emptyToNull(draft.notes),
  };
}

export function isDraftMobileValid(draft) {
  return isMobileValid(draft.mobile_number, draft.mobile_country_code ?? 'IN');
}

/** Indexes of platform-link rows that have exactly one of label/url filled. */
export function incompletePlatformLinkIndexes(links) {
  return (links ?? [])
    .map((item, index) => {
      const label = String(item?.label ?? '').trim();
      const url = String(item?.url ?? '').trim();
      const incomplete = (label && !url) || (!label && url);
      return incomplete ? index : -1;
    })
    .filter((index) => index !== -1);
}

/** First blocking validation message for the draft, or null when saveable. */
export function getDraftValidationError(draft, { duplicateId, contactId } = {}) {
  if (!draft.full_name?.trim()) return 'Full name is required';
  if (!isDraftMobileValid(draft)) return 'Enter a valid mobile number for the selected country';
  if (duplicateId && duplicateId !== contactId) return 'This mobile number belongs to another contact';
  if (!hasCollaborationPreference(draft.open_to_paid, draft.open_to_barter)) {
    return COLLABORATION_PREFERENCE_ERROR;
  }
  if (incompletePlatformLinkIndexes(draft.other_platform_links).length > 0) {
    return 'Each other-platform link needs both a label and a URL — complete or remove the incomplete row';
  }
  return null;
}

export function isDraftSaveable(draft, options = {}) {
  return getDraftValidationError(draft, options) === null;
}

export function e164FromDraft(draft) {
  return normalizeMobileToE164(draft.mobile_number, draft.mobile_country_code ?? 'IN');
}
