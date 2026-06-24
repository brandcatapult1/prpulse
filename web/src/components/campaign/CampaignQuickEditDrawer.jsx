import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { DeliverableTypeButtons, deliverableTypeLabel } from '../deliverables/DeliverableTypeButtons.jsx';
import { formatDate, formatStatus, Pill } from '../../lib/format.jsx';
import { COLLABORATION_REASONS } from '../../lib/collaborationReasons.js';
import { addDeliverableToList, deliverableListUnitTotals, removeDeliverableFromList } from '../../lib/deliverableList.js';
import { engagementsApi } from '../../lib/api.js';
import {
  patchEngagement,
  syncDeliverables,
  patchContact,
  fetchDeliverables,
  commitScheduleEngagement,
} from '../../lib/persistence.js';
import { updateEngagementDeliverables } from '../../lib/deliverablesCache.js';
import { updateCachedContact } from '../../lib/contactsCache.js';
import { getDrawerContactIdentity } from '../../lib/contactSocialLinks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  DRAWER_MOVE,
  drawerCurrentStageLabel,
  getCampaignDrawerMoveTargets,
  getDropReasonOptionsForStatus,
} from '../../lib/campaignDrawerMoves.js';
import { canReopenDropped, droppedFromLabel, isDroppedStatus, resolveDroppedFrom } from '../../lib/dropTransitions.js';
import {
  firstOutreachToastMessage,
  rejectProfileToastMessage,
  reopenToastMessage,
} from '../../lib/outreachLogging.js';
import { STAGE, transitionStage, formatScheduledBlockMessage, getScheduledPrerequisitesMissing, SCHEDULED_PREREQUISITE } from '../../lib/engagementTransitions.js';
import { buildVisitDoneTransition, visitDoneToastMessage } from '../../lib/visitLogging.js';
import { buildRepliedContactLogPatch, repliedContactToastMessage } from '../../lib/contactLogging.js';
import {
  buildVisitFieldsPatch,
  resolveEngagementOutletId,
  resolveEngagementOutletName,
  toApiVisitTime,
  visitFieldsFromEngagement,
} from '../../lib/visitFields.js';
import { VisitCaptureForm } from '../visit/VisitCaptureForm.jsx';
import {
  deliverablesRules,
  canRemoveDeliverable,
  isComplete,
} from '../../lib/engagementRules.js';
import { isDeliverableFullyPosted } from '../../lib/deliverableLogging.js';

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
  const posted = isDeliverableFullyPosted(deliverable);
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

