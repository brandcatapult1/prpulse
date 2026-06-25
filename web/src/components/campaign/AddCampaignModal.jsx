import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer } from '../ui/Primitives.jsx';
import { brandsApi, campaignsApi, lookupApi } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { TagSelectChips } from '../tags/TagSelectChips.jsx';
import {
  CAMPAIGN_TYPES,
  campaignSchedulePayload,
  validateCampaignSchedule,
} from '../../lib/campaignTypes.js';

function emptyForm(defaultManagerIds = []) {
  return {
    campaign_name: '',
    brand_id: '',
    campaign_type: 'project',
    start_date: '',
    end_date: '',
    target_collaborations: '',
    status: 'draft',
    manager_ids: defaultManagerIds,
    tag_ids: [],
  };
}

function FieldLabel({ children }) {
  return <span className="text-2xs font-medium text-ink-secondary">{children}</span>;
}

export function AddCampaignModal({ open, onClose, onCreated }) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => emptyForm());
  const [brands, setBrands] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tagOptions, setTagOptions] = useState([]);

  const isMonthly = form.campaign_type === 'monthly';
  const scheduleError = validateCampaignSchedule(form);
  const canSave =
    form.campaign_name.trim()
    && form.brand_id
    && form.manager_ids.length > 0
    && !scheduleError
    && !saving;

  useEffect(() => {
    if (!open) return;
    const defaultManagerIds = user?.id ? [user.id] : [];
    setForm(emptyForm(defaultManagerIds));
    setError(null);
    setLoading(true);

    Promise.all([
      brandsApi.list().catch(() => []),
      campaignsApi.assignableManagers().catch(() => []),
      lookupApi.tags().catch(() => []),
    ])
      .then(([brandData, managerData, tags]) => {
        setBrands(Array.isArray(brandData) ? brandData : []);
        setTagOptions(Array.isArray(tags) ? tags : []);
        const list = Array.isArray(managerData) ? managerData : [];
        setManagers(list);
        setForm((f) => {
          const validIds = new Set(list.map((m) => String(m.id)));
          const kept = f.manager_ids.filter((id) => validIds.has(String(id)));
          if (kept.length > 0) return { ...f, manager_ids: kept };
          if (user?.id && validIds.has(String(user.id))) {
            return { ...f, manager_ids: [user.id] };
          }
          return { ...f, manager_ids: list[0] ? [list[0].id] : [] };
        });
      })
      .finally(() => setLoading(false));
  }, [open, user?.id]);

  function setType(nextType) {
    setForm((f) => ({
      ...f,
      campaign_type: nextType,
      end_date: nextType === 'monthly' ? '' : f.end_date,
    }));
  }

  function toggleManager(managerId) {
    const id = String(managerId);
    setForm((f) => {
      const has = f.manager_ids.some((x) => String(x) === id);
      if (has) {
        const next = f.manager_ids.filter((x) => String(x) !== id);
        return { ...f, manager_ids: next };
      }
      return { ...f, manager_ids: [...f.manager_ids, managerId] };
    });
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
        manager_ids: form.manager_ids,
        tag_ids: form.tag_ids,
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
    <Drawer
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
          {loading ? (
            <p className="mt-1 text-2xs text-ink-tertiary">Loading…</p>
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

        <div>
          <FieldLabel>Account managers</FieldLabel>
          <p className="mt-0.5 text-[10px] text-ink-tertiary">
            Who can see and run this campaign
          </p>
          {loading ? (
            <p className="mt-1 text-2xs text-ink-tertiary">Loading team…</p>
          ) : managers.length === 0 ? (
            <p className="mt-1 text-2xs text-ink-tertiary">No managers available</p>
          ) : (
            <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto rounded-md border border-line/80 p-2">
              {managers.map((m) => {
                const checked = form.manager_ids.some((id) => String(id) === String(m.id));
                return (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-2xs text-ink hover:bg-canvas/80"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-line text-brand focus:ring-brand/30"
                      checked={checked}
                      onChange={() => toggleManager(m.id)}
                    />
                    <span>{m.full_name}</span>
                  </label>
                );
              })}
            </div>
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

        <div>
          <FieldLabel>Campaign tags</FieldLabel>
          <p className="mt-0.5 text-[10px] text-ink-tertiary">
            Propagate to creators when they complete a counted collaboration.
          </p>
          <div className="mt-1.5">
            <TagSelectChips
              tags={tagOptions}
              selectedIds={form.tag_ids}
              onChange={(tag_ids) => setForm((f) => ({ ...f, tag_ids }))}
            />
          </div>
        </div>
      </div>
    </Drawer>
  );
}
