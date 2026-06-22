import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/Primitives.jsx';
import { brandsApi, campaignsApi } from '../../lib/api.js';
import {
  CAMPAIGN_TYPES,
  campaignSchedulePayload,
  validateCampaignSchedule,
} from '../../lib/campaignTypes.js';

const EMPTY = {
  campaign_name: '',
  brand_id: '',
  campaign_type: 'project',
  start_date: '',
  end_date: '',
  target_collaborations: '',
  status: 'draft',
};

function FieldLabel({ children }) {
  return <span className="text-2xs font-medium text-ink-secondary">{children}</span>;
}

export function AddCampaignModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [brands, setBrands] = useState([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isMonthly = form.campaign_type === 'monthly';
  const scheduleError = validateCampaignSchedule(form);
  const canSave =
    form.campaign_name.trim()
    && form.brand_id
    && !scheduleError
    && !saving;

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setError(null);
    setLoadingBrands(true);
    brandsApi
      .list()
      .then((data) => setBrands(Array.isArray(data) ? data : []))
      .catch(() => setBrands([]))
      .finally(() => setLoadingBrands(false));
  }, [open]);

  function setType(nextType) {
    setForm((f) => ({
      ...f,
      campaign_type: nextType,
      end_date: nextType === 'monthly' ? '' : f.end_date,
    }));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const created = await campaignsApi.create({
        campaign_name: form.campaign_name.trim(),
        brand_id: form.brand_id,
        target_collaborations: form.target_collaborations.trim()
          ? Number(form.target_collaborations)
          : null,
        status: form.status,
        ...campaignSchedulePayload(form),
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Could not create campaign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="New campaign"
      onClose={onClose}
      mobileSheet
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Creating…' : 'Create campaign'}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-800">
            {error}
          </div>
        )}

        <label className="block">
          <FieldLabel>Campaign name</FieldLabel>
          <input
            className="input-field mt-1"
            value={form.campaign_name}
            onChange={(e) => setForm((f) => ({ ...f, campaign_name: e.target.value }))}
            placeholder="e.g. Summer Menu Push"
            autoFocus
          />
        </label>

        <label className="block">
          <FieldLabel>Brand</FieldLabel>
          {loadingBrands ? (
            <p className="mt-1 text-2xs text-ink-tertiary">Loading brands…</p>
          ) : brands.length === 0 ? (
            <p className="mt-1 text-2xs text-ink-secondary">
              Add a brand first on the{' '}
              <Link to="/brands" className="text-brand hover:underline" onClick={onClose}>
                Brands
              </Link>{' '}
              page.
            </p>
          ) : (
            <select
              className="input-field mt-1"
              value={form.brand_id}
              onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))}
            >
              <option value="">Select brand…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.brand_name}
                </option>
              ))}
            </select>
          )}
        </label>

        <div>
          <FieldLabel>Campaign type</FieldLabel>
          <div className="mt-1 flex rounded-md border border-line/80 p-0.5">
            {CAMPAIGN_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`flex-1 rounded px-2 py-1.5 text-2xs font-medium transition-colors ${
                  form.campaign_type === value
                    ? 'bg-ink text-white'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={isMonthly ? 'block' : 'grid grid-cols-2 gap-3'}>
          <label className="block">
            <FieldLabel>Start date</FieldLabel>
            <input
              type="date"
              className="input-field mt-1"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
            />
          </label>
          {!isMonthly && (
            <label className="block">
              <FieldLabel>End date</FieldLabel>
              <input
                type="date"
                className="input-field mt-1"
                min={form.start_date || undefined}
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </label>
          )}
        </div>

        <label className="block">
          <FieldLabel>Target collaborations</FieldLabel>
          <input
            type="number"
            min="0"
            className="input-field mt-1"
            value={form.target_collaborations}
            onChange={(e) => setForm((f) => ({ ...f, target_collaborations: e.target.value }))}
            placeholder="Optional"
          />
        </label>

        <label className="block">
          <FieldLabel>Status</FieldLabel>
          <select
            className="input-field mt-1"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
