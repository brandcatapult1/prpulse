/** Shared country + city constants — used by public signup and all internal contact forms. */

/** Starts with the built-ins; replaced in place by the admin-managed list once it loads (see applyCountries). */
export const SUPPORTED_COUNTRIES = [
  { code: 'IN', dialCode: '+91', label: 'India' },
  { code: 'AE', dialCode: '+971', label: 'UAE' },
  { code: 'US', dialCode: '+1', label: 'USA' },
  { code: 'GB', dialCode: '+44', label: 'UK' },
];

/** Replace the country list in place so every importer sees the admin-managed countries. */
export function applyCountries(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  SUPPORTED_COUNTRIES.splice(0, SUPPORTED_COUNTRIES.length, ...list.map((c) => ({
    code: c.code,
    dialCode: c.dial_code ?? c.dialCode,
    label: c.label,
  })));
}

/** Country names of the world (for the add-country form), each with its ISO code. */
export function worldCountryOptions() {
  let names;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return [];
  }
  const out = [];
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      const label = names.of(code);
      if (label && label !== code) out.push({ code, label });
    }
  }
  return out.sort((x, y) => x.label.localeCompare(y.label));
}

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
