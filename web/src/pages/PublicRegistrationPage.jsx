import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { registrationsApi } from '../lib/api.js';
import { MobileNumberField } from '../components/contacts/MobileNumberField.jsx';
import { CityCountryField } from '../components/contacts/CityCountryField.jsx';
import { normalizeMobileToE164, isMobileValid } from '../lib/phone.js';
import { citiesForCountry } from '../lib/locations.js';

const EMPTY = {
  full_name: '',
  country_code: 'IN',
  mobile_number: '',
  email: '',
  city: '',
  instagram_link: '',
  youtube_link: '',
  primary_category_id: '',
  paid_preference: false,
  barter_preference: false,
  reel_rate: '',
  story_rate: '',
  notes: '',
};

export function PublicRegistrationPage() {
  const [form, setForm] = useState(EMPTY);
  const [cityOptions, setCityOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      registrationsApi.cities().catch(() => []),
      registrationsApi.categories().catch(() => []),
    ]).then(([cities, categories]) => {
      setCityOptions(Array.isArray(cities) ? cities : []);
      setCategoryOptions(Array.isArray(categories) ? categories : []);
    });
  }, []);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'paid_preference' && !value) {
        next.reel_rate = '';
        next.story_rate = '';
      }
      if (field === 'country_code') {
        const stillValid = citiesForCountry(cityOptions, value).some((c) => c.name === f.city);
        if (!stillValid) next.city = '';
      }
      return next;
    });
    if (field === 'mobile_number' || field === 'email' || field === 'country_code') {
      setFieldErrors((prev) => ({ ...prev, [field]: null, mobile_number: null }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextFieldErrors = {};
    const fullName = form.full_name.trim();
    const mobileRaw = form.mobile_number.trim();
    const emailRaw = form.email.trim();

    if (!fullName) {
      setError('Full name is required.');
      return;
    }

    if (!mobileRaw) {
      nextFieldErrors.mobile_number = 'Mobile number is required.';
    } else if (!isMobileValid(mobileRaw, form.country_code)) {
      nextFieldErrors.mobile_number = 'Enter a valid mobile number for the selected country.';
    }

    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      nextFieldErrors.email = 'Enter a valid email address.';
    }

    if (Object.values(nextFieldErrors).some(Boolean)) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setFieldErrors({});
    if (!form.primary_category_id) {
      setError('Pick a primary category.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const e164 = normalizeMobileToE164(mobileRaw, form.country_code);

    const payload = {
      full_name: fullName,
      mobile_number: e164,
      country_code: form.country_code,
      email: emailRaw || null,
      city: form.city || null,
      instagram_link: form.instagram_link.trim() || null,
      youtube_link: form.youtube_link.trim() || null,
      primary_category_id: form.primary_category_id,
      paid_preference: form.paid_preference,
      barter_preference: form.barter_preference,
      reel_rate: form.paid_preference && form.reel_rate ? Number(form.reel_rate) : null,
      story_rate: form.paid_preference && form.story_rate ? Number(form.story_rate) : null,
      portfolio_links: [],
      notes: form.notes.trim() || null,
    };

    try {
      await registrationsApi.submit(payload);
    } catch (err) {
      setError(err.message ?? 'Registration failed — please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-xl border border-line bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-ink">Thanks — we&apos;ll review your profile</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Our team will get back to you after reviewing your submission. No account is created yet.
          </p>
          <Link to="/login" className="btn-primary mt-6 inline-flex">
            Team login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-ink">Join our creator network</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Tell us about yourself — our team will review and reach out.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-6 shadow-sm">
          <Field label="Full name *">
            <input className="input-field" value={form.full_name} onChange={set('full_name')} placeholder="Your name" />
          </Field>

          <Field label="Mobile *">
            <MobileNumberField
              countryCode={form.country_code}
              nationalNumber={form.mobile_number}
              onCountryChange={(code) => set('country_code')({ target: { value: code } })}
              onNumberChange={(value) => setForm((f) => ({ ...f, mobile_number: value }))}
            />
            {fieldErrors.mobile_number && (
              <p className="mt-1 text-2xs text-red-700">{fieldErrors.mobile_number}</p>
            )}
          </Field>

          <Field label="Email">
            <input className="input-field" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
            {fieldErrors.email && (
              <p className="mt-1 text-2xs text-red-700">{fieldErrors.email}</p>
            )}
          </Field>
          <Field label="City">
            <CityCountryField
              countryCode={form.country_code}
              city={form.city}
              cities={cityOptions}
              onCountryChange={(code) => set('country_code')({ target: { value: code } })}
              onCityChange={(value) => setForm((f) => ({ ...f, city: value }))}
            />
          </Field>
          <Field label="Instagram link">
            <input className="input-field" type="url" value={form.instagram_link} onChange={set('instagram_link')} placeholder="https://instagram.com/…" />
          </Field>
          <Field label="YouTube link">
            <input className="input-field" type="url" value={form.youtube_link} onChange={set('youtube_link')} placeholder="https://youtube.com/…" />
          </Field>

          <Field label="Primary category *">
            <select
              className="input-field"
              value={form.primary_category_id}
              onChange={set('primary_category_id')}
            >
              <option value="">Select a category</option>
              {categoryOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </Field>

          <div className="space-y-3 rounded-lg border border-line bg-canvas px-4 py-3">
            <p className="text-2xs font-medium text-ink-secondary">Collaboration preferences</p>
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={form.barter_preference}
                onChange={set('barter_preference')}
                className="rounded border-line text-brand"
              />
              Open to barter
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={form.paid_preference}
                onChange={set('paid_preference')}
                className="rounded border-line text-brand"
              />
              Open to paid
            </label>
          </div>

          {form.paid_preference && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reel rate (₹)">
                <input className="input-field" type="number" min={0} value={form.reel_rate} onChange={set('reel_rate')} placeholder="15000" />
              </Field>
              <Field label="Story rate (₹)">
                <input className="input-field" type="number" min={0} value={form.story_rate} onChange={set('story_rate')} placeholder="5000" />
              </Field>
            </div>
          )}

          <Field label="Notes">
            <textarea className="input-field min-h-[72px] py-2" value={form.notes} onChange={set('notes')} placeholder="Anything else we should know?" />
          </Field>

          <button type="submit" className="btn-primary w-full justify-center" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
        </form>

        <p className="mt-4 text-center text-2xs text-ink-tertiary">
          Already on the team? <Link to="/login" className="text-brand hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-2xs font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}
