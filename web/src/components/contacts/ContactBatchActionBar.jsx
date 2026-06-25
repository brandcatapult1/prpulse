import { useEffect, useState } from 'react';
import { Toast } from '../ui/Primitives.jsx';
import { contactsApi, campaignsApi, lookupApi } from '../../lib/api.js';

const EMPTY_DRAFT = {
  campaignId: '',
  statusTarget: '',
  tagId: '',
};

/**
 * Configure-then-Apply batch bar. Each armed action commits as one batched request
 * when the user clicks Apply — never one write per contact.
 */
export function ContactBatchActionBar({
  selectedIds,
  onClear,
  onComplete,
}) {
  const [campaigns, setCampaigns] = useState([]);
  const [tags, setTags] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setDraft(EMPTY_DRAFT);
      return;
    }
    campaignsApi.list().then((data) => setCampaigns(Array.isArray(data) ? data : [])).catch(() => setCampaigns([]));
    lookupApi.tags().then((data) => setTags(Array.isArray(data) ? data : [])).catch(() => setTags([]));
  }, [selectedIds.length]);

  if (selectedIds.length === 0) return null;

  const armedCampaign = Boolean(draft.campaignId);
  const armedStatus = draft.statusTarget === 'active' || draft.statusTarget === 'inactive';
  const armedTag = Boolean(draft.tagId);
  const armedCount = [armedCampaign, armedStatus, armedTag].filter(Boolean).length;
  const canApply = armedCount > 0 && !busy;

  function updateDraft(patch) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleClearSelection() {
    setDraft(EMPTY_DRAFT);
    onClear?.();
  }

  async function handleApply() {
    if (!canApply) return;

    setBusy(true);
    const messages = [];

    try {
      const tasks = [];

      if (armedCampaign) {
        tasks.push(
          campaignsApi.populate(draft.campaignId, { contact_ids: selectedIds }).then((result) => {
            const created = result?.created?.length ?? 0;
            const skipped = result?.skipped?.length ?? 0;
            const campaign = campaigns.find((c) => c.id === draft.campaignId);
            messages.push(
              `${created} added to ${campaign?.campaign_name ?? 'campaign'}${skipped ? ` · ${skipped} already on campaign` : ''}`,
            );
          }),
        );
      }

      if (armedStatus) {
        tasks.push(
          contactsApi.batchSetStatus(selectedIds, draft.statusTarget).then((result) => {
            const updated = result?.updated ?? 0;
            const skipped = result?.skipped ?? 0;
            const label = draft.statusTarget === 'active' ? 'Active' : 'Inactive';
            messages.push(
              `${updated} set to ${label}${skipped ? ` · ${skipped} skipped (archived)` : ''}`,
            );
          }),
        );
      }

      if (armedTag) {
        tasks.push(
          contactsApi.batchAddTag(selectedIds, draft.tagId).then((result) => {
            const tagged = result?.tagged ?? 0;
            const skipped = result?.skipped ?? 0;
            const tagName = result?.tag?.name ?? 'tag';
            messages.push(
              `${tagName} applied to ${tagged}${skipped ? ` · ${skipped} already had tag` : ''}`,
            );
          }),
        );
      }

      await Promise.all(tasks);

      setToast(messages.join(' · '));
      setDraft(EMPTY_DRAFT);
      onComplete?.();
      onClear?.();
    } catch (err) {
      setToast(err.message ?? 'Batch apply failed');
    } finally {
      setBusy(false);
    }
  }

  const selectClass = (armed) =>
    `input-field h-8 min-w-[140px] py-0 text-2xs ${armed ? 'border-brand/40 bg-brand-soft/30' : ''}`;

  return (
    <>
      <div className="sticky bottom-4 z-10 mx-auto max-w-6xl">
        <div className="panel flex flex-col gap-3 border-brand/20 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-ink">
              {selectedIds.length} selected
              {armedCount > 0 && (
                <span className="ml-2 text-2xs font-normal text-ink-tertiary">
                  · {armedCount} action{armedCount === 1 ? '' : 's'} ready
                </span>
              )}
            </div>
            <button type="button" className="btn-ghost text-2xs" disabled={busy} onClick={handleClearSelection}>
              Clear selection
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                Add to campaign
              </span>
              <select
                className={selectClass(armedCampaign)}
                value={draft.campaignId}
                disabled={busy}
                onChange={(e) => updateDraft({ campaignId: e.target.value })}
              >
                <option value="">— Skip —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.campaign_name}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                Set status
              </span>
              <select
                className={selectClass(armedStatus)}
                value={draft.statusTarget}
                disabled={busy}
                onChange={(e) => updateDraft({ statusTarget: e.target.value })}
              >
                <option value="">— Skip —</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                Add tag
              </span>
              <select
                className={selectClass(armedTag)}
                value={draft.tagId}
                disabled={busy}
                onChange={(e) => updateDraft({ tagId: e.target.value })}
              >
                <option value="">— Skip —</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn-primary h-8 sm:ml-auto"
              disabled={!canApply}
              onClick={handleApply}
            >
              {busy ? 'Applying…' : `Apply${armedCount ? ` (${armedCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
