import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { registrationsApi } from '../lib/api.js';
import {
  formWithPaidPreference,
  registrationRatesPayload,
  showIndicativeRates,
  hasCollaborationPreference,
  COLLABORATION_PREFERENCE_ERROR,
  PROFILE_LINK_REQUIRED_ERROR,
  hasProfileLink,
} from '../lib/collaborationPrefs.js';
import { loadPublicOrgLogoUrl } from '../lib/orgBranding.js';
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

const DEFAULT_CONFIRMATION = {
  title: "Thanks — we'll review your profile",
  body: 'Our team will get back to you after reviewing your submission. No account is created yet.',
};

export function PublicRegistrationPage() {
  const [form, setForm] = useState(EMPTY);
  const [logoUrl, setLogoUrl] = useState(null);
  const [cityOptions, setCityOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [confirmation, setConfirmation] = useState(DEFAULT_CONFIRMATION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      loadPublicOrgLogoUrl(),
      registrationsApi.cities().catch(() => []),
      registrationsApi.categories().catch(() => []),
    ]).then(([logo, cities, categories]) => {
      setLogoUrl(logo);
      setCityOptions(Array.isArray(cities) ? cities : []);
      setCategoryOptions(Array.isArray(categories) ? categories : []);
    });
  }, []);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      if (field === 'paid_preference') {
        return formWithPaidPreference(f, value);
      }
      const next = { ...f, [field]: value };
      if (field === 'country_code') {
        const stillValid = citiesForCountry(cityOptions, value).some((c) => c.name === f.city);
        if (!stillValid) next.city = '';
      }
      return next;
    });
    if (field === 'mobile_number' || field === 'email' || field === 'country_code') {
      setFieldErrors((prev) => ({ ...prev, [field]: null, mobile_number: null }));
    }
    if (field === 'city' || field === 'country_code') {
      setFieldErrors((prev) => ({ ...prev, city: null, country_code: null }));
    }
    if (field === 'instagram_link' || field === 'youtube_link') {
      setFieldErrors((prev) => ({ ...prev, profile_link: null }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const nextFieldErrors = {};
    const fullName = form.full_name.trim();
    const mobileRaw = form.mobile_number.trim();
    const emailRaw = form.email.trim();
    const instagram = form.instagram_link.trim();
    const youtube = form.youtube_link.trim();

    if (!fullName) {
      setError('Full name is required.');
      return;
    }

    if (!mobileRaw) {
      nextFieldErrors.mobile_number = 'Mobile number is required.';
    } else if (!isMobileValid(mobileRaw, form.country_code)) {
      nextFieldErrors.mobile_number = 'Enter a valid mobile number for the selected country.';
    }

    if (!form.country_code) {
      nextFieldErrors.country_code = 'Country is required.';
    }

    if (!form.city) {
      nextFieldErrors.city = 'City is required.';
    }

    if (!hasProfileLink(instagram, youtube)) {
      nextFieldErrors.profile_link = PROFILE_LINK_REQUIRED_ERROR;
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

    if (!hasCollaborationPreference(form.paid_preference, form.barter_preference)) {
      setError(COLLABORATION_PREFERENCE_ERROR);
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
      city: form.city,
      instagram_link: instagram || null,
      youtube_link: youtube || null,
      primary_category_id: form.primary_category_id,
      paid_preference: form.paid_preference,
      barter_preference: form.barter_preference,
      ...registrationRatesPayload(form.paid_preference, form),
      portfolio_links: [],
      notes: form.notes.trim() || null,
    };

    try {
      await registrationsApi.submit(payload);
      setConfirmation(DEFAULT_CONFIRMATION);
      setSubmitted(true);
    } catch (err) {
      if (err.data?.code === 'duplicate_signup') {
        setConfirmation({
          title: err.data.outcome === 'approved'
            ? 'You\'re already in our network'
            : 'Profile under review',
          body: err.data.message ?? DEFAULT_CONFIRMATION.body,
        });
        setSubmitted(true);
        return;
      }
      setError(err.message ?? 'Registration failed — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SignupShell logoUrl={logoUrl}>
        <div className="campaign-glass-tile mx-auto max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">{confirmation.title}</h1>
          <p className="mt-2 text-sm text-ink-secondary">{confirmation.body}</p>
        </div>
      </SignupShell>
    );
  }

  return (
    <SignupShell logoUrl={logoUrl}>
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-ink">Join our creator network</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Tell us about yourself — our team will review your profile and reach out in case of
            relevant collaboration opportunities.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="campaign-glass-tile space-y-4 p-6">
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

          <Field label="Country & city *">
            <CityCountryField
              countryCode={form.country_code}
              city={form.city}
              cities={cityOptions}
              required
              onCountryChange={(code) => set('country_code')({ target: { value: code } })}
              onCityChange={(value) => setForm((f) => ({ ...f, city: value }))}
            />
            {(fieldErrors.city || fieldErrors.country_code) && (
              <p className="mt-1 text-2xs text-red-700">
                {fieldErrors.city ?? fieldErrors.country_code}
              </p>
            )}
          </Field>

          <Field label="Instagram link">
            <input
              className="input-field"
              type="url"
              value={form.instagram_link}
              onChange={set('instagram_link')}
              placeholder="https://instagram.com/…"
            />
          </Field>
          <Field label="YouTube link">
            <input
              className="input-field"
              type="url"
              value={form.youtube_link}
              onChange={set('youtube_link')}
              placeholder="https://youtube.com/…"
            />
          </Field>
          {fieldErrors.profile_link && (
            <p className="-mt-2 text-2xs text-red-700">{fieldErrors.profile_link}</p>
          )}
          <p className="-mt-2 text-2xs text-ink-tertiary">
            Add at least one profile link — Instagram or YouTube.
          </p>

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

          <CollaborationPreferences
            barterPreference={form.barter_preference}
            paidPreference={form.paid_preference}
            onBarterChange={set('barter_preference')}
            onEnablePaid={() => setForm((f) => formWithPaidPreference(f, true))}
            onPaidChange={set('paid_preference')}
          />

          {showIndicativeRates(form.paid_preference) && (
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
    </SignupShell>
  );
}

/** Barter-primary, paid-secondary — mirrors campaign drawer "Make paid →" weighting. */
function CollaborationPreferences({
  barterPreference,
  paidPreference,
  onBarterChange,
  onEnablePaid,
  onPaidChange,
}) {
  const missingPreference = !hasCollaborationPreference(paidPreference, barterPreference);

  return (
    <div className="campaign-glass-lane space-y-3 p-4">
      <p className="text-2xs font-medium text-ink-secondary">Collaboration preferences *</p>

      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={barterPreference}
          onChange={onBarterChange}
          className="rounded border-line text-brand"
        />
        Open to barter
      </label>

      {paidPreference ? (
        <label className="flex items-center gap-2 text-2xs text-ink-secondary">
          <input
            type="checkbox"
            checked={paidPreference}
            onChange={onPaidChange}
            className="rounded border-line text-brand"
          />
          Open to paid
        </label>
      ) : (
        <button
          type="button"
          className="text-2xs text-brand hover:underline"
          onClick={onEnablePaid}
        >
          Open to paid →
        </button>
      )}

      {missingPreference && (
        <p className="text-2xs text-red-700">{COLLABORATION_PREFERENCE_ERROR}</p>
      )}
    </div>
  );
}

function SignupShell({ logoUrl, children }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center px-4 py-10">
      <SignupAuroraBackground />
      <div className="relative z-10 w-full">
        {logoUrl && (
          <div className="mb-8 flex justify-center">
            <img src={logoUrl} alt="" className="h-10 w-auto max-w-[200px] object-contain" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function SignupAuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#f7f5fa]/90 via-[#f3f5f8]/85 to-[#f0f6f4]/90" />
      <div className="absolute -left-20 -top-24 h-[420px] w-[420px] rounded-full bg-violet-200/30 blur-[120px]" />
      <div className="absolute -right-12 top-[8%] h-[360px] w-[360px] rounded-full bg-orange-100/25 blur-[120px]" />
      <div className="absolute bottom-[-8%] left-[20%] h-[340px] w-[340px] rounded-full bg-teal-100/22 blur-[120px]" />
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
