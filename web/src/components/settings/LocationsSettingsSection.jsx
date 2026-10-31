import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Toast } from '../ui/Primitives.jsx';
import { adminApi, lookupApi } from '../../lib/api.js';
import { applyCountries, worldCountryOptions } from '../../lib/locations.js';

function CountryAccordion({ country, cities, draft, onDraft, onAddCity, onRemoveCity, onRemoveCountry, onSaveCountry }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(country.label);
  const [dialCode, setDialCode] = useState(country.dial_code);

  async function save() {
    if (await onSaveCountry(country, label.trim(), dialCode.trim())) setEditing(false);
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50"
      >
        <span className={`text-ink-tertiary transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>▸</span>
        <span className="text-sm font-medium text-ink">{country.label}</span>
        <span className="text-2xs text-ink-tertiary">{country.dial_code}</span>
        <span className="ml-auto text-2xs text-ink-secondary">
          {cities.length} {cities.length === 1 ? 'city' : 'cities'}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {editing ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="w-28 text-2xs text-ink-secondary">
                Phone extension
                <input className="input-field mt-1" value={dialCode} onChange={(e) => setDialCode(e.target.value)} />
              </label>
              <label className="min-w-[10rem] flex-1 text-2xs text-ink-secondary">
                Country name
                <input className="input-field mt-1" value={label} onChange={(e) => setLabel(e.target.value)} />
              </label>
              <button type="button" className="btn-primary" onClick={save}>Save</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setEditing(false); setLabel(country.label); setDialCode(country.dial_code); }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Edit country</button>
              <button type="button" className="btn-ghost !text-red-700" onClick={onRemoveCountry}>Remove country</button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {cities.length === 0 && <span className="text-2xs text-ink-tertiary">No cities yet</span>}
            {cities.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-2xs text-ink">
                {c.name}
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  className="text-ink-tertiary hover:text-red-700"
                  onClick={() => onRemoveCity(c)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onAddCity(); }}>
            <input
              className="input-field max-w-xs"
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              placeholder={`Add a city in ${country.label}`}
            />
            <button type="submit" className="btn-secondary">Add city</button>
          </form>
        </div>
      )}
    </Card>
  );
}

/** Admin: add countries (name + phone extension) and the cities that belong to each. */
export function LocationsSettingsSection() {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [toast, setToast] = useState(null);
  const [dial, setDial] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [cityDrafts, setCityDrafts] = useState({});
  const world = useMemo(() => worldCountryOptions(), []);

  const load = useCallback(async () => {
    try {
      const [c, ci] = await Promise.all([lookupApi.countries(), lookupApi.cities()]);
      setCountries(c);
      setCities(ci);
      applyCountries(c);
    } catch (err) {
      setToast(err.message ?? 'Could not load countries');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addCountry(e) {
    e.preventDefault();
    if (adding) return;
    const typed = name.trim().toLowerCase();
    const match = world.find((w) => w.label.toLowerCase() === typed);
    if (!dial.trim() || !typed) {
      setToast('Enter the phone extension and the country name');
      return;
    }
    if (!match) {
      setToast('Pick the country name from the suggestion list');
      return;
    }
    setAdding(true);
    try {
      await adminApi.createCountry({ code: match.code, label: match.label, dial_code: dial });
      setDial('');
      setName('');
      setToast(`${match.label} added`);
      await load();
    } catch (err) {
      setToast(err.message ?? 'Could not add country');
    } finally {
      setAdding(false);
    }
  }

  async function saveCountry(country, label, dialCode) {
    try {
      await adminApi.updateCountry(country.code, { label, dial_code: dialCode });
      setToast(`${label} updated`);
      await load();
      return true;
    } catch (err) {
      setToast(err.message ?? 'Could not update country');
      return false;
    }
  }

  async function removeCountry(country) {
    if (!window.confirm(`Remove ${country.label} and its cities?`)) return;
    try {
      await adminApi.deleteCountry(country.code);
      setToast(`${country.label} removed`);
      await load();
    } catch (err) {
      setToast(err.message ?? 'Could not remove country');
    }
  }

  async function addCity(country) {
    const city = (cityDrafts[country.code] ?? '').trim();
    if (!city) return;
    try {
      await adminApi.createCity({ name: city, country: country.code });
      setCityDrafts((d) => ({ ...d, [country.code]: '' }));
      await load();
    } catch (err) {
      setToast(err.message ?? 'Could not add city');
    }
  }

  async function removeCity(city) {
    try {
      await adminApi.deleteCity(city.id);
      await load();
    } catch (err) {
      setToast(err.message ?? 'Could not remove city');
    }
  }

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <h3 className="text-sm font-medium text-ink">Add a country</h3>
        <form onSubmit={addCountry} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="w-28 text-2xs text-ink-secondary">
            Phone extension
            <input
              className="input-field mt-1"
              value={dial}
              onChange={(e) => setDial(e.target.value)}
              placeholder="+91"
              inputMode="tel"
            />
          </label>
          <label className="min-w-[12rem] flex-1 text-2xs text-ink-secondary">
            Country
            <input
              className="input-field mt-1"
              list="world-countries"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="India"
            />
            <datalist id="world-countries">
              {world.map((w) => <option key={w.code} value={w.label} />)}
            </datalist>
          </label>
          <button type="submit" className="btn-primary" disabled={adding}>
            {adding ? 'Adding…' : 'Add country'}
          </button>
        </form>
      </Card>

      {countries.map((country) => (
        <CountryAccordion
          key={country.code}
          country={country}
          cities={cities.filter((c) => c.country === country.code)}
          draft={cityDrafts[country.code] ?? ''}
          onDraft={(v) => setCityDrafts((d) => ({ ...d, [country.code]: v }))}
          onAddCity={() => addCity(country)}
          onRemoveCity={removeCity}
          onRemoveCountry={() => removeCountry(country)}
          onSaveCountry={saveCountry}
        />
      ))}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
