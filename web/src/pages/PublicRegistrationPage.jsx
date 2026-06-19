import { useState } from 'react';
import { Link } from 'react-router-dom';
import { registrationsApi } from '../lib/api.js';
import { addRegistrationSubmission } from '../lib/demoStore.js';

const EMPTY = {
  full_name: '',
  mobile_number: '',
  email: '',
  city: '',
  instagram_link: '',
  youtube_link: '',
  category: '',
  paid_preference: false,
  barter_preference: false,
  reel_rate: '',
  story_rate: '',
  portfolio_links: '',
  notes: '',
};

export function PublicRegistrationPage() {
  const [form, setForm] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.mobile_number.trim()) {
      setError('Full name and mobile number are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      full_name: form.full_name.trim(),
      mobile_number: form.mobile_number.trim(),
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      instagram_link: form.instagram_link.trim() || null,
      youtube_link: form.youtube_link.trim() || null,
      category: form.category.trim() || null,
      paid_preference: form.paid_preference,
      barter_preference: form.barter_preference,
      reel_rate: form.reel_rate ? Number(form.reel_rate) : null,
      story_rate: form.story_rate ? Number(form.story_rate) : null,
      portfolio_links: form.portfolio_links
        ? form.portfolio_links.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
      notes: form.notes.trim() || null,
    };

    try {
      await registrationsApi.submit(payload);
    } catch {
      addRegistrationSubmission({
        id: `r-${Date.now()}`,
        ...payload,
        status: 'new',
        linked_contact_id: null,
        created_at: new Date().toISOString(),
      });
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
    <div className="min-h-screen bg-canvas py-8">
      <div className="mx-auto w-full max-w-lg px-4">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Creator registration</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Tell us about yourself — we&apos;ll review and add you to our roster if it&apos;s a fit.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-6 shadow-sm">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-800">{error}</p>
          )}

          <Field label="Full name *">
            <input className="input-field" required value={form.full_name} onChange={set('full_name')} placeholder="Your name" />
          </Field>
          <Field label="Mobile number *">
            <input className="input-field" required type="tel" value={form.mobile_number} onChange={set('mobile_number')} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email">
            <input className="input-field" type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" />
          </Field>
          <Field label="City">
            <input className="input-field" value={form.city} onChange={set('city')} placeholder="Delhi" />
          </Field>
          <Field label="Instagram link">
            <input className="input-field" type="url" value={form.instagram_link} onChange={set('instagram_link')} placeholder="https://instagram.com/…" />
          </Field>
          <Field label="YouTube link">
            <input className="input-field" type="url" value={form.youtube_link} onChange={set('youtube_link')} placeholder="https://youtube.com/…" />
          </Field>
          <Field label="Category">
            <input className="input-field" value={form.category} onChange={set('category')} placeholder="Food, Beauty, Travel…" />
          </Field>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <input type="checkbox" checked={form.paid_preference} onChange={set('paid_preference')} className="rounded border-line text-brand" />
              Open to paid
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <input type="checkbox" checked={form.barter_preference} onChange={set('barter_preference')} className="rounded border-line text-brand" />
              Open to barter
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reel rate (₹)">
              <input className="input-field" type="number" min={0} value={form.reel_rate} onChange={set('reel_rate')} placeholder="15000" />
            </Field>
            <Field label="Story rate (₹)">
              <input className="input-field" type="number" min={0} value={form.story_rate} onChange={set('story_rate')} placeholder="5000" />
            </Field>
          </div>

          <Field label="Portfolio links (one per line)">
            <textarea className="input-field min-h-[72px] py-2" value={form.portfolio_links} onChange={set('portfolio_links')} placeholder="https://…" />
          </Field>
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
