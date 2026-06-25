import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { TagSelectChips } from '../tags/TagSelectChips.jsx';
import { contactsApi, lookupApi } from '../../lib/api.js';
import { mergeContactsCache } from '../../lib/contactsCache.js';
import { normalizeMobileToE164 } from '../../lib/phone.js';
import { CLASSIFICATION_OPTIONS } from '../../lib/classifications.js';

const EMPTY = {
  full_name: '',
  mobile_number: '',
  instagram_url: '',
  city: '',
  classification: '',
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

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setDuplicate(null);
    lookupApi.tags().then((data) => setTagOptions(Array.isArray(data) ? data : [])).catch(() => setTagOptions([]));
  }, [open]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'mobile_number') setDuplicate(null);
  }

  async function checkDuplicate(mobile) {
    const e164 = normalizeMobileToE164(mobile);
    if (!e164) {
      setDuplicate(null);
      return;
    }
    try {
      const match = await contactsApi.lookupMobile(e164);
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

  const mobileValid = Boolean(normalizeMobileToE164(form.mobile_number));
  const canSave = form.full_name.trim() && mobileValid && !duplicate;

  async function handleSave() {
    if (!canSave || saving) return;

    setSaving(true);
    try {
      const body = {
        full_name: form.full_name.trim(),
        mobile_number: form.mobile_number.trim(),
        instagram_url: form.instagram_url.trim() || null,
        city: form.city.trim() || null,
        classification: form.classification || null,
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
            <input
              className="input-field mt-1"
              value={form.mobile_number}
              onChange={(e) => updateField('mobile_number', e.target.value)}
              onBlur={(e) => checkDuplicate(e.target.value)}
            />
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
            <input
              className="input-field mt-1"
              value={form.city}
              onChange={(e) => updateField('city', e.target.value)}
            />
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
            Classification
            <select
              className="input-field mt-1"
              value={form.classification}
              onChange={(e) => updateField('classification', e.target.value)}
            >
              <option value="">— Not set —</option>
              {CLASSIFICATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-2xs text-ink-secondary">
              <input
                type="checkbox"
                checked={form.open_to_paid}
                onChange={(e) => updateField('open_to_paid', e.target.checked)}
              />
              Open to paid
            </label>
            <label className="flex items-center gap-2 text-2xs text-ink-secondary">
              <input
                type="checkbox"
                checked={form.open_to_barter}
                onChange={(e) => updateField('open_to_barter', e.target.checked)}
              />
              Open to barter
            </label>
          </div>

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
