import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Default territory for numbers entered without a country prefix (Brand Catapult = India). */
export const DEFAULT_MOBILE_COUNTRY = 'IN';

/**
 * Normalize a raw phone string to E.164 for storage and dedup (e.g. +919876543210).
 * Returns null when the number cannot be parsed as valid.
 */
export function normalizeMobileToE164(raw, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  if (!parsed?.isValid()) return null;
  return parsed.format('E.164');
}

/** ISO country from a stored E.164 mobile — used when bulk import omits country. */
export function countryFromE164(e164, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  const parsed = parsePhoneNumberFromString(String(e164 ?? '').trim());
  const code = parsed?.country;
  if (code === 'IN' || code === 'AE' || code === 'US' || code === 'GB') return code;
  return defaultCountry;
}

/** Last 10 digits — legacy fallback for rows stored before E.164 normalization. */
export function mobileNationalSuffix(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/**
 * Find an existing contact by mobile using E.164 equality, with legacy suffix fallback.
 * @returns {{ e164: string | null, contact: { id, full_name, mobile_number } | null }}
 */
export async function findContactByMobile(client, rawMobile, defaultCountry = DEFAULT_MOBILE_COUNTRY) {
  const e164 = normalizeMobileToE164(rawMobile, defaultCountry);
  if (!e164) return { e164: null, contact: null };

  const exact = await client.query(
    `SELECT id, full_name, mobile_number FROM contacts WHERE mobile_number = $1 LIMIT 1`,
    [e164],
  );
  if (exact.rows[0]) return { e164, contact: exact.rows[0] };

  const suffix = mobileNationalSuffix(e164);
  if (suffix.length < 10) return { e164, contact: null };

  const legacy = await client.query(
    `SELECT id, full_name, mobile_number FROM contacts
     WHERE RIGHT(REGEXP_REPLACE(mobile_number, '\\D', '', 'g'), 10) = $1
       AND mobile_number IS DISTINCT FROM $2
     LIMIT 1`,
    [suffix, e164],
  );
  return { e164, contact: legacy.rows[0] ?? null };
}
