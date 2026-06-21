import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusButton } from '../ui/DataKit.jsx';
import { Drawer, Modal, Toast } from '../ui/Primitives.jsx';
import { DeliverableTypeButtons, deliverableTypeLabel } from '../deliverables/DeliverableTypeButtons.jsx';
import { formatDate, formatStatus, Pill } from '../../lib/format.jsx';
import { COLLABORATION_REASONS } from '../../lib/collaborationReasons.js';
import { buildNewDeliverable } from '../../lib/deliverableTypes.js';
import { addDaysIso } from '../../lib/dates.js';
import { engagementsApi } from '../../lib/api.js';
import {
  patchEngagement,
  syncDeliverables,
  patchContact,
  fetchDeliverables,
} from '../../lib/persistence.js';
import { updateEngagementDeliverables } from '../../lib/deliverablesCache.js';
import { updateCachedContact } from '../../lib/contactsCache.js';
import { getDrawerContactIdentity } from '../../lib/contactSocialLinks.js';
import { STAGE, transitionStage } from '../../lib/engagementTransitions.js';
import {
  deliverablesRules,
  canRemoveDeliverable,
  followUpSuggestionForStatus,
  getStatusOptions,
  isComplete,
  sideEffectsOnStatusChange,
} from '../../lib/engagementRules.js';

const REASON_OPTIONS = [
  { value: '', label: 'Select reason…' },
  ...COLLABORATION_REASONS,
];

function SectionLabel({ children, className = '' }) {
  return (
    <p className={`mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-tertiary ${className}`}>
      {children}
    </p>
  );
}

/** Subtle filled block — accent for strategic fields, neutral for grouped commercial content. */
function SectionBlock({ tone = 'neutral', children, className = '' }) {
  const toneClass =
    tone === 'accent'
      ? 'border-brand/10 bg-brand-soft/30'
      : 'border-line/80 bg-canvas/70';
  return (
    <div className={`rounded-md border px-3 py-2.5 ${toneClass} ${className}`}>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <span className="text-2xs text-ink-secondary">{children}</span>
  );
}

function drawerDeliverablesNote(status, rule, count) {
  if (rule.lockedReason) {
    if (rule.lockedReason.includes('complete')) return 'Locked';
    if (rule.lockedReason.includes('dropped')) return null;
    if (rule.lockedReason.includes('outreach')) return 'Outreach first';
  }
  if (count === 0 && rule.canAdd && status === 'awaiting_final_deliverables') {
    return 'Add at least one';
  }
  return null;
}

function drawerCompleteHint(canComplete, status, deliverableCount) {
  if (canComplete || status === 'collaboration_complete') return undefined;
  if (status === 'awaiting_final_deliverables' && deliverableCount > 0) {
    return 'Post all to complete';
  }
  return undefined;
}

function DeliverableChip({ deliverable, canRemove, onRemove }) {
  const posted = deliverable.status === 'posted';
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 rounded border border-line/80 px-2 py-0.5 text-[11px] font-medium',
        posted ? 'bg-canvas/40 text-ink-secondary' : 'bg-white text-ink',
      ].join(' ')}
    >
      {deliverableTypeLabel(deliverable.deliverable_type)} ×{deliverable.quantity}
      {canRemove && (
        <button
          type="button"
          aria-label={`Remove ${deliverableTypeLabel(deliverable.deliverable_type)}`}
          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-ink-tertiary hover:bg-canvas hover:text-ink"
          onClick={() => onRemove(deliverable.id)}
        >
          ×
        </button>
      )}
    </span>
  );
}

function IconButton({ label, title, href, disabled, onClick, children, className = '' }) {
  const shared = `inline-flex h-7 w-7 items-center justify-center rounded border border-line/80 transition-colors ${className}`;
  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={title}
        className={`${shared} hover:bg-canvas`}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${shared} ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-canvas'}`}
    >
      {children}
    </button>
  );
}

function WhatsAppIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M6 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 4h4l1.5 5-2.2 1.4a11 11 0 005.3 5.3L15 13.5 20 15v4a2 2 0 01-2.2 2A16 16 0 013 6.2 2 2 0 015 4z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="ml-0.5 inline h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 3h7v7M10 14L21 3M21 10v11H3V3h11" />
    </svg>
  );
}

function DrawerIdentityHeader({ engagement, onEmailSaved, onToast }) {
  const identity = getDrawerContactIdentity(engagement);
  const [emailDraft, setEmailDraft] = useState(identity.email ?? '');
  const [editingEmail, setEditingEmail] = useState(!identity.email);

  useEffect(() => {
    setEmailDraft(identity.email ?? '');
    setEditingEmail(!identity.email);
  }, [engagement.id, identity.email]);

  async function saveEmail() {
    if (!identity.contactId) return;
    const trimmed = emailDraft.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      onToast?.('Enter a valid email address');
      return;
    }
    try {
      await patchContact(identity.contactId, { email: trimmed || null });
      updateCachedContact(identity.contactId, { email: trimmed || null });
      onEmailSaved?.();
      setEditingEmail(!trimmed);
      onToast?.(trimmed ? 'Email saved' : 'Email cleared');
    } catch (err) {
      onToast?.(err.message ?? 'Could not save email');
    }
  }

  async function copyNumber() {
    if (!identity.mobileDisplay) return;
    try {
      await navigator.clipboard.writeText(identity.mobileDisplay);
      onToast?.('Number copied');
    } catch {
      onToast?.('Could not copy number');
    }
  }

  return (
    <section className="pb-3 pt-0.5">
      <h2 className="text-base font-medium tracking-tight text-ink">{engagement.contact_name}</h2>
      <div className="mt-0.5">
        {identity.profileUrl ? (
          <a
            href={identity.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-2xs text-brand hover:underline"
          >
            {identity.handleLabel}
            <ExternalIcon />
          </a>
        ) : (
          <span className="text-2xs text-ink-tertiary">{identity.handleLabel}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-2xs text-ink-secondary">
          {identity.mobileDisplay ?? 'No phone on file'}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton
            label="WhatsApp"
            title="WhatsApp"
            href={identity.whatsAppUrl}
            disabled={!identity.whatsAppUrl}
            className="text-health-green"
          >
            <WhatsAppIcon />
          </IconButton>
          <IconButton
            label="Copy number"
            title="Copy number"
            disabled={!identity.mobileDisplay}
            onClick={copyNumber}
          >
            <CopyIcon />
          </IconButton>
          <IconButton
            label="Call"
            title="Call"
            href={identity.telUrl}
            disabled={!identity.telUrl}
          >
            <PhoneIcon />
          </IconButton>
        </div>
      </div>

      <div className="mt-1.5">
        {editingEmail ? (
          <div className="flex items-center gap-1.5">
            <input
              type="email"
              className="input-field h-7 flex-1 text-2xs"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="Add email"
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEmail();
                if (e.key === 'Escape') {
                  setEmailDraft(identity.email ?? '');
                  setEditingEmail(Boolean(identity.email));
                }
              }}
            />
            <button type="button" className="btn-secondary !h-7 !px-2 text-2xs" onClick={saveEmail}>
              Save
            </button>
            {identity.email && (
              <button
                type="button"
                className="btn-ghost !h-7 text-2xs"
                onClick={() => {
                  setEmailDraft(identity.email ?? '');
                  setEditingEmail(false);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="text-2xs text-brand hover:underline"
            onClick={() => setEditingEmail(true)}
          >
            {identity.email ? identity.email : '+ email'}
          </button>
        )}
      </div>
    </section>
  );
}

export function CampaignQuickEditDrawer({ engagementId, open, onClose, onUpdated }) {
  const [engagement, setEngagement] = useState(null);
  const [deliverables, setDeliverables] = useState([]);
  const [visitOpen, setVisitOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [identityRevision, setIdentityRevision] = useState(0);

  useEffect(() => {
    if (!open || !engagementId) return;
    Promise.all([
      engagementsApi.get(engagementId),
      fetchDeliverables(engagementId),
    ]).then(([eng, dels]) => {
      setEngagement(eng);
      setDeliverables(dels ?? []);
      updateEngagementDeliverables(engagementId, dels ?? []);
    }).catch(() => {
      setEngagement(null);
      setDeliverables([]);
    });
  }, [open, engagementId]);

  if (!engagementId || !engagement) return null;

  const canComplete =
    deliverables.length > 0 && deliverables.every((d) => d.status === 'posted');
  const status = engagement.conversation_status;
  const deliverablesRule = deliverablesRules(status);
  const postedCount = deliverables.filter((d) => d.status === 'posted').length;
  const collabType = engagement.collaboration_type === 'paid' ? 'paid' : 'barter';
  const deliverablesNote = drawerDeliverablesNote(status, deliverablesRule, deliverables.length);
  const completeHint = drawerCompleteHint(canComplete, status, deliverables.length);

  async function persistDeliverables(nextList, message) {
    try {
      const saved = await syncDeliverables(engagementId, deliverables, nextList);
      setDeliverables(saved);
      updateEngagementDeliverables(engagementId, saved);
      onUpdated?.();
      if (message) setToast(message);
    } catch (err) {
      setToast(err.message ?? 'Could not save deliverables');
    }
  }

  function addDeliverable(type) {
    if (!deliverablesRule.canAdd) return;
    const newItem = buildNewDeliverable({ type, engagementStatus: status });
    persistDeliverables(
      [...deliverables, newItem],
      `Added ${deliverableTypeLabel(type)} ×${newItem.quantity}`,
    );
  }

  function removeDeliverable(delId) {
    const item = deliverables.find((d) => d.id === delId);
    if (!item || !canRemoveDeliverable(status, item)) return;
    persistDeliverables(
      deliverables.filter((d) => d.id !== delId),
      `Removed ${deliverableTypeLabel(item.deliverable_type)} ×${item.quantity}`,
    );
  }

  async function persist(patch, message) {
    try {
      const updated = await patchEngagement(engagementId, patch);
      setEngagement((prev) => ({ ...prev, ...updated }));
      onUpdated?.();
      if (message) setToast(message);
    } catch (err) {
      setToast(err.message ?? 'Save failed');
    }
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
    const result = transitionStage(engagement, STAGE.SCHEDULED, { visitDate });
    if (!result.ok) {
      setToast(result.error ?? 'Could not schedule visit');
      if (result.focusDeliverables) {
        document.getElementById('campaign-drawer-deliverables')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
      return;
    }
    persist(result.patch, `Visit set for ${formatDate(visitDate)}`);
    setVisitOpen(false);
  }

  function makePaid() {
    persist({ collaboration_type: 'paid' }, 'Switched to paid');
  }

  function makeBarter() {
    persist({ collaboration_type: 'barter', agreed_fee: null }, 'Switched to barter');
  }

  function saveAgreedFee(raw) {
    const fee = raw === '' ? null : Number(raw);
    if (collabType === 'paid' && (fee == null || Number.isNaN(fee) || fee <= 0)) {
      setToast('Agreed fee is required for paid collabs');
      return;
    }
    persist({ agreed_fee: fee }, 'Fee updated');
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
        onClose={onClose}
        footer={
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
            <Link to={`/engagements/${engagementId}`} className="btn-ghost text-2xs" onClick={onClose}>
              Full record →
            </Link>
          </div>
        }
      >
        <div className="divide-y divide-line/80">
          <DrawerIdentityHeader
            key={`${engagement.id}-${identityRevision}`}
            engagement={engagement}
            onEmailSaved={() => setIdentityRevision((r) => r + 1)}
            onToast={setToast}
          />

          <section className="py-3">
            <SectionBlock tone="accent">
              <SectionLabel className="mb-1 text-brand/70">Collab reason</SectionLabel>
              <select
                className="input-field h-8"
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
                <p className="mt-1 text-[10px] text-health-amber">Required before complete</p>
              )}
            </SectionBlock>
          </section>

          <section className="py-3">
            <SectionLabel>Status &amp; next step</SectionLabel>
            <div className="space-y-2.5">
              <label className="block">
                <FieldLabel>Move to</FieldLabel>
                <div className="mt-1 [&_select]:max-w-none">
                  <StatusButton
                    value={status}
                    options={statusOptions}
                    onChange={handleStatusChange}
                    hint={completeHint}
                  />
                </div>
              </label>
              {!isComplete(status) && !status?.startsWith('dropped_') && (
                <label className="block">
                  <FieldLabel>Next follow-up</FieldLabel>
                  <input
                    type="date"
                    className="input-field mt-1 h-8"
                    value={engagement.next_follow_up_date ?? ''}
                    onChange={(e) =>
                      persist({ next_follow_up_date: e.target.value || null }, 'Follow-up updated')
                    }
                  />
                </label>
              )}
            </div>
          </section>

          <section className="py-3">
            <SectionBlock tone="neutral">
              <SectionLabel className="mb-2">The deal</SectionLabel>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-2xs text-ink-secondary">
                  <span>Type</span>
                  <Pill tone={collabType === 'paid' ? 'info' : 'success'}>
                    {collabType === 'paid' ? 'Paid' : 'Barter'}
                  </Pill>
                </div>
                {collabType === 'barter' ? (
                  <button type="button" className="text-2xs text-brand hover:underline" onClick={makePaid}>
                    Make paid →
                  </button>
                ) : (
                  <button type="button" className="text-2xs text-ink-tertiary hover:text-ink hover:underline" onClick={makeBarter}>
                    Switch to barter
                  </button>
                )}
              </div>

              {collabType === 'paid' && (
                <label className="mt-2.5 block">
                  <FieldLabel>Agreed fee (₹)</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    className="input-field mt-1 h-8"
                    value={engagement.agreed_fee ?? ''}
                    onChange={(e) => setEngagement((prev) => ({ ...prev, agreed_fee: e.target.value }))}
                    onBlur={(e) => saveAgreedFee(e.target.value)}
                    placeholder="40000"
                  />
                </label>
              )}

              <div id="campaign-drawer-deliverables" className="mt-3 border-t border-line/60 pt-3">
                <div className="flex items-baseline justify-between gap-2">
                  <FieldLabel>Deliverables</FieldLabel>
                  {deliverables.length > 0 && (
                    <span className="text-[10px] text-ink-tertiary">
                      {postedCount}/{deliverables.length} posted
                    </span>
                  )}
                </div>

                {deliverablesNote && (
                  <p className="mt-1 text-[10px] text-ink-tertiary">{deliverablesNote}</p>
                )}

                {deliverables.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {deliverables.map((d) => (
                      <DeliverableChip
                        key={d.id}
                        deliverable={d}
                        canRemove={canRemoveDeliverable(status, d)}
                        onRemove={removeDeliverable}
                      />
                    ))}
                  </div>
                )}

                {deliverablesRule.canAdd && (
                  <div className="mt-2 [&_button]:h-6 [&_button]:border-dashed [&_button]:border-line/80 [&_button]:bg-white/80 [&_button]:px-2 [&_button]:text-[10px] [&_button]:font-normal [&_button]:text-ink-secondary [&_button]:hover:border-zinc-300 [&_button]:hover:text-ink">
                    <DeliverableTypeButtons onAdd={addDeliverable} className="gap-1.5" />
                  </div>
                )}
              </div>
            </SectionBlock>
          </section>

          <section className="py-3">
            <SectionLabel>Notes</SectionLabel>
            <textarea
              className="input-field min-h-[64px] w-full resize-y py-2 text-2xs leading-relaxed"
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
          </section>
        </div>
      </Drawer>

      <VisitModal
        open={visitOpen}
        contactName={engagement.contact_name}
        onClose={() => setVisitOpen(false)}
        onSave={handleVisitSave}
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
