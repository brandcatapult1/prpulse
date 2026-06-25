import { SUPPORTED_COUNTRIES } from '../../lib/locations.js';
import { isMobileValid } from '../../lib/phone.js';

/** Country-code selector + national mobile input — shared across all contact forms. */
export function MobileNumberField({
  countryCode,
  nationalNumber,
  onCountryChange,
  onNumberChange,
  onBlur,
  error,
  required = false,
}) {
  return (
    <div>
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <select
          className="input-field"
          value={countryCode}
          onChange={(e) => onCountryChange(e.target.value)}
        >
          {SUPPORTED_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.dialCode} · {country.label}
            </option>
          ))}
        </select>
        <input
          className={`input-field ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
          type="tel"
          required={required}
          value={nationalNumber}
          onChange={(e) => onNumberChange(e.target.value)}
          onBlur={onBlur}
          placeholder="98765 43210"
        />
      </div>
      {error && <p className="mt-1 text-2xs text-red-700">{error}</p>}
      {!error && nationalNumber && !isMobileValid(nationalNumber, countryCode) && (
        <p className="mt-1 text-2xs text-red-700">Enter a valid mobile number for the selected country.</p>
      )}
    </div>
  );
}
