import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Toast } from '../ui/Primitives.jsx';
import { adminApi, lookupApi } from '../../lib/api.js';
import { applyCountries, worldCountryOptions } from '../../lib/locations.js';

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

      {countries.map((country) => {
        const own = cities.filter((c) => c.country === country.code);
        return (
          <Card key={country.code} className="!p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-ink">
                {country.label} <span className="ml-1 text-2xs font-normal text-ink-tertiary">{country.dial_code}</span>
              </h3>
              <button type="button" className="btn-ghost !text-red-700" onClick={() => removeCountry(country)}>
                Remove country
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {own.length === 0 && <span className="text-2xs text-ink-tertiary">No cities yet</span>}
              {own.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-2xs text-ink">
                  {c.name}
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    className="text-ink-tertiary hover:text-red-700"
                    onClick={() => removeCity(c)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => { e.preventDefault(); addCity(country); }}
            >
              <input
                className="input-field max-w-xs"
                value={cityDrafts[country.code] ?? ''}
                onChange={(e) => setCityDrafts((d) => ({ ...d, [country.code]: e.target.value }))}
                placeholder={`Add a city in ${country.label}`}
              />
              <button type="submit" className="btn-secondary">Add city</button>
            </form>
          </Card>
        );
      })}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
