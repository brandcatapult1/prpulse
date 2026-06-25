import { useEffect, useState } from 'react';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { campaignsApi, lookupApi } from '../../lib/api.js';
import { TagSelectChips } from '../tags/TagSelectChips.jsx';

const STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'];

export function CampaignEditDrawer({ campaign, open, onClose, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [tagOptions, setTagOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!open) return;
    lookupApi.tags().then((rows) => setTagOptions(Array.isArray(rows) ? rows : [])).catch(() => setTagOptions([]));
  }, [open]);

  useEffect(() => {
    if (campaign) {
      setDraft({
        campaign_name: campaign.campaign_name ?? '',
        status: campaign.status ?? 'draft',
        target_collaborations: campaign.target_collaborations ?? '',
        tag_ids: (campaign.tags ?? []).map((t) => t.id),
      });
    }
  }, [campaign]);

  if (!open || !campaign || !draft) return null;

  async function save() {
    if (!draft.campaign_name.trim()) {
      setToast('Campaign name is required');
      return;
    }
    setSaving(true);
    try {
      const saved = await campaignsApi.update(campaign.id, {
        campaign_name: draft.campaign_name.trim(),
        status: draft.status,
        target_collaborations: draft.target_collaborations === '' || draft.target_collaborations == null
          ? null
          : Number(draft.target_collaborations),
        tag_ids: draft.tag_ids,
      });
      onSaved?.(saved);
      setToast('Campaign saved');
      onClose();
    } catch (err) {
      setToast(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        title="Edit campaign"
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-2xs text-ink-secondary">{campaign.brand_name}</p>

          <label className="block">
            <span className="text-2xs font-medium text-ink-secondary">Campaign name</span>
            <input
              className="input-field mt-1 w-full"
              value={draft.campaign_name}
              onChange={(e) => setDraft((d) => ({ ...d, campaign_name: e.target.value }))}
            />
          </label>

          <label className="block">
            <span className="text-2xs font-medium text-ink-secondary">Status</span>
            <select
              className="input-field mt-1 w-full"
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-2xs font-medium text-ink-secondary">Target collaborations</span>
            <input
              type="number"
              min={0}
              className="input-field mt-1 w-full"
              value={draft.target_collaborations}
              onChange={(e) => setDraft((d) => ({ ...d, target_collaborations: e.target.value }))}
              placeholder="Optional"
            />
          </label>

          <div>
            <span className="text-2xs font-medium text-ink-secondary">Campaign tags</span>
            <p className="mt-0.5 text-[10px] text-ink-tertiary">
              Applied to creators when they complete a counted collaboration on this campaign.
            </p>
            <div className="mt-2">
              <TagSelectChips
                tags={tagOptions}
                selectedIds={draft.tag_ids}
                onChange={(tag_ids) => setDraft((d) => ({ ...d, tag_ids }))}
              />
            </div>
          </div>
        </div>
      </Drawer>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

export function CampaignTagSummary({ tags }) {
  const list = tags ?? [];
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {list.map((t) => (
        <Pill key={t.id ?? t.name ?? t} tone="info">{t.name ?? t}</Pill>
      ))}
    </div>
  );
}
