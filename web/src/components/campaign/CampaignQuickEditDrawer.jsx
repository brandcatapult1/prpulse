import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusButton } from '../ui/DataKit.jsx';
import { Drawer, Modal, Toast } from '../ui/Primitives.jsx';
import { AddDeliverableModal } from '../deliverables/AddDeliverableModal.jsx';
import { DeliverableRow } from '../deliverables/DeliverableProofSection.jsx';
import { formatDate, formatFee, formatStatus } from '../../lib/format.jsx';
import { collaborationReasonLabel, COLLABORATION_REASONS } from '../../lib/collaborationReasons.js';
import { buildNewDeliverable, DELIVERABLE_TYPES } from '../../lib/deliverableTypes.js';
import { addDaysIso, todayIso } from '../../lib/dates.js';
import {
  getDemoDeliverables,
  getDemoEngagement,
  saveDeliverablesOverride,
  saveEngagementOverride,
} from '../../lib/demo.js';
import { getEngagementOverride } from '../../lib/demoStore.js';
import { recordEngagementPatchActivity } from '../../lib/activityLog.js';
import {
  canSetDeliverableStatus,
  deliverableStatusBlockReason,
  deliverableStatusOptionsForEngagement,
  deliverablesRules,
  followUpSuggestionForStatus,
  getStatusOptions,
  interestRules,
  isComplete,
  sideEffectsOnStatusChange,
} from '../../lib/engagementRules.js';

const REASON_OPTIONS = [
  { value: '', label: 'Select reason…' },
  ...COLLABORATION_REASONS,
];

