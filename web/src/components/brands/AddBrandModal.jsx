import { useEffect, useState } from 'react';
import { Drawer } from '../ui/Primitives.jsx';
import { BRAND_CATEGORIES } from '../../lib/brandCategories.js';
import { brandsApi } from '../../lib/api.js';

const EMPTY = {
  brand_name: '',
  brand_category: '',
  primary_contact: '',
  contact_email: '',
  account_manager_id: '',
};

export function AddBrandModal({ open, onClose, onCreated, managers = [] }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setError(null);
  }, [open]);

  const canSave = form.brand_name.trim() && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const created = await brandsApi.create({
        brand_name: form.brand_name.trim(),
        brand_category: form.brand_category || null,
        primary_contact: form.primary_contact.trim() || null,
        contact_email: form.contact_email.trim() || null,
        account_manager_id: form.account_manager_id || null,
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Could not create brand');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      title="New brand"
      onClose={onClose}
      mobileSheet
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Creating…' : 'Create brand'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-800">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-2xs font-medium text-ink-secondary">Brand name</span>
          <input
            className="input-field mt-1"
            value={form.brand_name}
            onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
            placeholder="e.g. BrandX"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="text-2xs font-medium text-ink-secondary">Category</span>
          <select
            className="input-field mt-1"
            value={form.brand_category}
            onChange={(e) => setForm((f) => ({ ...f, brand_category: e.target.value }))}
          >
            <option value="">Select category…</option>
            {BRAND_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-2xs font-medium text-ink-secondary">Primary contact</span>
          <input
            className="input-field mt-1"
            value={form.primary_contact}
            onChange={(e) => setForm((f) => ({ ...f, primary_contact: e.target.value }))}
            placeholder="Optional"
          />
        </label>

        <label className="block">
          <span className="text-2xs font-medium text-ink-secondary">Contact email</span>
          <input
            type="email"
            className="input-field mt-1"
            value={form.contact_email}
            onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            placeholder="Optional"
          />
        </label>

        {managers.length > 0 && (
          <label className="block">
            <span className="text-2xs font-medium text-ink-secondary">Account manager</span>
            <select
              className="input-field mt-1"
              value={form.account_manager_id}
              onChange={(e) => setForm((f) => ({ ...f, account_manager_id: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Drawer>
  );
}
