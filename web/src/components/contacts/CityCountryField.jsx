import { SUPPORTED_COUNTRIES, citiesForCountry, countryLabel } from '../../lib/locations.js';

/** Country + city dropdowns from the admin-managed city list — shared across all contact forms. */
export function CityCountryField({
  countryCode,
  city,
  cities = [],
  onCountryChange,
  onCityChange,
  required = false,
  readValue,
  hideCountry = false,
}) {
  if (readValue != null) {
    const label = [city, countryLabel(countryCode)].filter(Boolean).join(', ');
    return <span>{label || '—'}</span>;
  }

  const options = citiesForCountry(cities, countryCode);

  return (
    <div className={hideCountry ? '' : 'grid gap-2 sm:grid-cols-2'}>
      {!hideCountry && (
        <select
          className="input-field"
          value={countryCode}
          onChange={(e) => onCountryChange(e.target.value)}
        >
          {SUPPORTED_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>{country.label}</option>
          ))}
        </select>
      )}
      <select
        className="input-field"
        value={city}
        required={required}
        onChange={(e) => onCityChange(e.target.value)}
      >
        <option value="">— Select city —</option>
        {options.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