const INTEREST_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export function CampaignQuickEditDrawer({ engagementId, open, onClose, onUpdated }) {
  const [engagement, setEngagement] = useState(null);
  const [deliverables, setDeliverables] = useState([]);
  const [visitOpen, setVisitOpen] = useState(false);
  const [addDeliverableType, setAddDeliverableType] = useState('reel');
  const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!open || !engagementId) return;
    setEngagement(getDemoEngagement(engagementId));
    setDeliverables(getDemoDeliverables(engagementId));
  }, [open, engagementId]);

  if (!engagementId || !engagement) return null;

  const canComplete =
    deliverables.length > 0 && deliverables.every((d) => d.status === 'posted');
  const status = engagement.conversation_status;
  const interestEditable = interestRules(status).editable;
  const deliverablesRule = deliverablesRules(status);
  const deliverableStatusOptions = deliverableStatusOptionsForEngagement(status);
  const postedCount = deliverables.filter((d) => d.status === 'posted').length;

  function persistDeliverables(nextList, message) {
    saveDeliverablesOverride(engagementId, nextList);
    setDeliverables(nextList);
    onUpdated?.();
    if (message) setToast(message);
  }

  function updateDeliverable(delId, patch) {
    if (patch.status && !canSetDeliverableStatus(status, patch.status)) {
      setToast(
        deliverableStatusBlockReason(status, patch.status)
          ?? 'This status is not available at the current stage',
      );
      return;
    }
    persistDeliverables(
      deliverables.map((d) => (d.id === delId ? { ...d, ...patch } : d)),
      patch.status ? 'Deliverable updated' : 'Proof saved',
    );
  }

  function handleAddDeliverable({ type, quantity, dueDate }) {
    const newItem = buildNewDeliverable({ type, quantity, dueDate });
    persistDeliverables(
      [...deliverables, newItem],
      `Added ${type} ×${newItem.quantity}`,
    );
    setAddDeliverableOpen(false);
  }

  function openAddDeliverable(type = 'reel') {
    if (!deliverablesRule.canAdd) return;
    setAddDeliverableType(type);
    setAddDeliverableOpen(true);
  }

  function persist(patch, message) {
    const before = {
      ...getDemoEngagement(engagementId),
      ...getEngagementOverride(engagementId),
    };
    const next = { ...engagement, ...patch };
    setEngagement(next);
    saveEngagementOverride(engagementId, patch);
    recordEngagementPatchActivity(engagementId, before, patch);
    onUpdated?.();
    if (message) setToast(message);
  }

  function handleStatusChange(next) {
    if (next === 'scheduled') {
      setVisitOpen(true);
      return;
    }
    const patch = {
      conversation_status: next,
      ...sideEffectsOnStatusChange(next),
    };
    const suggestion = followUpSuggestionForStatus(next);
    if (suggestion) {
      patch.next_follow_up_date = addDaysIso(suggestion.days);
    }
    persist(patch, `Moved to ${formatStatus(next)}`);
  }

  function handleVisitSave(visitDate) {
    persist(
      {
        conversation_status: 'scheduled',
        visit_date: visitDate,
        next_follow_up_date: visitDate,
      },
      `Visit set for ${formatDate(visitDate)}`,
    );
    setVisitOpen(false);
  }

  const statusOptions = getStatusOptions({
    current: status,
    canComplete,
    formatStatus,
  });

  return (
    <>
      <Drawer
        open={open}
        title={engagement.contact_name}
        subtitle={engagement.campaign_name}
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
            <Link to={`/engagements/${engagementId}`} className="btn-ghost text-2xs" onClick={onClose}>
              Full record →
            </Link>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Primary action — status update (PRD §5.2) */}
          <section className="rounded-lg border border-brand/20 bg-brand-soft/40 p-4">
            <p className="text-2xs font-medium uppercase tracking-wide text-brand">What&apos;s next?</p>
            <p className="mt-0.5 text-2xs text-ink-secondary">Move this creator — takes one tap</p>
            <div className="mt-3">
              <StatusButton
                value={status}
                options={statusOptions}
                onChange={handleStatusChange}
                hint={
                  !canComplete && status !== 'collaboration_complete'
                    ? 'Complete unlocks when all deliverables are Posted'
                    : undefined
                }
              />
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-2xs text-ink-secondary">
              Collab reason
              <select
                className="input-field mt-1"
                value={engagement.primary_collaboration_reason ?? ''}
                onChange={(e) =>
                  persist(
                    { primary_collaboration_reason: e.target.value || null },
                    'Reason updated',
                  )
                }
              >
                {REASON_OPTIONS.map((o) => (
                  <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
                ))}
              </select>
              {!engagement.primary_collaboration_reason && (
                <span className="mt-1 block text-[11px] text-health-amber">Required before marking complete</span>
              )}
            </label>

            <label className="block text-2xs text-ink-secondary">
              Interest
              <select
                className="input-field mt-1"
                disabled={!interestEditable}
                value={engagement.interest_level ?? 'medium'}
                onChange={(e) => persist({ interest_level: e.target.value }, 'Interest updated')}
              >
                {INTEREST_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="block text-2xs text-ink-secondary">
              Next follow-up
              <input
                type="date"
                className="input-field mt-1"
                disabled={isComplete(status) || status?.startsWith('dropped_')}
                value={engagement.next_follow_up_date ?? ''}
                onChange={(e) =>
                  persist({ next_follow_up_date: e.target.value || null }, 'Follow-up updated')
                }
              />
            </label>

            <div>
              <p className="text-2xs text-ink-secondary">Agreed fee</p>
              <p className="mt-1 text-sm font-medium text-ink">{formatFee(engagement.agreed_fee)}</p>
            </div>
          </div>

          {collaborationReasonLabel(engagement.primary_collaboration_reason) && (
            <p className="text-2xs text-ink-tertiary">
              Reason: <span className="font-medium text-ink">{collaborationReasonLabel(engagement.primary_collaboration_reason)}</span>
            </p>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Deliverables</h3>
              <span className="text-2xs text-ink-tertiary">
                {postedCount}/{deliverables.length} posted
              </span>
            </div>

            {deliverablesRule.lockedReason && (
              <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-2xs text-ink-secondary">
                {deliverablesRule.lockedReason}
              </p>
            )}
            {deliverablesRule.hint && (
              <p className="mt-2 text-2xs text-ink-tertiary">{deliverablesRule.hint}</p>
            )}

            {deliverablesRule.canAdd && (
              <div className="mt-3">
                <p className="mb-2 text-2xs font-medium text-ink-tertiary">Add content type</p>
                <div className="flex flex-wrap gap-2">
                  {DELIVERABLE_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className="btn-secondary !py-1 text-[11px]"
                      onClick={() => openAddDeliverable(value)}
                    >
                      + {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {deliverables.length === 0 ? (
              <p className="mt-3 text-2xs text-ink-secondary">
                {deliverablesRule.canAdd
                  ? 'None yet — tap + Reel, + Story, or + Post once commercials are agreed.'
                  : 'None yet.'}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {deliverables.map((d) => (
                  <DeliverableRow
                    key={d.id}
                    deliverable={d}
                    canEditStatus={deliverablesRule.canEditStatus}
                    canEditProof={false}
                    deliverableStatusOptions={deliverableStatusOptions}
                    onStatusChange={(delId, nextStatus) => updateDeliverable(delId, { status: nextStatus })}
                    onUpdate={updateDeliverable}
                    compact
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Notes</h3>
            <textarea
              className="input-field mt-2 min-h-[80px] w-full text-sm"
              value={engagement.notes ?? ''}
              placeholder="Quick context for the team…"
              onChange={(e) => setEngagement((prev) => ({ ...prev, notes: e.target.value }))}
              onBlur={(e) => {
                const notes = e.target.value.trim() || null;
                if (notes !== (engagement.notes ?? null)) {
                  persist({ notes }, 'Notes saved');
                }
              }}
            />
          </div>

          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => persist({ last_contact_date: todayIso() }, 'Logged contact for today')}
          >
            Log contact for today
          </button>
        </div>
      </Drawer>

      <VisitModal
        open={visitOpen}
        contactName={engagement.contact_name}
        onClose={() => setVisitOpen(false)}
        onSave={handleVisitSave}
      />

      <AddDeliverableModal
        open={addDeliverableOpen}
        initialType={addDeliverableType}
        contactName={engagement.contact_name}
        onClose={() => setAddDeliverableOpen(false)}
        onAdd={handleAddDeliverable}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

function VisitModal({ open, onClose, contactName, onSave }) {
  const [visitDate, setVisitDate] = useState('');

  useEffect(() => {
    if (open) setVisitDate('');
  }, [open]);

  return (
    <Modal
      open={open}
      title={`Plan visit · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!visitDate}
            onClick={() => onSave(visitDate)}
          >
            Save & schedule
          </button>
        </div>
      }
    >
      <p className="mb-4 text-2xs text-ink-secondary">
        Pick a visit date — follow-up will auto-set to the same day.
      </p>
      <label className="block text-2xs text-ink-secondary">
        Visit date
        <input
          type="date"
          className="input-field mt-1"
          required
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
        />
      </label>
    </Modal>
  );
}
