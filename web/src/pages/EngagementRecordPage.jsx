import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Card,
  Drawer,
  EmptyState,
  Toast,
} from '../components/ui/Primitives.jsx';
import { RatingStars, StatusButton } from '../components/ui/DataKit.jsx';
import { DeliverableRow } from '../components/deliverables/DeliverableProofSection.jsx';
import { DeliverableTypeButtons, deliverableTypeLabel } from '../components/deliverables/DeliverableTypeButtons.jsx';
import { FeedbackDrawer } from '../components/feedback/FeedbackDrawer.jsx';
import { VisitDrawer } from '../components/visit/VisitDrawer.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import {
  Pill,
  formatDate,
  formatFee,
  formatStatus,
  roleLabel,
  statusTone,
} from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { addDaysIso, toDateInputValue } from '../lib/dates.js';
import { apiErrorMessage, engagementsApi } from '../lib/api.js';
import {
  patchEngagement,
  reopenEngagement,
  syncDeliverables,
  fetchDeliverables,
  fetchFeedback,
  fetchEngagementTimeline,
  logDeliverableProof,
} from '../lib/persistence.js';
import { useAuth } from '../context/AuthContext.jsx';
import { canMarkDidntDeliver, canReopenComplete } from '../lib/campaignPermissions.js';
import { getDropReasonOptionsForStatus } from '../lib/campaignDrawerMoves.js';
import {
  firstOutreachToastMessage,
  reopenCompleteToastMessage,
  REOPEN_COMPLETE_CONFIRM,
} from '../lib/outreachLogging.js';
import { updateEngagementDeliverables } from '../lib/deliverablesCache.js';
import { getCachedContact, mergeContactsCache } from '../lib/contactsCache.js';
import { isContactBlacklisted } from '../lib/contactsHelpers.js';
import { contactsApi } from '../lib/api.js';
import { getContactProfileExtras } from '../lib/contactProfile.js';
import { formatTimelineEntry } from '../lib/activityTimelineLabels.js';
import {
  agreedFeeRules,
  canRemoveDeliverable,
  deliverablesRules,
  feedbackRules,
  followUpRules,
  followUpSuggestionForStatus,
  getStatusOptions,
  isComplete,
  notesRules,
  sideEffectsOnStatusChange,
  terminalBanner,
  visitRules,
} from '../lib/engagementRules.js';
import {
  buildMarkPostedDeliverableForSave,
  canMarkDeliverablePosted,
  deliverableHasProof,
  deliverableProofRejectMessage,
  isDeliverableFullyPosted,
  markDeliverablePostedToastMessage,
  reconcileDeliverableProofStores,
} from '../lib/deliverableLogging.js';
import { deliverableProofDemotionMessage, deliverableProofRequirementMessage } from '../lib/deliverableProofRules.js';
import { formatCollaborationReason } from '../lib/collaborationReasons.js';
import { addDeliverableToList, deliverableListUnitTotals, removeDeliverableFromList } from '../lib/deliverableList.js';
import {
  buildScheduledTransitionPayload,
  formatVisitTimeVenue,
  resolveEngagementOutletName,
  visitFieldsFromEngagement,
} from '../lib/visitFields.js';
import { STAGE, transitionStage } from '../lib/engagementTransitions.js';
import { DIDNT_DELIVER_REASON } from '../lib/dropTransitions.js';
import { buildVisitDoneTransition, visitDoneToastMessage } from '../lib/visitLogging.js';

function deliverablesSnapshot(list) {
  return JSON.stringify((list ?? []).map(({ is_overdue, ...row }) => row));
}

function cloneDeliverables(list) {
  return structuredClone(list ?? []);
}

function deliverableDraftSavedToast(saved, beforeList) {
  if (saved.some((d) => d.proof_demoted)) return null;
  const newlyPosted = saved.some((row) => {
    const prior = beforeList.find((d) => d.id === row.id);
    return row.status === 'posted' && prior?.status !== 'posted';
  });
  if (newlyPosted) return 'Deliverables saved';
  return 'Deliverables saved — proof updated (use Save & mark posted to mark Posted)';
}