export function CampaignQuickEditDrawer({
  engagementId,
  open,
  onClose,
  onUpdated,
  scheduleMode = false,
  scheduleLogContact = false,
  onScheduleModeCleared,
}) {
  const { user } = useAuth();
  const [engagement, setEngagement] = useState(null);
  const [deliverables, setDeliverables] = useState([]);
  const [scheduleFlow, setScheduleFlow] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const [moveSelectKey, setMoveSelectKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [visitDraft, setVisitDraft] = useState(null);
  const [scheduleBaseline, setScheduleBaseline] = useState(null);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [identityRevision, setIdentityRevision] = useState(0);

  function captureScheduleBaseline() {
    if (!engagement) return;
    setScheduleBaseline({
      deliverables: structuredClone(deliverables),
      visitDraft: { ...(visitDraft ?? visitFieldsFromEngagement(engagement)) },
      engagement: {
        primary_collaboration_reason: engagement.primary_collaboration_reason ?? null,
        notes: engagement.notes ?? null,
      },
    });
  }

  function discardScheduleBaseline() {
    if (!scheduleBaseline) return;
    setDeliverables(scheduleBaseline.deliverables);
    setVisitDraft(scheduleBaseline.visitDraft);
    setEngagement((prev) => ({
      ...prev,
      primary_collaboration_reason: scheduleBaseline.engagement.primary_collaboration_reason,
      notes: scheduleBaseline.engagement.notes,
    }));
    setScheduleBaseline(null);
  }

  function handleDrawerClose() {
    if (scheduleFlow && !scheduleSubmitting) {
      discardScheduleBaseline();
    }
    setScheduleFlow(false);
    setScheduleBaseline(null);
    onScheduleModeCleared?.();
    onClose();
  }

  useEffect(() => {
    if (!open || !engagementId) return;
    Promise.all([
      engagementsApi.get(engagementId),
      fetchDeliverables(engagementId),
    ]).then(([eng, dels]) => {
      setEngagement(eng);
      setDeliverables(dels ?? []);
      setVisitDraft(visitFieldsFromEngagement(eng));
      updateEngagementDeliverables(engagementId, dels ?? []);
    }).catch(() => {
      setEngagement(null);
      setDeliverables([]);
      setVisitDraft(null);
    });
  }, [open, engagementId]);

  useEffect(() => {
    if (open && scheduleMode && engagement) {
      captureScheduleBaseline();
      setScheduleFlow(true);
    }
    if (!open) {
      setScheduleFlow(false);
      setScheduleBaseline(null);
      setScheduleSubmitting(false);
    }
  }, [open, scheduleMode, engagement?.id]);

  useEffect(() => {
    if (!open || !scheduleFlow) return;
    const timer = window.setTimeout(() => {
      document.getElementById('campaign-drawer-schedule')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, scheduleFlow]);

  if (!engagementId || !engagement) return null;

  const canComplete =
    deliverables.length > 0
    && deliverables.every((d) => isDeliverableFullyPosted(d));
  const status = engagement.conversation_status;
  const deliverablesRule = deliverablesRules(status);
  const { posted: postedUnits, total: totalUnits } = deliverableListUnitTotals(deliverables);
  const collabType = engagement.collaboration_type === 'paid' ? 'paid' : 'barter';
  const deliverablesNote = drawerDeliverablesNote(status, deliverablesRule, deliverables.length);
  const completeHint = drawerCompleteHint(canComplete, status, deliverables.length);
  const moveTargets = getCampaignDrawerMoveTargets(engagement, {
    canComplete,
    role: user?.role,
  });
  const dropReasonOptions = getDropReasonOptionsForStatus(status);
  const canReopen = isDroppedStatus(status) && canReopenDropped(user?.role, engagement);

  async function persistDeliverables(nextList, message) {
    try {
      const beforeList = await fetchDeliverables(engagementId);
      const saved = await syncDeliverables(engagementId, beforeList, nextList);
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
    const nextList = addDeliverableToList(deliverables, type, status);
    if (scheduleFlow) {
      setDeliverables(nextList);
      return;
    }
    const existing = deliverables.find(
      (d) => d.deliverable_type === type && d.status !== 'posted',
    );
    const merged = nextList.find(
      (d) => d.deliverable_type === type && d.status !== 'posted',
    );
    const qty = merged?.quantity ?? 1;
    persistDeliverables(
      nextList,
      existing
        ? `${deliverableTypeLabel(type)} ×${qty}`
        : `Added ${deliverableTypeLabel(type)} ×${qty}`,
    );
  }

  function removeDeliverable(delId) {
    const item = deliverables.find((d) => d.id === delId);
    if (!item || !canRemoveDeliverable(status, item)) return;
    const nextList = removeDeliverableFromList(deliverables, delId);
    if (scheduleFlow) {
      setDeliverables(nextList);
      return;
    }
    const remaining = nextList.find((d) => d.id === delId);
    const label = deliverableTypeLabel(item.deliverable_type);
    persistDeliverables(
      nextList,
      remaining
        ? `${label} ×${remaining.quantity}`
        : `Removed ${label}`,
    );
  }

  async function persist(patch, message) {
    try {
      const updated = await patchEngagement(engagementId, patch);
      setEngagement((prev) => ({ ...prev, ...updated }));
      setVisitDraft(visitFieldsFromEngagement({ ...engagement, ...updated }));
      onUpdated?.();
      if (message) setToast(message);
    } catch (err) {
      setToast(err.message ?? 'Save failed');
    }
  }

  function scrollToScheduleMissing(missing) {
    if (missing.includes(SCHEDULED_PREREQUISITE.visitDate)) {
      document.getElementById('campaign-drawer-schedule')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
    if (missing.includes(SCHEDULED_PREREQUISITE.deliverables)) {
      document.getElementById('campaign-drawer-deliverables')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
    if (missing.includes(SCHEDULED_PREREQUISITE.collabReason)) {
      document.getElementById('campaign-drawer-collab-reason')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }

  async function applyTransition(result, message) {
    if (!result.ok) {
      setToast(result.error ?? 'Could not move');
      if (result.focusDeliverables) {
        document.getElementById('campaign-drawer-deliverables')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
      if (result.focusCollabReason) {
        document.getElementById('campaign-drawer-collab-reason')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
      return false;
    }
    await persist(result.patch, message);
    return true;
  }

  function resetMoveUi() {
    setPendingMove(null);
    setFollowUpOpen(false);
    setDropOpen(false);
    setConfirmOpen(null);
    setMoveSelectKey((k) => k + 1);
  }

  function exitScheduleFlow({ closeDrawer = false } = {}) {
    setScheduleFlow(false);
    setScheduleBaseline(null);
    setPendingMove(null);
    setMoveSelectKey((k) => k + 1);
    onScheduleModeCleared?.();
    if (closeDrawer) onClose();
  }

  async function handleMoveSelect(moveValue) {
    const target = moveTargets.find((t) => t.value === moveValue);
    if (!target) return;

    if (target.needsPrompt === 'follow_up_date') {
      setPendingMove(target);
      setFollowUpDraft('');
      setFollowUpOpen(true);
      return;
    }
    if (target.needsPrompt === 'visit_date') {
      setPendingMove(target);
      captureScheduleBaseline();
      setScheduleFlow(true);
      setVisitDraft(visitFieldsFromEngagement(engagement));
      return;
    }
    if (target.needsPrompt === 'drop_reason') {
      setPendingMove(target);
      setDropOpen(true);
      return;
    }
    if (target.needsConfirm) {
      setPendingMove(target);
      setConfirmOpen(target.needsConfirm);
      return;
    }
    if (target.value === DRAWER_MOVE.VISIT_DONE) {
      const result = buildVisitDoneTransition(engagement, transitionStage, STAGE);
      if (await applyTransition(result, visitDoneToastMessage())) resetMoveUi();
      return;
    }
    if (target.dropReason) {
      const result = transitionStage(engagement, target.target, {
        dropReason: target.dropReason,
        droppedFrom: target.droppedFrom,
      });
      const message = target.value === DRAWER_MOVE.PROFILE_REJECTED
        ? rejectProfileToastMessage()
        : `Moved to Dropped — ${target.label}`;
      if (await applyTransition(result, message)) resetMoveUi();
    }
  }

  async function handleFollowUpSave(followUpDate) {
    if (!pendingMove || !followUpDate) return;
    const result = transitionStage(engagement, pendingMove.target, {
      nextFollowUpDate: followUpDate,
      logFirstOutreach: pendingMove.logFirstOutreach,
    });
    const message = pendingMove.logFirstOutreach
      ? firstOutreachToastMessage(followUpDate)
      : `Logged — next follow-up ${formatDate(followUpDate)}`;
    if (await applyTransition(result, message)) resetMoveUi();
  }

  async function handleScheduleVisitSubmit() {
    if (scheduleSubmitting) return;

    const visitDate = visitDraft?.visitDate;
    if (!visitDate) {
      setToast('Visit date is required');
      scrollToScheduleMissing([SCHEDULED_PREREQUISITE.visitDate]);
      return;
    }

    const missing = getScheduledPrerequisitesMissing(engagement, visitDate, {
      deliverables,
      collabReason: engagement.primary_collaboration_reason,
    });
    if (missing.length > 0) {
      setToast(formatScheduledBlockMessage(missing) ?? 'Complete scheduling requirements');
      scrollToScheduleMissing(missing);
      return;
    }

    if (engagement.collaboration_type === 'paid') {
      const fee = Number(engagement.agreed_fee);
      if (!fee || Number.isNaN(fee) || fee <= 0) {
        setToast('Agreed fee is required for paid collabs');
        return;
      }
    }

    setScheduleSubmitting(true);
    try {
      const { engagement: updated, deliverables: saved } = await commitScheduleEngagement(
        engagementId,
        {
          visit_date: visitDate,
          visit_time: toApiVisitTime(visitDraft.visitTime),
          visit_notes: visitDraft.visitNotes?.trim() || null,
          visit_outlet_id: resolveEngagementOutletId(engagement),
          primary_collaboration_reason: engagement.primary_collaboration_reason,
          collaboration_type: engagement.collaboration_type,
          agreed_fee:
            engagement.collaboration_type === 'paid' && engagement.agreed_fee !== ''
              ? Number(engagement.agreed_fee)
              : null,
          notes: engagement.notes?.trim() || null,
          deliverables: deliverables.map(({ is_overdue: _omit, ...d }) => d),
          ...(scheduleLogContact ? buildRepliedContactLogPatch() : {}),
        },
      );
      setEngagement(updated);
      setDeliverables(saved ?? []);
      setVisitDraft(visitFieldsFromEngagement(updated));
      updateEngagementDeliverables(engagementId, saved ?? []);
      onUpdated?.();
      setToast(
        scheduleLogContact
          ? repliedContactToastMessage(`scheduled visit ${formatDate(visitDate)}`)
          : `Scheduled — visit ${formatDate(visitDate)}`,
      );
      exitScheduleFlow();
      resetMoveUi();
    } catch (err) {
      setToast(err.message ?? 'Could not schedule visit');
    } finally {
      setScheduleSubmitting(false);
    }
  }

  async function handleScheduledVisitSave() {
    if (!visitDraft?.visitDate) return;
    const patch = buildVisitFieldsPatch({
      ...visitDraft,
      visitOutletId: resolveEngagementOutletId(engagement),
    });
    await persist(patch, 'Visit updated');
  }

  async function handleDropReason(reason) {
    if (!pendingMove) return;
    const result = transitionStage(engagement, STAGE.DROPPED, { dropReason: reason });
    const label = dropReasonOptions.find((o) => o.value === reason)?.label ?? 'Dropped';
    if (await applyTransition(result, `Moved to Dropped — ${label}`)) resetMoveUi();
  }

  async function handleConfirmMove() {
    if (!pendingMove) return;

    if (pendingMove.needsConfirm === 'complete') {
      const result = transitionStage(engagement, STAGE.COMPLETE);
      if (await applyTransition(result, 'Collaboration marked complete')) resetMoveUi();
      return;
    }

    if (pendingMove.needsConfirm === 'didnt_deliver') {
      const result = transitionStage(engagement, STAGE.DROPPED, {
        dropReason: pendingMove.dropReason,
        droppedFrom: pendingMove.droppedFrom,
      });
      if (await applyTransition(result, "Moved to Dropped — Didn't Deliver")) resetMoveUi();
      return;
    }

    if (pendingMove.needsConfirm === 'reopen') {
      if (!canReopen) {
        setToast('Senior Manager or Admin required to reopen');
        resetMoveUi();
        return;
      }
      const droppedFrom = resolveDroppedFrom(engagement);
      const result = transitionStage(engagement, STAGE.REOPEN, { role: user?.role });
      if (await applyTransition(result, reopenToastMessage(droppedFromLabel(droppedFrom)))) {
        resetMoveUi();
      }
    }
  }

  function makePaid() {
    if (scheduleFlow) {
      setEngagement((prev) => ({ ...prev, collaboration_type: 'paid' }));
      return;
    }
    persist({ collaboration_type: 'paid' }, 'Switched to paid');
  }

  function makeBarter() {
    if (scheduleFlow) {
      setEngagement((prev) => ({ ...prev, collaboration_type: 'barter', agreed_fee: null }));
      return;
    }
    persist({ collaboration_type: 'barter', agreed_fee: null }, 'Switched to barter');
  }

  function saveAgreedFee(raw) {
    const fee = raw === '' ? null : Number(raw);
    if (collabType === 'paid' && (fee == null || Number.isNaN(fee) || fee <= 0)) {
      if (!scheduleFlow) setToast('Agreed fee is required for paid collabs');
      return;
    }
    if (scheduleFlow) return;
    persist({ agreed_fee: fee }, 'Fee updated');
  }

  return (
    <>
      <Drawer
        open={open}
        title={scheduleFlow ? `Schedule visit · ${engagement.contact_name}` : undefined}
        onClose={handleDrawerClose}
        footer={
          scheduleFlow ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="btn-secondary"
                disabled={scheduleSubmitting}
                onClick={() => {
                  discardScheduleBaseline();
                  exitScheduleFlow({ closeDrawer: scheduleMode });
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!visitDraft?.visitDate || scheduleSubmitting}
                onClick={handleScheduleVisitSubmit}
              >
                {scheduleSubmitting ? 'Scheduling…' : 'Schedule visit'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button type="button" className="btn-secondary" onClick={handleDrawerClose}>Done</button>
              <Link to={`/engagements/${engagementId}`} className="btn-ghost text-2xs" onClick={handleDrawerClose}>
                Full record →
              </Link>
            </div>
          )
        }
      >
        <div className="divide-y divide-line/80">
          <DrawerIdentityHeader
            key={`${engagement.id}-${identityRevision}`}
            engagement={engagement}
            onEmailSaved={() => setIdentityRevision((r) => r + 1)}
            onToast={setToast}
          />

          {followUpOpen && pendingMove && (
            <section className="py-3">
              <SectionBlock tone="accent">
                <SectionLabel className="mb-2 text-brand/70">
                  {pendingMove.logFirstOutreach ? 'First outreach' : 'Next follow-up'}
                </SectionLabel>
                <label className="block text-2xs text-ink-secondary">
                  Follow-up date
                  <input
                    type="date"
                    className="input-field mt-1 h-8 w-full"
                    value={followUpDraft}
                    onChange={(e) => setFollowUpDraft(e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => {
                      setFollowUpOpen(false);
                      setPendingMove(null);
                      setMoveSelectKey((k) => k + 1);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    disabled={!followUpDraft}
                    onClick={() => handleFollowUpSave(followUpDraft)}
                  >
                    Save
                  </button>
                </div>
              </SectionBlock>
            </section>
          )}

          {dropOpen && pendingMove && (
            <section className="py-3">
              <SectionBlock tone="accent">
                <SectionLabel className="mb-2 text-brand/70">Drop reason</SectionLabel>
                <div className="space-y-1">
                  {dropReasonOptions.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className="btn-ghost w-full justify-start text-2xs text-health-red"
                      onClick={() => handleDropReason(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary mt-2 w-full"
                  onClick={() => {
                    setDropOpen(false);
                    setPendingMove(null);
                    setMoveSelectKey((k) => k + 1);
                  }}
                >
                  Cancel
                </button>
              </SectionBlock>
            </section>
          )}

          {confirmOpen && pendingMove && (
            <section className="py-3">
              <SectionBlock tone="accent">
                <SectionLabel className="mb-2 text-brand/70">
                  {confirmOpen === 'complete'
                    ? 'Mark collaboration complete?'
                    : confirmOpen === 'didnt_deliver'
                      ? "Mark as didn't deliver?"
                      : 'Reopen engagement?'}
                </SectionLabel>
                <p className="text-2xs text-ink-secondary">
                  {confirmOpen === 'complete' && 'All deliverables are posted with proof.'}
                  {confirmOpen === 'didnt_deliver' && 'This will drop the engagement and can blacklist the creator.'}
                  {confirmOpen === 'reopen' && (
                    <>
                      Return to{' '}
                      <span className="font-medium text-ink">
                        {droppedFromLabel(resolveDroppedFrom(engagement))}
                      </span>
                      ?
                    </>
                  )}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => {
                      setConfirmOpen(null);
                      setPendingMove(null);
                      setMoveSelectKey((k) => k + 1);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn-primary flex-1" onClick={handleConfirmMove}>
                    Confirm
                  </button>
                </div>
              </SectionBlock>
            </section>
          )}

          {scheduleFlow && (
            <section id="campaign-drawer-schedule" className="py-3">
              <SectionBlock tone="accent">
                <SectionLabel className="mb-1 text-brand/70">Visit details</SectionLabel>
                <p className="mb-2 text-[10px] text-ink-tertiary">
                  Add visit date, at least one deliverable, and a collab reason below — then confirm once.
                </p>
                <VisitCaptureForm
                  compact
                  outletName={resolveEngagementOutletName(engagement)}
                  value={visitDraft ?? visitFieldsFromEngagement(engagement)}
                  onChange={setVisitDraft}
                />
              </SectionBlock>
            </section>
          )}

          <section id="campaign-drawer-collab-reason" className="py-3">
            <SectionBlock tone="accent">
              <SectionLabel className="mb-1 text-brand/70">Collab reason</SectionLabel>
              <select
                className="input-field h-8"
                value={engagement.primary_collaboration_reason ?? ''}
                onChange={(e) => {
                  const value = e.target.value || null;
                  if (scheduleFlow) {
                    setEngagement((prev) => ({ ...prev, primary_collaboration_reason: value }));
                    return;
                  }
                  persist({ primary_collaboration_reason: value }, 'Reason updated');
                }}
              >
                {REASON_OPTIONS.map((o) => (
                  <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
                ))}
              </select>
              {!engagement.primary_collaboration_reason && (
                <p className="mt-1 text-[10px] text-health-amber">
                  {scheduleFlow ? 'Required to schedule' : 'Required before scheduling'}
                </p>
              )}
            </SectionBlock>
          </section>

          <section className="py-3">
            <SectionLabel>Status &amp; next step</SectionLabel>
            <div className="space-y-2.5">
              <div>
                <FieldLabel>Current stage</FieldLabel>
                <p className="mt-1 text-2xs font-medium text-ink">
                  {drawerCurrentStageLabel(engagement, formatStatus)}
                </p>
              </div>
              {moveTargets.length > 0 && !scheduleFlow ? (
                <label className="block">
                  <FieldLabel>Move to</FieldLabel>
                  <select
                    key={moveSelectKey}
                    className="input-field mt-1 h-8 max-w-none"
                    defaultValue=""
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) handleMoveSelect(value);
                    }}
                  >
                    <option value="" disabled>
                      Select next step…
                    </option>
                    {moveTargets.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {completeHint && (
                    <p className="mt-1.5 text-2xs text-ink-tertiary">{completeHint}</p>
                  )}
                </label>
              ) : (
                <p className="text-2xs text-ink-tertiary">
                  No stage moves from here — use board quick-actions or the full record.
                </p>
              )}
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

          {status === 'scheduled' && !scheduleFlow && (
            <section className="py-3">
              <SectionLabel>Visit</SectionLabel>
              <SectionBlock tone="neutral">
                <VisitCaptureForm
                  compact
                  outletName={resolveEngagementOutletName(engagement)}
                  value={visitDraft ?? visitFieldsFromEngagement(engagement)}
                  onChange={setVisitDraft}
                />
                <button
                  type="button"
                  className="btn-secondary mt-2 !h-7 text-2xs"
                  disabled={!visitDraft?.visitDate}
                  onClick={handleScheduledVisitSave}
                >
                  Save visit
                </button>
              </SectionBlock>
            </section>
          )}

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
                  {totalUnits > 0 && (
                    <span className="text-[10px] text-ink-tertiary">
                      {postedUnits}/{totalUnits} posted
                    </span>
                  )}
                </div>

                {deliverablesNote && (
                  <p className="mt-1 text-[10px] text-ink-tertiary">{deliverablesNote}</p>
                )}
                {scheduleFlow && deliverables.length === 0 && (
                  <p className="mt-1 text-[10px] text-health-amber">Add at least one deliverable to schedule</p>
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
                if (scheduleFlow) return;
                const notes = e.target.value.trim() || null;
                if (notes !== (engagement.notes ?? null)) {
                  persist({ notes }, 'Notes saved');
                }
              }}
            />
          </section>
        </div>
      </Drawer>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
