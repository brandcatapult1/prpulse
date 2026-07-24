import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { SUPPORTED_COUNTRIES } from './locations.js';

/** Default territory for numbers entered without a country prefix (Brand Catapult = India). */
export const DEFAULT_MOBILE_COUNTRY = 'IN';

export { SUPPORTED_COUNTRIES as MOBILE_COUNTRY_OPTIONS };

/**
 * Normalize a raw phone string to E.164 for storage and dedup (e.g. +919876543210).
 * Returns empty string when the number cannot be parsed as valid.
 */
export function normalizeMobileToE164(raw, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  if (!parsed?.isValid()) return '';
  return parsed.format('E.164');
}

/** ISO country from E.164 — mirrors server bulk-import city registration. */
export function countryFromE164(e164, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  const parsed = parsePhoneNumberFromString(String(e164 ?? '').trim());
  const code = parsed?.country;
  if (code === 'IN' || code === 'AE' || code === 'US' || code === 'GB') return code;
  return defaultCountry;
}

export function isMobileValid(raw, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  return Boolean(normalizeMobileToE164(raw, defaultCountry));
}

/** Split stored E.164 (or raw input) into country code + national digits for form fields. */
export function splitMobileForForm(value, fallbackCountry = DEFAULT_MOBILE_COUNTRY) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { countryCode: fallbackCountry, nationalNumber: '' };
  }

  const parsed = parsePhoneNumberFromString(text);
  if (parsed?.isValid()) {
    return {
      countryCode: parsed.country ?? fallbackCountry,
      nationalNumber: parsed.nationalNumber,
    };
  }

  const withDefault = parsePhoneNumberFromString(text, fallbackCountry);
  if (withDefault?.isValid()) {
    return {
      countryCode: withDefault.country ?? fallbackCountry,
      nationalNumber: withDefault.nationalNumber,
    };
  }

  return {
    countryCode: fallbackCountry,
    nationalNumber: text.replace(/\D/g, ''),
  };
}

/** @deprecated Use normalizeMobileToE164 — kept for call sites migrating from last-10 dedup. */
export function normalizeMobile(raw, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  return normalizeMobileToE164(raw, defaultCountry);
}

function mobileNationalSuffix(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/** Client-side dedup against a loaded contact list (server is source of truth on write). */
export function findContactByMobile(mobile, contacts, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  const norm = normalizeMobileToE164(mobile, defaultCountry);
  if (!norm) return null;
  const suffix = mobileNationalSuffix(norm);
  return contacts.find((c) => {
    if (!c.mobile_number) return false;
    const stored = normalizeMobileToE164(c.mobile_number, defaultCountry);
    if (stored && stored === norm) return true;
    return suffix.length >= 10 && mobileNationalSuffix(c.mobile_number) === suffix;
  }) ?? null;
}
