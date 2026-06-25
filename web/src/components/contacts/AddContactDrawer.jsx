import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { TagSelectChips } from '../tags/TagSelectChips.jsx';
import { MobileNumberField } from './MobileNumberField.jsx';
import { CityCountryField } from './CityCountryField.jsx';
import { contactsApi, lookupApi } from '../../lib/api.js';
import { mergeContactsCache } from '../../lib/contactsCache.js';
import { isMobileValid } from '../../lib/phone.js';
import { e164FromDraft } from '../../lib/contactDraft.js';
import { CLASSIFICATION_OPTIONS, classificationSelectLabel } from '../../lib/classifications.js';
import { citiesForCountry } from '../../lib/locations.js';
import { hasCollaborationPreference, COLLABORATION_PREFERENCE_ERROR } from '../../lib/collaborationPrefs.js';

const EMPTY = {
  full_name: '',
  mobile_country_code: 'IN',
  mobile_number: '',
  country: 'IN',
  city: '',
  instagram_url: '',
  classification: '',
  primary_category_id: '',
  open_to_paid: false,
  open_to_barter: false,
  tag_ids: [],
};

/** Single contact-creation drawer — find-and-match essentials only. */
export function AddContactDrawer({ open, onClose, onSaved }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [duplicate, setDuplicate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [tagOptions, setTagOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setDuplicate(null);
    Promise.all([
      lookupApi.tags().catch(() => []),
      lookupApi.cities().catch(() => []),
      lookupApi.categories().catch(() => []),
    ]).then(([tags, cities, categories]) => {
      setTagOptions(Array.isArray(tags) ? tags : []);
      setCityOptions(Array.isArray(cities) ? cities : []);
      setCategoryOptions(Array.isArray(categories) ? categories : []);
    });
  }, [open]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'mobile_number' || key === 'mobile_country_code') setDuplicate(null);
  }

  function updateCountry(countryCode) {
    setForm((prev) => {
      const stillValid = citiesForCountry(cityOptions, countryCode)
        .some((c) => c.name === prev.city);
      return {
        ...prev,
        country: countryCode,
        city: stillValid ? prev.city : '',
      };
    });
  }

  async function checkDuplicate() {
    const e164 = e164FromDraft(form);
    if (!e164) {
      setDuplicate(null);
      return;
    }
    try {
      const match = await contactsApi.lookupMobile(e164, form.mobile_country_code);
      setDuplicate(match ?? null);
    } catch {
      setDuplicate(null);
    }
  }

  function openExisting() {
    if (!duplicate) return;
    onClose();
    navigate(`/contacts/${duplicate.id}`);
  }

  const mobileValid = isMobileValid(form.mobile_number, form.mobile_country_code);
  const preferenceValid = hasCollaborationPreference(form.open_to_paid, form.open_to_barter);
  const canSave = form.full_name.trim() && mobileValid && !duplicate && preferenceValid;

  async function handleSave() {
    if (saving) return;
    if (!form.full_name.trim() || !mobileValid || duplicate) return;
    if (!preferenceValid) {
      setToast(COLLABORATION_PREFERENCE_ERROR);
      return;
    }

    setSaving(true);
    try {
      const body = {
        full_name: form.full_name.trim(),
        mobile_number: form.mobile_number.trim(),
        mobile_country_code: form.mobile_country_code,
        instagram_url: form.instagram_url.trim() || null,
        city: form.city || null,
        country: form.country,
        classification: form.classification || null,
        primary_category_id: form.primary_category_id || null,
        open_to_paid: form.open_to_paid,
        open_to_barter: form.open_to_barter,
        tag_ids: form.tag_ids,
      };

      const result = await contactsApi.create(body);
      mergeContactsCache([result.contact]);
      setToast(`${result.contact.full_name} added`);
      onSaved?.(result.contact);
      onClose();
    } catch (err) {
      if (err.status === 409) {
        const existing = err.data?.existing ?? null;
        if (existing) setDuplicate(existing);
        setToast('That mobile number already belongs to an existing contact');
      } else {
        setToast(err.message ?? 'Could not save contact');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <Drawer
        open={open}
        title="Add contact"
        onClose={onClose}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!canSave || saving} onClick={handleSave}>
              Add contact
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block text-2xs text-ink-secondary">
            Full name
            <input
              className="input-field mt-1"
              value={form.full_name}
              onChange={(e) => updateField('full_name', e.target.value)}
            />
          </label>

          <label className="block text-2xs text-ink-secondary">
            Mobile
            <div className="mt-1">
              <MobileNumberField
                countryCode={form.mobile_country_code}
                nationalNumber={form.mobile_number}
                onCountryChange={(code) => updateField('mobile_country_code', code)}
                onNumberChange={(value) => updateField('mobile_number', value)}
                onBlur={checkDuplicate}
              />
            </div>
          </label>

          {duplicate && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-2xs text-amber-900">
              <p>
                This mobile number already belongs to <strong>{duplicate.full_name}</strong>. Open the
                existing contact instead of creating a new one.
              </p>
              <button type="button" className="btn-primary mt-2" onClick={openExisting}>
                Use existing contact →
              </button>
            </div>
          )}

          <label className="block text-2xs text-ink-secondary">
            City
            <div className="mt-1">
              <CityCountryField
                countryCode={form.country}
                city={form.city}
                cities={cityOptions}
                onCountryChange={updateCountry}
                onCityChange={(value) => updateField('city', value)}
              />
            </div>
          </label>

          <label className="block text-2xs text-ink-secondary">
            Instagram URL
            <input
              className="input-field mt-1"
              value={form.instagram_url}
              onChange={(e) => updateField('instagram_url', e.target.value)}
            />
          </label>

          <label className="block text-2xs text-ink-secondary">
            Primary category
            <select
              className="input-field mt-1"
              value={form.primary_category_id}
              onChange={(e) => updateField('primary_category_id', e.target.value)}
            >
              <option value="">— Not set —</option>
              {categoryOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </label>

          <label className="block text-2xs text-ink-secondary">
            Classification
            <select
              className="input-field mt-1"
              value={form.classification}
              onChange={(e) => updateField('classification', e.target.value)}
            >
              <option value="">— Not set —</option>
              {CLASSIFICATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{classificationSelectLabel(opt)}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-2xs text-ink-secondary">
              <input
                type="checkbox"
                checked={form.open_to_barter}
                onChange={(e) => updateField('open_to_barter', e.target.checked)}
              />
              Open to barter
            </label>
            <label className="flex items-center gap-2 text-2xs text-ink-secondary">
              <input
                type="checkbox"
                checked={form.open_to_paid}
                onChange={(e) => updateField('open_to_paid', e.target.checked)}
              />
              Open to paid
            </label>
          </div>
          {!preferenceValid && (
            <p className="text-2xs text-red-700">{COLLABORATION_PREFERENCE_ERROR}</p>
          )}

          <div>
            <div className="text-2xs text-ink-secondary">Tags</div>
            <div className="mt-1">
              <TagSelectChips
                tags={tagOptions}
                selectedIds={form.tag_ids}
                onChange={(ids) => updateField('tag_ids', ids)}
              />
            </div>
          </div>
        </div>
      </Drawer>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
