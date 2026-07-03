import { useEffect, useState } from 'react';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { Pill } from '../../lib/format.jsx';
import { campaignsApi, lookupApi } from '../../lib/api.js';
import { TagSelectChips } from '../tags/TagSelectChips.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canEditCampaignTermMonths } from '../../lib/campaignPermissions.js';
import {
  parseTargetCollaborationsInput,
  parseTermMonthsInput,
  targetCollaborationsLabel,
  validateCampaignTarget,
  validateTermMonths,
} from '../../lib/campaignTypes.js';

const STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'];

export function CampaignEditDrawer({ campaign, open, onClose, onSaved }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState(null);
  const [tagOptions, setTagOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const isMonthly = campaign?.campaign_type === 'monthly';
  const canEditTermMonths = canEditCampaignTermMonths(user?.role);

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
        term_months: campaign.term_months ?? '',
        tag_ids: (campaign.tags ?? []).map((t) => t.id),
      });
    }
  }, [campaign]);

  if (!open || !campaign || !draft) return null;

  const targetError = validateCampaignTarget({
    campaign_type: campaign.campaign_type,
    target_collaborations: draft.target_collaborations,
  });
  const termMonthsError = isMonthly && canEditTermMonths
    ? validateTermMonths({ campaign_type: 'monthly', term_months: draft.term_months })
    : null;
  const canSave = draft.campaign_name.trim() && !targetError && !termMonthsError && !saving;

  async function save() {
    if (!draft.campaign_name.trim()) {
      setToast('Campaign name is required');
      return;
    }
    if (targetError || termMonthsError) {
      setToast(targetError ?? termMonthsError);
      return;
    }
    setSaving(true);
    try {
      const body = {
        campaign_name: draft.campaign_name.trim(),
        status: draft.status,
        target_collaborations: parseTargetCollaborationsInput(draft.target_collaborations),
        tag_ids: draft.tag_ids,
      };
      if (isMonthly && canEditTermMonths) {
        body.term_months = parseTermMonthsInput(draft.term_months);
      }
      const saved = await campaignsApi.update(campaign.id, body);
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
            <button type="button" className="btn-primary" onClick={save} disabled={!canSave}>
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

          {isMonthly && (
            <div className="block">
              <span className="text-2xs font-medium text-ink-secondary">Number of months</span>
              <p className="mt-0.5 text-[10px] text-ink-tertiary">
                How long this monthly retainer runs
              </p>
              {canEditTermMonths ? (
                <>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="input-field mt-1 w-full"
                    value={draft.term_months}
                    onChange={(e) => setDraft((d) => ({ ...d, term_months: e.target.value }))}
                    placeholder="Required"
                  />
                  {termMonthsError && (
                    <p className="mt-1 text-2xs text-red-700">{termMonthsError}</p>
                  )}
                </>
              ) : (
                <p className="mt-1 tabular-nums text-sm text-ink">{campaign.term_months ?? '—'}</p>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-2xs font-medium text-ink-secondary">
              {targetCollaborationsLabel(campaign.campaign_type)}
            </span>
            <input
              type="number"
              min={0}
              className="input-field mt-1 w-full"
              value={draft.target_collaborations}
              onChange={(e) => setDraft((d) => ({ ...d, target_collaborations: e.target.value }))}
              placeholder="Required"
            />
            {targetError && (
              <p className="mt-1 text-2xs text-red-700">{targetError}</p>
            )}
          </label>

          <div>
            <span className="text-2xs font-medium text-ink-secondary">Campaign tags</span>
            <p className="mt-0.5 text-[10px] text-ink-tertiary">
              Applied to creators when they complete a counted collaboration on this campaign.
            </p>
            <div className="mt-2">
              <TagSelectChips
                tags={tagOptions}
                appliedTags={campaign.tags ?? []}
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