export function EngagementRecordPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [reopenConfirm, setReopenConfirm] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [followUpSuggestion, setFollowUpSuggestion] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [deliverables, setDeliverables] = useState([]);
  const [savedDeliverables, setSavedDeliverables] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [feedbackRecord, setFeedbackRecord] = useState(null);
  const [markingDeliverableId, setMarkingDeliverableId] = useState(null);
  const [markPostedErrors, setMarkPostedErrors] = useState({});
  const [contactEngagements, setContactEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [statusPrompt, setStatusPrompt] = useState(null);
  const [pendingStatusTransition, setPendingStatusTransition] = useState(null);
  const [statusFollowUpDraft, setStatusFollowUpDraft] = useState('');

  const persistEngagement = async (patch, { silent = false, successMessage = 'Saved' } = {}) => {
    setSaving(true);
    try {
      const saved = await patchEngagement(id, patch);
      setEngagement((prev) => ({
        ...prev,
        ...saved,
        contact_name: prev?.contact_name ?? saved.contact_name,
        campaign_name: prev?.campaign_name ?? saved.campaign_name,
        brand_name: prev?.brand_name ?? saved.brand_name,
        owner_name: prev?.owner_name ?? saved.owner_name,
        campaign_id: prev?.campaign_id ?? saved.campaign_id,
      }));
      if (!silent) setToast(successMessage);
      return true;
    } catch (err) {
      setToast(apiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const refreshAfterDeliverableDemotion = async () => {
    const [eng, tl] = await Promise.all([
      engagementsApi.get(id),
      fetchEngagementTimeline(id),
    ]);
    setEngagement(eng);
    setTimeline(Array.isArray(tl) ? tl : []);
  };

  const applySavedDeliverableRow = async (delId, saved, { refreshTimelineOnDemotion = false } = {}) => {
    setDeliverables((rows) => {
      const next = rows.map((d) => (d.id === delId ? saved : d));
      updateEngagementDeliverables(id, next);
      return next;
    });
    setSavedDeliverables((rows) => rows.map((d) => (d.id === delId ? structuredClone(saved) : d)));
    if (saved.proof_demoted) {
      const message = saved.proof_demote_message
        || deliverableProofDemotionMessage(saved.deliverable_type);
      setToast(message);
      if (refreshTimelineOnDemotion) {
        await refreshAfterDeliverableDemotion();
      }
      return 'demoted';
    }
    return 'saved';
  };

  const persistDeliverables = async (list) => {
    try {
      const prepared = list.map(reconcileDeliverableProofStores);
      const beforeList = await fetchDeliverables(id);
      const enteringIssues = [];
      for (const item of prepared) {
        if (item.status !== 'posted') continue;
        const prior = beforeList.find((d) => d.id === item.id);
        const enteringPosted = !prior || prior.status !== 'posted';
        if (enteringPosted && !deliverableHasProof({ ...item, status: 'posted' })) {
          enteringIssues.push(deliverableProofRejectMessage(item));
        }
      }
      if (enteringIssues.length) {
        setToast(enteringIssues.join(' · '));
        return null;
      }

      const saved = await syncDeliverables(id, beforeList, prepared);
      const demoted = saved?.filter((d) => d.proof_demoted) ?? [];
      if (demoted.length) {
        const message = demoted
          .map((d) => d.proof_demote_message || deliverableProofDemotionMessage(d.deliverable_type))
          .join(' · ');
        setToast(message);
        await refreshAfterDeliverableDemotion();
      }

      setDeliverables(saved);
      setSavedDeliverables(cloneDeliverables(saved));
      updateEngagementDeliverables(id, saved);
      return { saved, beforeList };
    } catch (err) {
      const message = err.deliverable
        ? deliverableProofRejectMessage(err.deliverable, err.message)
        : apiErrorMessage(err);
      setToast(message);
      return null;
    }
  };

  const commitDeliverablesDraft = async () => {
    const result = await persistDeliverables(deliverables);
    if (!result?.saved) return;
    const toastMessage = deliverableDraftSavedToast(result.saved, result.beforeList);
    if (toastMessage) setToast(toastMessage);
  };

  const saveAndMarkDeliverablePosted = async (delId) => {
    const item = deliverables.find((d) => d.id === delId);
    if (!item) return;

    if (!canMarkDeliverablePosted({
      contentLink: item.content_link,
      screenshots: item.screenshots,
      deliverableType: item.deliverable_type,
    })) {
      setMarkPostedErrors((prev) => ({
        ...prev,
        [delId]: deliverableProofRequirementMessage(item.deliverable_type),
      }));
      return;
    }

    setMarkingDeliverableId(delId);
    setMarkPostedErrors((prev) => ({ ...prev, [delId]: null }));

    try {
      const toSave = buildMarkPostedDeliverableForSave(item);
      const saved = await logDeliverableProof(id, toSave);
      const outcome = await applySavedDeliverableRow(delId, saved, { refreshTimelineOnDemotion: true });
      if (outcome === 'saved') {
        setToast(markDeliverablePostedToastMessage(saved));
      }
    } catch (err) {
      setMarkPostedErrors((prev) => ({
        ...prev,
        [delId]: err.message || deliverableProofRequirementMessage(item.deliverable_type),
      }));
    } finally {
      setMarkingDeliverableId(null);
    }
  };

  const discardDeliverablesDraft = () => {
    setDeliverables(cloneDeliverables(savedDeliverables));
    setMarkPostedErrors({});
  };

  const updateDeliverable = (delId, patch) => {
    if (!engagement) return;
    if (patch.status === 'posted') {
      setToast('Use Save & mark posted to mark this deliverable Posted');
      return;
    }
    if (patch.status) {
      return;
    }
    setMarkPostedErrors((prev) => ({ ...prev, [delId]: null }));
    setDeliverables((rows) => rows.map((d) => (d.id === delId ? { ...d, ...patch } : d)));
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setFollowUpSuggestion(null);

    Promise.all([
      engagementsApi.get(id),
      fetchDeliverables(id),
      fetchEngagementTimeline(id),
      fetchFeedback(id),
    ])
      .then(async ([eng, dels, tl, fb]) => {
        setEngagement(eng);
        const loadedDeliverables = dels ?? [];
        setDeliverables(cloneDeliverables(loadedDeliverables));
        setSavedDeliverables(cloneDeliverables(loadedDeliverables));
        updateEngagementDeliverables(id, loadedDeliverables);
        setTimeline(Array.isArray(tl) ? tl : []);
        setFeedbackRecord(fb);
        if (eng?.contact_id) {
          mergeContactsCache([{ id: eng.contact_id }]);
          const contact = await contactsApi.get(eng.contact_id).catch(() => null);
          if (contact) mergeContactsCache([contact]);
          const engs = await contactsApi.engagements(eng.contact_id).catch(() => []);
          setContactEngagements(Array.isArray(engs) ? engs : []);
        }
      })
      .catch(() => {
        setEngagement(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center text-sm text-ink-secondary">
        Loading engagement…
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState title="Engagement not found" description="This record may have been removed." />
      </div>
    );
  }

  const hasCollaborationReason = Boolean(engagement?.primary_collaboration_reason);
  const deliverablesReady =
    savedDeliverables.length > 0
    && savedDeliverables.every((d) => isDeliverableFullyPosted(d) && deliverableHasProof(d));
  const canComplete = hasCollaborationReason && deliverablesReady;

  const deliverablesDirty =
    deliverablesSnapshot(deliverables) !== deliverablesSnapshot(savedDeliverables);

  const status = engagement.conversation_status;
  const followUp = followUpRules(status);
  const visit = visitRules(status);
  const deliverablesRule = deliverablesRules(status);
  const feedback = feedbackRules(status);
  const feeRule = agreedFeeRules(status);
  const notesRule = notesRules(status);
  const closedBanner = terminalBanner(status);

  const statusChoices = getStatusOptions({
    current: status,
    canComplete,
    formatStatus,
  });

  const handleReopenComplete = async () => {
    if (reopening || !id) return;
    setReopening(true);
    try {
      await reopenEngagement(id);
      // Refetch live engagement so deliverablesRules keys off confirmed status
      // (awaiting_final_deliverables), not a stale collaboration_complete client copy.
      const [fresh, dels, tl] = await Promise.all([
        engagementsApi.get(id),
        fetchDeliverables(id).catch(() => null),
        fetchEngagementTimeline(id).catch(() => null),
      ]);
      setEngagement((prev) => ({
        ...prev,
        ...fresh,
        conversation_status: fresh.conversation_status ?? 'awaiting_final_deliverables',
        contact_name: fresh.contact_name ?? prev?.contact_name,
        campaign_name: fresh.campaign_name ?? prev?.campaign_name,
        brand_name: fresh.brand_name ?? prev?.brand_name,
        owner_name: fresh.owner_name ?? prev?.owner_name,
        campaign_id: fresh.campaign_id ?? prev?.campaign_id,
      }));
      if (Array.isArray(dels)) {
        setDeliverables(cloneDeliverables(dels));
        setSavedDeliverables(cloneDeliverables(dels));
        updateEngagementDeliverables(id, dels);
      }
      if (Array.isArray(tl)) setTimeline(tl);
      setModal(null);
      setReopenConfirm(false);
      setToast(reopenCompleteToastMessage());
    } catch (err) {
      setToast(apiErrorMessage(err, 'Could not reach the server — try reopen again'));
    } finally {
      setReopening(false);
    }
  };

  function clearStatusPrompt() {
    setStatusPrompt(null);
    setPendingStatusTransition(null);
    setStatusFollowUpDraft('');
  }

  async function applyStageTransition(result, successMessage = 'Saved') {
    if (!result.ok) {
      if (result.needsPrompt === 'follow_up_date') {
        setStatusFollowUpDraft('');
        setStatusPrompt('follow_up_date');
        return false;
      }
      if (result.needsPrompt === 'drop_reason') {
        setPendingStatusTransition({ target: STAGE.DROPPED });
        setStatusPrompt('drop_reason');
        return false;
      }
      setToast(result.error ?? 'Could not update status');
      return false;
    }

    const ok = await persistEngagement(result.patch, { successMessage });
    if (ok) {
      clearStatusPrompt();
      const nextStatus = result.patch.conversation_status;
      const rule = followUpSuggestionForStatus(nextStatus);
      if (rule && followUpRules(nextStatus).editable) {
        setFollowUpSuggestion({
          date: addDaysIso(rule.days),
          label: rule.label,
        });
      } else {
        setFollowUpSuggestion(null);
      }
    }
    return ok;
  }

  async function handleStatusChange(next) {
    if (next === engagement.conversation_status) return;

    if (next === 'scheduled') {
      setModal('visit');
      return;
    }
    if (isComplete(engagement?.conversation_status)) return;

    if (next === 'collaboration_complete') {
      if (!engagement.primary_collaboration_reason) {
        setToast('Add a collaboration reason before completing — set it on the campaign board.');
        return;
      }
      if (!deliverablesReady) {
        setToast('Complete when all deliverables are Posted with proof');
        return;
      }
      const patch = { conversation_status: next, ...sideEffectsOnStatusChange(next) };
      const rule = followUpSuggestionForStatus(next);
      if (rule && followUpRules(next).editable) {
        setFollowUpSuggestion({ date: addDaysIso(rule.days), label: rule.label });
      } else {
        setFollowUpSuggestion(null);
      }
      persistEngagement(patch);
      return;
    }

    if (next === 'not_contacted') {
      setToast('Not Contacted cannot be set from the record page — use the campaign board.');
      return;
    }

    clearStatusPrompt();

    if (next === 'awaiting_final_deliverables') {
      const result = buildVisitDoneTransition(engagement, transitionStage, STAGE);
      await applyStageTransition(result, visitDoneToastMessage());
      return;
    }

    if (next === 'in_conversation') {
      setPendingStatusTransition({
        target: STAGE.IN_CONVERSATION,
        logFirstOutreach: engagement.conversation_status === 'not_contacted',
      });
      await applyStageTransition(transitionStage(engagement, STAGE.IN_CONVERSATION, {}));
      return;
    }

    if (next === 'no_response') {
      await applyStageTransition(transitionStage(engagement, STAGE.NO_RESPONSE, {}));
      return;
    }

    if (next === 'dropped') {
      if (!canMarkDidntDeliver(user?.role)) {
        setToast('Senior Manager or Admin required');
        return;
      }
      const result = transitionStage(engagement, STAGE.DROPPED, {
        dropReason: DIDNT_DELIVER_REASON,
      });
      await applyStageTransition(result, "Moved to Dropped — Didn't Deliver");
      return;
    }

    if (next.startsWith('dropped_')) {
      const result = transitionStage(engagement, STAGE.DROPPED, { dropReason: next });
      await applyStageTransition(result, `Moved to Dropped — ${formatStatus(next)}`);
      return;
    }

    setToast('Could not update status');
  }

  async function handleStatusFollowUpSave() {
    if (!pendingStatusTransition || !statusFollowUpDraft) return;
    const result = transitionStage(engagement, pendingStatusTransition.target, {
      nextFollowUpDate: statusFollowUpDraft,
      logFirstOutreach: pendingStatusTransition.logFirstOutreach,
    });
    const message = pendingStatusTransition.logFirstOutreach
      ? firstOutreachToastMessage(statusFollowUpDraft)
      : `Logged — next follow-up ${formatDate(statusFollowUpDraft)}`;
    await applyStageTransition(result, message);
  }

  async function handleStatusDropReason(reason) {
    const result = transitionStage(engagement, STAGE.DROPPED, { dropReason: reason });
    const label = getDropReasonOptionsForStatus(status).find((o) => o.value === reason)?.label
      ?? formatStatus(reason);
    await applyStageTransition(result, `Moved to Dropped — ${label}`);
  }

  const handleFollowUpChange = (date) => {
    if (!followUp.editable) return;
    if (date === followUpSuggestion?.date) setFollowUpSuggestion(null);
    persistEngagement({ next_follow_up_date: date || null });
  };

  const acceptFollowUpSuggestion = async () => {
    if (!followUpSuggestion) return;
    const { date } = followUpSuggestion;
    setFollowUpSuggestion(null);
    await persistEngagement(
      { next_follow_up_date: date },
      { successMessage: `Follow-up set to ${formatDate(date)}` },
    );
  };

  const addDeliverable = (type) => {
    if (!deliverablesRule.canAdd) return;
    setDeliverables((rows) => addDeliverableToList(rows, type, status));
  };

  const removeDeliverable = (delId) => {
    const item = deliverables.find((d) => d.id === delId);
    if (!item || !canRemoveDeliverable(status, item)) return;
    setDeliverables((rows) => removeDeliverableFromList(rows, delId));
  };

  const { posted: postedUnits, total: totalUnits } = deliverableListUnitTotals(savedDeliverables);

  const blacklisted = engagement.contact_id && isContactBlacklisted(engagement.contact_id);
  const contactRecord = engagement.contact_id ? getCachedContact(engagement.contact_id) : null;
  const contactExtras = getContactProfileExtras(contactRecord);
  const previousBrands = contactEngagements.length
    ? [...new Set(contactEngagements.map((e) => e.brand_name).filter(Boolean))].join(', ')
    : '—';
  const statusDropReasonOptions = getDropReasonOptionsForStatus(status);
  const collabType = engagement.collaboration_type === 'paid' ? 'paid' : 'barter';
  const commercialsFrozen = feeRule.frozen;

  async function makePaid() {
    if (commercialsFrozen) return;
    await persistEngagement({ collaboration_type: 'paid' }, { successMessage: 'Switched to paid' });
  }

  async function makeBarter() {
    if (commercialsFrozen) return;
    await persistEngagement(
      { collaboration_type: 'barter', agreed_fee: null },
      { successMessage: 'Switched to barter' },
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={engagement.contact_name}
        subtitle={`${MODULES.engagementRecord.pageTitle} · ${engagement.campaign_name} · ${engagement.brand_name}`}
        actions={
          <>
            {engagement.contact_id && (
              <Link to={`/contacts/${engagement.contact_id}`} className="btn-secondary">
                View profile
              </Link>
            )}
            <Link
              to={`/campaigns/${engagement.campaign_id ?? 'c1'}`}
              className="btn-secondary"
            >
              ← Campaign
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={statusTone(engagement.conversation_status)}>
          {formatStatus(engagement.conversation_status)}
        </Pill>
        <span className="text-2xs text-ink-tertiary">{MODULES.engagementRecord.subtitle}</span>
      </div>

      {blacklisted && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-900">
          <span className="font-semibold">Blacklisted creator.</span> This contact is excluded from new campaign population.
        </div>
      )}
      {closedBanner && (
        <TerminalStateBanner {...closedBanner} />
      )}
      {saving && (
        <p className="text-2xs text-ink-tertiary">Saving…</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard
          title="Feedback"
          subtitle={
            feedbackRecord
              ? 'Feedback saved — tap to edit'
              : feedback.available
                ? 'Rate this collaboration'
                : feedback.lockedReason
          }
          badge={feedbackRecord ? 'Saved' : undefined}
          badgeTone="success"
          disabled={!feedback.available}
          onClick={() => feedback.available && setModal('feedback')}
        />
        <ActionCard
          title="Visit"
          subtitle={
            visit.available && engagement.visit_date
              ? [
                  formatDate(engagement.visit_date),
                  formatVisitTimeVenue(
                    engagement.visit_time,
                    resolveEngagementOutletName(engagement),
                  ),
                ].filter(Boolean).join(' · ')
              : visit.lockedReason
          }
          disabled={!visit.available}
          onClick={() => visit.available && setModal('visit')}
        />
        <ActionCard
          title="Timeline"
          subtitle={`${timeline.length} events`}
          onClick={() => setModal('timeline')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card elevated className="!p-5">
            <h2 className="text-sm font-semibold text-ink">Advance outreach</h2>
            <p className="mt-0.5 text-2xs text-ink-secondary">Update conversation status</p>
            <div className="mt-4">
              <div>
                <label className="mb-2 block text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Status
                </label>
                <StatusButton
                  value={engagement.conversation_status}
                  options={statusChoices}
                  onChange={handleStatusChange}
                  disabled={isComplete(status)}
                  hint={
                    isComplete(status)
                      ? canReopenComplete(user?.role)
                        ? 'Use Reopen to amend deliverables or fee'
                        : 'Collaboration complete — Senior Manager or Admin can reopen'
                      : !hasCollaborationReason && deliverablesReady
                        ? 'Add a collaboration reason on the campaign board before completing'
                      : !canComplete
                        ? 'Complete unlocks when all deliverables are Posted with proof'
                        : undefined
                  }
                />
                {statusPrompt === 'follow_up_date' && pendingStatusTransition && (
                  <div className="mt-3 rounded-lg border border-line bg-canvas px-3 py-3">
                    <p className="text-2xs font-medium text-ink">Next follow-up date</p>
                    <input
                      type="date"
                      className="input-field mt-2 w-full"
                      value={statusFollowUpDraft}
                      onChange={(e) => setStatusFollowUpDraft(e.target.value)}
                    />
                    <div className="mt-3 flex gap-2">
                      <button type="button" className="btn-secondary flex-1" onClick={clearStatusPrompt}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-primary flex-1"
                        disabled={!statusFollowUpDraft}
                        onClick={handleStatusFollowUpSave}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
                {statusPrompt === 'drop_reason' && (
                  <div className="mt-3 rounded-lg border border-line bg-canvas px-3 py-3">
                    <p className="text-2xs font-medium text-ink">Drop reason</p>
                    <div className="mt-2 space-y-1">
                      {statusDropReasonOptions.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className="btn-ghost w-full justify-start text-2xs text-health-red"
                          onClick={() => handleStatusDropReason(o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="btn-secondary mt-2 w-full" onClick={clearStatusPrompt}>
                      Cancel
                    </button>
                  </div>
                )}
                {isComplete(status) && canReopenComplete(user?.role) && (
                  <div className="mt-3">
                    {reopenConfirm ? (
                      <div className="rounded-lg border border-line bg-canvas px-3 py-3">
                        <p className="text-2xs font-medium text-ink">{REOPEN_COMPLETE_CONFIRM.title}</p>
                        <p className="mt-1 text-2xs text-ink-secondary">{REOPEN_COMPLETE_CONFIRM.body}</p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            className="btn-secondary flex-1"
                            disabled={reopening}
                            onClick={() => setReopenConfirm(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-primary flex-1"
                            disabled={reopening}
                            onClick={handleReopenComplete}
                          >
                            {reopening ? 'Reopening…' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setReopenConfirm(true)}
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card elevated className="!p-5">
            <h2 className="text-sm font-semibold text-ink">Details</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Owner" value={engagement.owner_name} />
              <DetailItem label="Last contact" value={formatDate(engagement.last_contact_date)} />
              <FollowUpField
                value={engagement.next_follow_up_date}
                suggestion={followUpSuggestion}
                editable={followUp.editable}
                lockedHint={followUp.hint}
                onChange={handleFollowUpChange}
                onAccept={acceptFollowUpSuggestion}
                onDismiss={() => setFollowUpSuggestion(null)}
              />
              <DetailItem
                label="Agreed fee"
                value={formatFee(engagement.agreed_fee)}
                locked={feeRule.frozen}
                hint={feeRule.frozenReason}
              />
              <DetailItem
                label="Reason"
                value={formatCollaborationReason(engagement.primary_collaboration_reason)}
                className="sm:col-span-2"
              />
            </dl>
          </Card>

          <Card elevated className="!p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Deliverables</h2>
                <p className="mt-0.5 text-2xs text-ink-secondary">
                  What content did you agree on with this creator?
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Pill tone={savedDeliverables.length ? 'info' : 'muted'}>
                  {postedUnits}/{totalUnits} posted
                </Pill>
                {deliverablesDirty && (
                  <span className="text-2xs text-health-amber">
                    Unsaved changes — save deliverables first
                  </span>
                )}
              </div>
            </div>

            {deliverablesRule.lockedReason && (
              <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-2xs text-ink-secondary">
                {deliverablesRule.lockedReason}
              </p>
            )}
            {deliverablesRule.hint && (
              <p className="mt-3 text-2xs text-ink-tertiary">{deliverablesRule.hint}</p>
            )}

            <div className="mt-4 border-t border-line/60 pt-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">The deal</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-2xs text-ink-secondary">
                  <span>Type</span>
                  <Pill tone={collabType === 'paid' ? 'info' : 'success'}>
                    {collabType === 'paid' ? 'Paid' : 'Barter'}
                  </Pill>
                </div>
                {commercialsFrozen ? (
                  <span className="text-2xs text-ink-tertiary">{feeRule.frozenReason}</span>
                ) : collabType === 'barter' ? (
                  <button type="button" className="text-2xs text-brand hover:underline" onClick={makePaid}>
                    Make paid →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-2xs text-ink-tertiary hover:text-ink hover:underline"
                    onClick={makeBarter}
                  >
                    Switch to barter
                  </button>
                )}
              </div>
            </div>

            {deliverablesRule.canAdd && (
              <div className="mt-4">
                <p className="mb-2 text-2xs font-medium text-ink-tertiary">Add content type</p>
                <DeliverableTypeButtons onAdd={addDeliverable} className="[&_button]:text-2xs [&_button]:!py-1.5" />
                {deliverables.length > 0 && (
                  <button type="button" className="btn-ghost mt-2" onClick={() => setModal('deliverables')}>
                    Manage all
                  </button>
                )}
              </div>
            )}

            {!deliverablesRule.canAdd && deliverables.length > 0 && (
              <div className="mt-4">
                <button type="button" className="btn-ghost" onClick={() => setModal('deliverables')}>
                  View deliverables
                </button>
              </div>
            )}

            {deliverables.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-line bg-canvas px-4 py-6 text-center">
                <p className="text-sm text-ink-secondary">No deliverables yet</p>
                <p className="mt-1 text-2xs text-ink-tertiary">
                  {deliverablesRule.canAdd
                    ? 'Tap a content type above once commercials are agreed.'
                    : deliverablesRule.lockedReason}
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {deliverables.map((d) => (
                  <DeliverableRow
                    key={d.id}
                    deliverable={d}
                    engagementId={id}
                    canEditProof={deliverablesRule.canEditStatus}
                    canMarkPosted={deliverablesRule.canEditStatus}
                    canRemove={canRemoveDeliverable(status, d)}
                    onUpdate={updateDeliverable}
                    onMarkPosted={saveAndMarkDeliverablePosted}
                    markPostedError={markPostedErrors[d.id] ?? null}
                    markPostedBusy={markingDeliverableId === d.id}
                    onRemove={removeDeliverable}
                    compact
                  />
                ))}
              </div>
            )}

            {deliverablesDirty && deliverablesRule.canEditStatus && (
              <div className="mt-4 space-y-2 border-t border-line/80 pt-3">
                <p className="text-2xs text-ink-tertiary">
                  Save deliverables stores proof and non-posted status changes. Use Save &amp; mark posted on each row to mark Posted.
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="btn-secondary text-2xs" onClick={discardDeliverablesDraft}>
                    Discard
                  </button>
                  <button type="button" className="btn-primary text-2xs" onClick={commitDeliverablesDraft}>
                    Save deliverables
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card elevated className="!p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Notes</h2>
              {notesRule.editable && !notesEditing && (
                <button
                  type="button"
                  className="btn-ghost text-2xs"
                  onClick={() => {
                    setNotesDraft(engagement.notes ?? '');
                    setNotesEditing(true);
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            {notesEditing ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input-field min-h-[100px] w-full text-sm"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Context for the team…"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-2xs" onClick={() => setNotesEditing(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary text-2xs"
                    onClick={async () => {
                      const ok = await persistEngagement(
                        { notes: notesDraft.trim() || null },
                        { successMessage: 'Notes saved' },
                      );
                      if (ok) setNotesEditing(false);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-canvas px-3 py-3 text-sm leading-relaxed text-ink-secondary">
                {engagement.notes || (notesRule.editable
                  ? 'No notes yet — tap Edit to add context for the team.'
                  : '—')}
              </p>
            )}
          </Card>
        </div>

        <Card elevated className="h-fit !p-5">
          <h2 className="text-sm font-semibold text-ink">Relationship</h2>
          <p className="mt-0.5 text-2xs text-ink-secondary">From contact history</p>
          {engagement.contact_id && (
            <Link to={`/contacts/${engagement.contact_id}`} className="mt-2 inline-block text-2xs font-medium text-brand hover:underline">
              Open full profile →
            </Link>
          )}
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-2xs text-ink-tertiary">Previous brands</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{previousBrands || '—'}</dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-tertiary">Avg rating</dt>
              <dd className="mt-1 flex items-center gap-2">
                {contactExtras.avg_rating != null ? (
                  <>
                    <RatingStars value={contactExtras.avg_rating} />
                    <span className="text-sm font-medium text-ink">{contactExtras.avg_rating.toFixed(1)}</span>
                  </>
                ) : (
                  <span className="text-sm text-ink-secondary">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-tertiary">Would work again</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {contactExtras.would_work_again_pct != null ? `${contactExtras.would_work_again_pct}%` : '—'}
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <Pill tone={blacklisted ? 'danger' : 'success'}>{blacklisted ? 'Blacklisted' : 'Not blacklisted'}</Pill>
          </div>
        </Card>
      </div>

      <DeliverablesDrawer
        open={modal === 'deliverables'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        deliverables={deliverables}
        deliverablesDirty={deliverablesDirty}
        canAdd={deliverablesRule.canAdd}
        canEditProof={deliverablesRule.canEditStatus}
        onAddType={addDeliverable}
        onRemove={removeDeliverable}
        engagementId={id}
        engagementStatus={status}
        onUpdate={updateDeliverable}
        onMarkPosted={saveAndMarkDeliverablePosted}
        markingDeliverableId={markingDeliverableId}
        markPostedErrors={markPostedErrors}
        onSave={async () => {
          await commitDeliverablesDraft();
          setModal(null);
        }}
        onDiscard={() => {
          discardDeliverablesDraft();
          setModal(null);
        }}
      />

      <FeedbackDrawer
        open={modal === 'feedback'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        engagementId={id}
        contactId={engagement.contact_id}
        initial={feedbackRecord}
        onSaved={(record) => {
          setFeedbackRecord(record);
          setModal(null);
          setToast('Feedback saved');
        }}
      />

      <VisitDrawer
        open={modal === 'visit'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        outletName={resolveEngagementOutletName(engagement)}
        title={`Visit · ${engagement.contact_name}`}
        intro="Required when status is Scheduled. Follow-up will be set to the visit date you pick."
        initialValues={visitFieldsFromEngagement(engagement)}
        onSave={async (fields) => {
          const payload = buildScheduledTransitionPayload(engagement, fields);
          const result = transitionStage(engagement, STAGE.SCHEDULED, payload);
          if (!result.ok) {
            setToast(result.error ?? 'Could not save visit');
            return;
          }
          const ok = await persistEngagement(result.patch, {
            successMessage: 'Visit saved — follow-up set to visit date',
          });
          if (ok) {
            setFollowUpSuggestion(null);
            setModal(null);
          }
        }}
      />

      <TimelineDrawer
        open={modal === 'timeline'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        entries={timeline}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function TerminalStateBanner({ tone, title, body }) {
  const styles =
    tone === 'success'
      ? 'border-teal-200 bg-teal-50 text-teal-900'
      : 'border-line bg-canvas text-ink-secondary';
  return (
    <div className={`rounded-lg border px-4 py-3 text-2xs ${styles}`}>
      <span className="font-semibold text-ink">{title}.</span> {body}
    </div>
  );
}

function ActionCard({ title, subtitle, badge, badgeTone = 'default', disabled = false, onClick }) {
  return (
    <Card
      elevated
      interactive={!disabled}
      onClick={disabled ? undefined : onClick}
      className={`!p-4 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className={`mt-0.5 text-2xs ${disabled ? 'text-ink-tertiary' : 'text-ink-secondary'}`}>
            {subtitle}
          </div>
        </div>
        {!disabled && <span className="text-lg text-ink-tertiary" aria-hidden>→</span>}
        {disabled && <span className="text-2xs font-medium text-ink-tertiary" aria-hidden>Locked</span>}
      </div>
      {badge && (
        <div className="mt-3">
          <Pill tone={badgeTone}>{badge}</Pill>
        </div>
      )}
    </Card>
  );
}

function DetailItem({ label, value, highlight, locked, hint, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
        {label}
        {locked && <span className="ml-1 normal-case text-ink-tertiary">(locked)</span>}
      </dt>
      <dd className={`mt-1 text-sm font-medium ${highlight ? 'text-brand' : 'text-ink'}`}>
        {value}
      </dd>
      {hint && <p className="mt-1 text-2xs text-ink-tertiary">{hint}</p>}
    </div>
  );
}

function FollowUpField({ value, suggestion, editable, lockedHint, onChange, onAccept, onDismiss }) {
  if (!editable) {
    return (
      <div className="sm:col-span-2">
        <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
          Next follow-up
        </dt>
        <dd className="mt-1 text-sm font-medium text-ink">—</dd>
        {lockedHint && <p className="mt-1.5 text-2xs text-ink-tertiary">{lockedHint}</p>}
      </div>
    );
  }

  const inputValue = toDateInputValue(value);
  const showSuggestion =
    suggestion && toDateInputValue(suggestion.date) !== inputValue;

  return (
    <div className="sm:col-span-2">
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
        Next follow-up
      </dt>
      <dd className="mt-1.5">
        <input
          type="date"
          className="input-field max-w-[220px]"
          value={inputValue}
          onChange={(e) => onChange(e.target.value || null)}
          aria-label="Next follow-up date"
        />
        {!inputValue && !showSuggestion && (
          <p className="mt-1.5 text-2xs text-ink-tertiary">
            Pick a date, or use a suggestion after changing status.
          </p>
        )}
      </dd>
      {showSuggestion && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-2xs text-amber-900">
            <span className="font-medium">Suggested:</span>{' '}
            {formatDate(suggestion.date)} ({suggestion.label}) — you choose whether to use it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={onAccept}>
              Use {formatDate(suggestion.date)}
            </button>
            <button type="button" className="btn-secondary" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverablesDrawer({
  open,
  onClose,
  contactName,
  deliverables,
  deliverablesDirty,
  canAdd,
  canEditProof,
  onAddType,
  onRemove,
  engagementId,
  engagementStatus,
  onUpdate,
  onMarkPosted,
  markingDeliverableId = null,
  markPostedErrors = {},
  onSave,
  onDiscard,
}) {
  return (
    <Drawer
      open={open}
      title={`All deliverables · ${contactName}`}
      onClose={onDiscard}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {canAdd ? (
            <DeliverableTypeButtons onAdd={onAddType} className="[&_button]:text-2xs" />
          ) : (
            <span className="text-2xs text-ink-tertiary">Read-only</span>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={onDiscard}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!deliverablesDirty}
              onClick={onSave}
            >
              Save
            </button>
          </div>
        </div>
      }
    >
      {deliverables.length === 0 ? (
        <EmptyState
          title="No deliverables yet"
          description="Tap a content type below once commercials are agreed."
          action={
            canAdd ? (
              <DeliverableTypeButtons onAdd={onAddType} className="justify-center [&_button]:text-2xs" />
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {deliverables.map((d) => (
            <DeliverableRow
              key={d.id}
              deliverable={d}
              engagementId={engagementId}
              canEditProof={canEditProof}
              canMarkPosted={canEditProof}
              canRemove={canRemoveDeliverable(engagementStatus, d)}
              onUpdate={onUpdate}
              onMarkPosted={onMarkPosted}
              markPostedError={markPostedErrors[d.id] ?? null}
              markPostedBusy={markingDeliverableId === d.id}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </Drawer>
  );
}

function TimelineDrawer({ open, onClose, contactName, entries }) {
  return (
    <Drawer
      open={open}
      title={`Timeline · ${contactName}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn-primary ml-auto" onClick={onClose}>Close</button>
      }
    >
      <div className="space-y-3">
        {entries.map((entry) => {
          const row = formatTimelineEntry(entry);
          return (
          <Card key={entry.id} elevated className="!p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-ink">{row.action}</div>
                <div className="mt-0.5 text-2xs text-ink-tertiary">
                  {row.user_name}
                  {row.user_role ? ` · ${roleLabel(row.user_role)}` : ''}
                  {' · '}
                  {formatDate(row.occurred_at)}
                </div>
              </div>
              {row.status_change && (
                <Pill tone="info">{row.status_change}</Pill>
              )}
            </div>
            {row.notes && (
              <p className="mt-2 text-2xs text-ink-secondary">{row.notes}</p>
            )}
          </Card>
          );
        })}
      </div>
    </Drawer>
  );
}

export function PlaceholderPage({ title, description }) {
  return (
    <div className="mx-auto max-w-lg">
      <Card elevated className="px-6 py-12 text-center">
        <h1 className="text-sm font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-2xs text-ink-secondary">{description}</p>
      </Card>
    </div>
  );
}
