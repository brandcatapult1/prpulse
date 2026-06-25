import { useEffect, useState } from 'react';
import { Toast } from '../ui/Primitives.jsx';
import { contactsApi, campaignsApi, lookupApi } from '../../lib/api.js';

/**
 * Extensible batch action bar for the contacts list.
 * Each action runs as a single API request for the whole selection.
 */
export function ContactBatchActionBar({
  selectedIds,
  onClear,
  onComplete,
}) {
  const [campaigns, setCampaigns] = useState([]);
  const [tags, setTags] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [tagId, setTagId] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (selectedIds.length === 0) return;
    campaignsApi.list().then((data) => setCampaigns(Array.isArray(data) ? data : [])).catch(() => setCampaigns([]));
    lookupApi.tags().then((data) => setTags(Array.isArray(data) ? data : [])).catch(() => setTags([]));
  }, [selectedIds.length]);

  if (selectedIds.length === 0) return null;

  async function runAction(label, fn) {
    if (busy) return;
    setBusy(true);
    try {
      const message = await fn();
      setToast(message);
      onComplete?.();
      onClear?.();
    } catch (err) {
      setToast(err.message ?? `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function addToCampaign() {
    if (!campaignId) {
      setToast('Pick a campaign first');
      return;
    }
    await runAction('Add to campaign', async () => {
      const result = await campaignsApi.populate(campaignId, { contact_ids: selectedIds });
      const created = result?.created?.length ?? 0;
      const skipped = result?.skipped?.length ?? 0;
      const campaign = campaigns.find((c) => c.id === campaignId);
      return `${created} added to ${campaign?.campaign_name ?? 'campaign'}${skipped ? ` · ${skipped} already on campaign` : ''}`;
    });
  }

  async function toggleStatus() {
    await runAction('Status update', async () => {
      const result = await contactsApi.batchToggleStatus(selectedIds);
      const updated = result?.updated ?? 0;
      const skipped = result?.skipped ?? 0;
      return `${updated} updated${skipped ? ` · ${skipped} skipped (archived)` : ''}`;
    });
  }

  async function addTag() {
    if (!tagId) {
      setToast('Pick a tag first');
      return;
    }
    await runAction('Add tag', async () => {
      const result = await contactsApi.batchAddTag(selectedIds, tagId);
      const tagged = result?.tagged ?? 0;
      const skipped = result?.skipped ?? 0;
      const tagName = result?.tag?.name ?? 'tag';
      return `${tagName} applied to ${tagged}${skipped ? ` · ${skipped} already had tag` : ''}`;
    });
  }

  const actions = [
    {
      id: 'campaign',
      label: 'Add to campaign',
      control: (
        <div className="flex items-center gap-2">
          <select
            className="input-field h-8 min-w-[160px]"
            value={campaignId}
            disabled={busy}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Select campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.campaign_name}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" disabled={busy || !campaignId} onClick={addToCampaign}>
            Apply
          </button>
        </div>
      ),
    },
    {
      id: 'status',
      label: 'Set Active / Inactive',
      control: (
        <button type="button" className="btn-secondary" disabled={busy} onClick={toggleStatus}>
          Toggle status
        </button>
      ),
    },
    {
      id: 'tag',
      label: 'Add tag',
      control: (
        <div className="flex items-center gap-2">
          <select
            className="input-field h-8 min-w-[140px]"
            value={tagId}
            disabled={busy}
            onChange={(e) => setTagId(e.target.value)}
          >
            <option value="">Select tag…</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" disabled={busy || !tagId} onClick={addTag}>
            Apply
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="sticky bottom-4 z-10 mx-auto max-w-6xl">
        <div className="panel flex flex-col gap-3 border-brand/20 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:flex-wrap sm:items-center">
          <div className="text-sm font-medium text-ink">
            {selectedIds.length} selected
          </div>
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {actions.map((action) => (
              <div key={action.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                  {action.label}
                </span>
                {action.control}
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost text-2xs" disabled={busy} onClick={onClear}>
            Clear selection
          </button>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
