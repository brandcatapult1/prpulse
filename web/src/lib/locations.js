/** Shared country + city constants — used by public signup and all internal contact forms. */

export const SUPPORTED_COUNTRIES = [
  { code: 'IN', dialCode: '+91', label: 'India' },
  { code: 'AE', dialCode: '+971', label: 'UAE' },
  { code: 'US', dialCode: '+1', label: 'USA' },
  { code: 'GB', dialCode: '+44', label: 'UK' },
];

export function countryLabel(code) {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code)?.label ?? code ?? '—';
}

export function countryDialCode(code) {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code)?.dialCode ?? '';
}

export function citiesForCountry(cities, countryCode) {
  if (!countryCode) return cities ?? [];
  return (cities ?? []).filter((c) => c.country === countryCode);
}

/** Match a legacy free-text city name to a canonical list entry (case-insensitive). */
export function matchCityName(cities, rawName, countryCode) {
  const needle = String(rawName ?? '').trim().toLowerCase();
  if (!needle) return '';
  const pool = countryCode ? citiesForCountry(cities, countryCode) : cities ?? [];
  const hit = pool.find((c) => c.name.toLowerCase() === needle);
  return hit?.name ?? '';
}

/** Guess ISO country from stored contact.country (code or label). */
export function normalizeCountryCode(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return 'IN';
  const byCode = SUPPORTED_COUNTRIES.find((c) => c.code === text);
  if (byCode) return byCode.code;
  const byLabel = SUPPORTED_COUNTRIES.find((c) => c.label.toLowerCase() === text.toLowerCase());
  return byLabel?.code ?? 'IN';
}
