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
import { VisitCaptureForm } from '../components/visit/VisitCaptureForm.jsx';
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
import { formatTimelineEntry, formatDropReason } from '../lib/activityTimelineLabels.js';
import {
  agreedFeeRules,
  canRemoveDeliverable,
  collaborationReasonRules,
  commercialsRules,
  deliverablesRules,
  feedbackRules,
  followUpRules,
  followUpSuggestionForStatus,
  getStatusOptions,
  isComplete,
  isDropped,
  notesRules,
  outreachAdvanceRules,
  sideEffectsOnStatusChange,
  terminalBanner,
  visitCardRules,
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
import { formatCollaborationReason, COLLABORATION_REASONS } from '../lib/collaborationReasons.js';
import { estimateAgreedFeeFromIndicativeRates } from '../lib/agreedFeeEstimate.js';
import { addDeliverableToList, deliverableListUnitTotals, removeDeliverableFromList } from '../lib/deliverableList.js';
import {
  buildScheduledTransitionPayload,
  emptyVisitFields,
  formatVisitTimeForDisplay,
  resolveEngagementOutletName,
  visitFieldsFromEngagement,
} from '../lib/visitFields.js';
import { DROP_REASON_OPTIONS, STAGE, transitionStage } from '../lib/engagementTransitions.js';
import { DIDNT_DELIVER_REASON } from '../lib/dropTransitions.js';
import {
  AWAITING_REQUIRES_VISIT_MESSAGE,
  buildVisitDoneTransition,
  canAdvanceToAwaitingViaVisit,
  visitDoneToastMessage,
} from '../lib/visitLogging.js';

function deliverablesSnapshot(list) {
  return JSON.stringify((list ?? []).map(({ is_overdue, ...row }) => row));
}

function mergeSavedDeliverableRow(rows, submittedId, saved) {
  const savedRow = structuredClone(saved);
  const index = (rows ?? []).findIndex((d) => d.id === submittedId);
  if (index === -1) {
    const withoutDup = (rows ?? []).filter((d) => d.id !== savedRow.id);
    return [...withoutDup, savedRow];
  }
  return (rows ?? []).map((d) => (d.id === submittedId ? savedRow : d));
}

function isTempDeliverableId(deliverableId) {
  return String(deliverableId ?? '').startsWith('d-');
}

function cloneDeliverables(list) {
  return structuredClone(list ?? []);
}

function proofStateSignature(row) {
  if (!row) return '';
  const screenshots = [...(row.screenshots ?? [])]
    .map((s) => String(s.url ?? s.file_path ?? '').trim())
    .filter(Boolean)
    .sort();
  return JSON.stringify({
    content_link: row.content_link ?? null,
    status: row.status ?? 'pending',
    posted_quantity: row.posted_quantity ?? 0,
    screenshots,
    unit_proofs: row.unit_proofs ?? [],
  });
}

function planningStateSignature(row) {
  if (!row) return '';
  return JSON.stringify({
    deliverable_type: row.deliverable_type,
    quantity: row.quantity ?? 1,
    line_fee: row.line_fee ?? null,
  });
}

function deliverablesSaveHint({ canEditProof, showLineFee }) {
  if (canEditProof) {
    return 'Save deliverables stores proof (links and screenshots). Use Save & mark posted on each row to mark Posted.';
  }
  if (showLineFee) {
    return 'Save deliverables stores planned types, counts, and optional line fees.';
  }
  return 'Save deliverables stores planned types and counts.';
}

/** Toast after Save deliverables — keyed off what the draft actually changed. */
function deliverableDraftSavedToast(beforeList, afterDraft, saved) {
  if (saved?.some((d) => d.proof_demoted)) return null;

  const beforeById = new Map((beforeList ?? []).map((d) => [d.id, d]));
  const afterIds = new Set((afterDraft ?? []).map((d) => d.id));

  let newlyPosted = false;
  let proofChanged = false;
  let planningChanged = false;

  for (const row of afterDraft ?? []) {
    const isNew = String(row.id ?? '').startsWith('d-') || !beforeById.has(row.id);
    if (isNew) {
      planningChanged = true;
      if (row.status === 'posted') newlyPosted = true;
      continue;
    }
    const prior = beforeById.get(row.id);
    if (prior.status !== row.status && row.status === 'posted') newlyPosted = true;
    if (proofStateSignature(prior) !== proofStateSignature(row)) proofChanged = true;
    if (planningStateSignature(prior) !== planningStateSignature(row)) planningChanged = true;
  }

  for (const prior of beforeList ?? []) {
    if (!afterIds.has(prior.id)) planningChanged = true;
  }

  if (newlyPosted) return 'Deliverables saved';
  if (proofChanged) {
    return 'Deliverables saved — proof updated (use Save & mark posted to mark Posted)';
  }
  if (planningChanged) return 'Deliverables saved';
  return 'Deliverables saved';
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
  const [agreedFeeDraft, setAgreedFeeDraft] = useState('');
  const [visitFields, setVisitFields] = useState(emptyVisitFields);
  const [pendingScheduleVisit, setPendingScheduleVisit] = useState(false);
  const [visitOutcomeStep, setVisitOutcomeStep] = useState('idle');

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

  const applySavedDeliverableRow = async (submittedId, saved, { refreshTimelineOnDemotion = false } = {}) => {
    setDeliverables((rows) => {
      const next = mergeSavedDeliverableRow(rows, submittedId, saved);
      updateEngagementDeliverables(id, next);
      return next;
    });
    setSavedDeliverables((rows) => mergeSavedDeliverableRow(rows, submittedId, saved));
    if (isTempDeliverableId(submittedId) && saved.id && saved.id !== submittedId) {
      setMarkPostedErrors((prev) => {
        const next = { ...prev };
        delete next[submittedId];
        return next;
      });
    }
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

      const synced = await syncDeliverables(id, beforeList, prepared);
      const demoted = synced?.filter((d) => d.proof_demoted) ?? [];
      if (demoted.length) {
        const message = demoted
          .map((d) => d.proof_demote_message || deliverableProofDemotionMessage(d.deliverable_type))
          .join(' · ');
        setToast(message);
        await refreshAfterDeliverableDemotion();
      }

      const fresh = await fetchDeliverables(id);
      const confirmed = cloneDeliverables(fresh ?? []);
      setDeliverables(confirmed);
      setSavedDeliverables(cloneDeliverables(confirmed));
      updateEngagementDeliverables(id, confirmed);
      return { saved: confirmed, beforeList };
    } catch (err) {
      const message = err.deliverable
        ? deliverableProofRejectMessage(err.deliverable, err.message)
        : apiErrorMessage(err);
      setToast(message);
      return null;
    }
  };

  const commitDeliverablesDraft = async () => {
    const draft = deliverables;
    const result = await persistDeliverables(draft);
    if (!result?.saved) return;
    const toastMessage = deliverableDraftSavedToast(result.beforeList, draft, result.saved);
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

  useEffect(() => {
    if (!engagement) return;
    setAgreedFeeDraft(
      engagement.agreed_fee != null && engagement.agreed_fee !== ''
        ? String(engagement.agreed_fee)
        : '',
    );
  }, [engagement?.id, engagement?.agreed_fee]);

  useEffect(() => {
    if (!engagement) return;
    setVisitFields(visitFieldsFromEngagement(engagement));
    if (engagement.conversation_status === 'scheduled') {
      setPendingScheduleVisit(false);
    }
  }, [
    engagement?.id,
    engagement?.visit_date,
    engagement?.visit_time,
    engagement?.visit_notes,
    engagement?.conversation_status,
  ]);

  useEffect(() => {
    if (engagement?.conversation_status !== 'scheduled') {
      setVisitOutcomeStep('idle');
    }
  }, [engagement?.conversation_status]);

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
  const visitCard = visitCardRules(status, { hasVisitDate: Boolean(engagement.visit_date) });
  const deliverablesRule = deliverablesRules(status);
  const feedback = feedbackRules(status);
  const feeRule = agreedFeeRules(status);
  const collabReasonRule = collaborationReasonRules(status);
  const commercialsRule = commercialsRules(status);
  const outreachRule = outreachAdvanceRules(status);
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
      setPendingScheduleVisit(true);
      setVisitFields(visitFieldsFromEngagement(engagement));
      return;
    }
    setPendingScheduleVisit(false);
    if (isComplete(engagement?.conversation_status)) return;

    if (next === 'collaboration_complete') {
      if (!engagement.primary_collaboration_reason) {
        setToast('Add a collaboration reason before completing — set it in Details below.');
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
      persistEngagement(patch, { successMessage: 'Collaboration complete' });
      return;
    }

    if (next === 'not_contacted') {
      setToast('Not Contacted cannot be set from the record page — use the campaign board.');
      return;
    }

    clearStatusPrompt();

    if (next === 'awaiting_final_deliverables') {
      if (!canAdvanceToAwaitingViaVisit(engagement)) {
        setToast(AWAITING_REQUIRES_VISIT_MESSAGE);
        return;
      }
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
    persistEngagement(
      { next_follow_up_date: date || null },
      { successMessage: date ? `Follow-up set to ${formatDate(date)}` : 'Follow-up cleared' },
    );
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
  const showLineFee = collabType === 'paid';
  const lineFeeEditable = showLineFee && !feeRule.frozen && deliverablesRule.canEditStatus;
  const commercialsFrozen = !commercialsRule.editable;

  function startLogFirstOutreach() {
    setPendingStatusTransition({
      target: STAGE.IN_CONVERSATION,
      logFirstOutreach: true,
    });
    setStatusFollowUpDraft('');
    setStatusPrompt('follow_up_date');
  }

  const visitOutletName = resolveEngagementOutletName(engagement);
  const visitSectionLocked = visitCard.mode === 'locked' && !pendingScheduleVisit;
  const visitSectionEditable = visitCard.mode === 'interactive' || pendingScheduleVisit;
  const visitSectionReadOnly = visitCard.mode === 'read_only';
  const canMarkVisitDone = status === 'scheduled' && Boolean(engagement.visit_date);

  async function handleSaveVisit() {
    const payload = buildScheduledTransitionPayload(engagement, visitFields);
    const result = transitionStage(engagement, STAGE.SCHEDULED, {
      ...payload,
      deliverables: savedDeliverables,
      collabReason: engagement.primary_collaboration_reason,
    });
    if (!result.ok) {
      setToast(result.error ?? 'Could not save visit');
      return;
    }
    const ok = await persistEngagement(result.patch, {
      successMessage: 'Visit saved — follow-up set to visit date',
    });
    if (ok) {
      setFollowUpSuggestion(null);
      setPendingScheduleVisit(false);
    }
  }

  async function handleMarkVisitDone() {
    const result = buildVisitDoneTransition(engagement, transitionStage, STAGE);
    await applyStageTransition(result, visitDoneToastMessage());
    setVisitOutcomeStep('idle');
  }

  function handleVisitReschedule() {
    setVisitFields((prev) => ({ ...prev, visitDate: '' }));
    setVisitOutcomeStep('idle');
  }

  async function handleVisitCancelled(reason) {
    const result = transitionStage(engagement, STAGE.DROPPED, { dropReason: reason });
    const label = DROP_REASON_OPTIONS.find((o) => o.value === reason)?.label ?? 'Dropped';
    await applyStageTransition(result, `Visit cancelled — ${label}`);
    setVisitOutcomeStep('idle');
  }

  const deliverablesFullyLocked = Boolean(deliverablesRule.lockedReason)
    && !deliverablesRule.canAdd
    && !deliverablesRule.canEditStatus;

  async function makePaid() {
    if (commercialsFrozen) return;
    const patch = { collaboration_type: 'paid' };
    const estimated = estimateAgreedFeeFromIndicativeRates(savedDeliverables, contactExtras);
    if (savedDeliverables.length > 0 && estimated != null) {
      patch.agreed_fee = estimated;
      setAgreedFeeDraft(String(estimated));
    }
    await persistEngagement(patch, { successMessage: 'Switched to paid' });
  }

  async function saveAgreedFee() {
    if (feeRule.frozen || collabType !== 'paid') return;
    const raw = agreedFeeDraft.trim();
    const next = raw === '' ? null : Number(raw);
    if (raw !== '' && Number.isNaN(next)) {
      setToast('Enter a valid agreed fee');
      return;
    }
    const current = engagement.agreed_fee == null ? null : Number(engagement.agreed_fee);
    if (next === current) return;
    await persistEngagement({ agreed_fee: next }, { successMessage: 'Agreed fee saved' });
  }

  async function handleCollabReasonChange(value) {
    if (!collabReasonRule.editable) return;
    const next = value || null;
    if (next === (engagement.primary_collaboration_reason ?? null)) return;
    await persistEngagement(
      { primary_collaboration_reason: next },
      { successMessage: 'Collaboration reason saved' },
    );
  }

  async function makeBarter() {
    if (commercialsFrozen) return;
    setAgreedFeeDraft('');
    const ok = await persistEngagement(
      { collaboration_type: 'barter', agreed_fee: null },
      { successMessage: 'Switched to barter' },
    );
    if (ok) {
      const dels = await fetchDeliverables(id);
      const cleared = cloneDeliverables(dels ?? []);
      setDeliverables(cleared);
      setSavedDeliverables(cloneDeliverables(cleared));
      updateEngagementDeliverables(id, cleared);
    }
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
      {isDropped(status) && engagement.drop_reason && (
        <div className="rounded-lg border border-line bg-canvas px-4 py-3 text-2xs text-ink-secondary">
          <span className="font-semibold text-ink">Drop reason:</span>{' '}
          {formatDropReason(engagement.drop_reason)}
        </div>
      )}
      {saving && (
        <p className="text-2xs text-ink-tertiary">Saving…</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
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
          title="Timeline"
          subtitle={`${timeline.length} events`}
          onClick={() => setModal('timeline')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card
            elevated
            className={`!p-5 ${outreachRule.lockedReason ? 'opacity-60' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Advance outreach</h2>
                <p className="mt-0.5 text-2xs text-ink-secondary">Update conversation status</p>
              </div>
              {outreachRule.lockedReason && (
                <span className="text-2xs font-medium text-ink-tertiary shrink-0">Locked</span>
              )}
            </div>
            {outreachRule.lockedReason && (
              <LockedReasonBanner reason={outreachRule.lockedReason} />
            )}
            <div className={`mt-4 ${outreachRule.lockedReason ? 'pointer-events-none' : ''}`}>
              <div>
                {outreachRule.logFirstOutreach && (
                  <div className="mb-4">
                    <button type="button" className="btn-primary" onClick={startLogFirstOutreach}>
                      Log first outreach
                    </button>
                    <p className="mt-2 text-2xs text-ink-tertiary">
                      Moves to In Conversation and logs your first contact date.
                    </p>
                  </div>
                )}
                <label className="mb-2 block text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Status
                </label>
                <StatusButton
                  value={engagement.conversation_status}
                  options={statusChoices}
                  onChange={handleStatusChange}
                  disabled={!outreachRule.statusEditable}
                  hint={
                    outreachRule.statusHint
                      ?? (isComplete(status)
                        ? canReopenComplete(user?.role)
                          ? 'Use Reopen to amend deliverables or fee'
                          : 'Collaboration complete — Senior Manager or Admin can reopen'
                        : !hasCollaborationReason && deliverablesReady
                          ? 'Add a collaboration reason in Details before completing'
                        : !canComplete
                          ? 'Complete unlocks when all deliverables are Posted with proof'
                          : undefined)
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

          <Card
            elevated
            className={`!p-5 ${visitSectionLocked ? 'opacity-60' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Visit</h2>
                <p className="mt-0.5 text-2xs text-ink-secondary">
                  Plan and log the creator visit
                </p>
              </div>
              {visitSectionLocked && (
                <span className="text-2xs font-medium text-ink-tertiary shrink-0">Locked</span>
              )}
              {visitSectionReadOnly && (
                <Pill tone="success">Completed</Pill>
              )}
            </div>
            {visitSectionLocked && (
              <LockedReasonBanner reason={visitCard.lockedReason} />
            )}
            <div className={`mt-4 ${visitSectionLocked ? 'pointer-events-none' : ''}`}>
              {visitSectionReadOnly && (
                <VisitSummary
                  engagement={engagement}
                  outletName={visitOutletName}
                  completed
                />
              )}
              {visitSectionEditable && (
                <>
                  {(pendingScheduleVisit || !engagement.visit_date) && (
                    <p className="mb-3 text-2xs text-ink-secondary">
                      Required when status is Scheduled. Follow-up will be set to the visit date you pick.
                    </p>
                  )}
                  <VisitCaptureForm
                    outletName={visitOutletName}
                    value={visitFields}
                    onChange={setVisitFields}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!visitFields.visitDate || saving}
                      onClick={handleSaveVisit}
                    >
                      {saving ? 'Saving…' : 'Save visit'}
                    </button>
                    {canMarkVisitDone && (
                      <ScheduledVisitOutcomes
                        step={visitOutcomeStep}
                        onStepChange={setVisitOutcomeStep}
                        onVisitDone={handleMarkVisitDone}
                        onReschedule={handleVisitReschedule}
                        onCancelled={handleVisitCancelled}
                        saving={saving}
                      />
                    )}
                  </div>
                </>
              )}
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
              <CollaborationReasonField
                value={engagement.primary_collaboration_reason}
                editable={collabReasonRule.editable}
                lockedReason={collabReasonRule.lockedReason}
                onChange={handleCollabReasonChange}
                className="sm:col-span-2"
              />
            </dl>
          </Card>

          <Card
            elevated
            className={`!p-5 ${deliverablesFullyLocked ? 'opacity-60' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Deliverables</h2>
                <p className="mt-0.5 text-2xs text-ink-secondary">
                  What content did you agree on with this creator?
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {deliverablesFullyLocked && (
                  <span className="text-2xs font-medium text-ink-tertiary">Locked</span>
                )}
                <Pill tone={savedDeliverables.length ? 'info' : 'muted'}>
                  {postedUnits}/{totalUnits} posted
                </Pill>
                {deliverablesDirty && deliverablesRule.canEditStatus && (
                  <span className="text-2xs text-health-amber">
                    Unsaved changes — save deliverables first
                  </span>
                )}
              </div>
            </div>

            {deliverablesRule.lockedReason && (
              <LockedReasonBanner reason={deliverablesRule.lockedReason} />
            )}
            {deliverablesRule.hint && (
              <p className="mt-3 text-2xs text-ink-tertiary">{deliverablesRule.hint}</p>
            )}

            <div className={`mt-4 border-t border-line/60 pt-4 ${deliverablesFullyLocked ? 'pointer-events-none' : ''}`}>
              <p className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">The deal</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-2xs text-ink-secondary">
                  <span>Type</span>
                  <Pill tone={collabType === 'paid' ? 'info' : 'success'}>
                    {collabType === 'paid' ? 'Paid' : 'Barter'}
                  </Pill>
                </div>
                {commercialsFrozen ? (
                  <span className="text-2xs text-ink-tertiary">
                    {commercialsRule.lockedReason ?? feeRule.frozenReason}
                  </span>
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
              {collabType === 'paid' && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg bg-canvas px-3 py-2">
                    <p className="text-2xs font-medium text-ink-tertiary">
                      Indicative rates (reference only — not saved to this engagement)
                    </p>
                    <p className="mt-1 text-2xs text-ink-secondary">
                      Reel {formatFee(contactExtras.reel_rate)}
                      {' · '}
                      Story {formatFee(contactExtras.story_rate)}
                      {' · '}
                      Post {formatFee(contactExtras.post_rate)}
                      {' · '}
                      Other {formatFee(contactExtras.other_rate)}
                    </p>
                  </div>
                  <label className="block">
                    <span className="text-2xs font-medium text-ink-tertiary">Agreed fee (this engagement)</span>
                    {feeRule.frozen ? (
                      <p className="mt-1 text-sm font-medium text-ink">{formatFee(engagement.agreed_fee)}</p>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        className="input-field mt-1 max-w-[200px]"
                        value={agreedFeeDraft}
                        onChange={(e) => setAgreedFeeDraft(e.target.value)}
                        onBlur={saveAgreedFee}
                        placeholder="Amount"
                        disabled={commercialsFrozen}
                      />
                    )}
                    {feeRule.frozenReason && (
                      <p className="mt-1 text-2xs text-ink-tertiary">{feeRule.frozenReason}</p>
                    )}
                  </label>
                </div>
              )}
            </div>

            {!deliverablesRule.canAdd && deliverables.length > 0 && (
              <div className="mt-4">
                <button type="button" className="btn-ghost" onClick={() => setModal('deliverables')}>
                  View deliverables
                </button>
              </div>
            )}

            <div className={deliverablesFullyLocked ? 'pointer-events-none' : ''}>
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
                    canEditProof={deliverablesRule.canEditProof}
                    canShowProofUI={deliverablesRule.canShowProofUI}
                    showLineFee={showLineFee}
                    lineFeeEditable={lineFeeEditable}
                    canMarkPosted={deliverablesRule.canMarkPosted}
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
                  {deliverablesSaveHint({ canEditProof: deliverablesRule.canEditProof, showLineFee })}
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
            </div>
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
        canEditProof={deliverablesRule.canEditProof}
        canShowProofUI={deliverablesRule.canShowProofUI}
        showLineFee={showLineFee}
        lineFeeEditable={lineFeeEditable}
        canMarkPosted={deliverablesRule.canMarkPosted}
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

function LockedReasonBanner({ reason }) {
  if (!reason) return null;
  return (
    <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-2xs text-ink-secondary">
      {reason}
    </p>
  );
}

/** Matches board ScheduledCardLogging — Visit done / Didn't happen → reschedule or cancel. */
function ScheduledVisitOutcomes({
  step,
  onStepChange,
  onVisitDone,
  onReschedule,
  onCancelled,
  saving,
}) {
  if (step === 'didnt_happen') {
    return (
      <div className="mt-4 w-full rounded-lg border border-line bg-canvas px-3 py-3">
        <p className="text-2xs font-medium text-ink-secondary">What happened?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={onReschedule}
          >
            Reschedule
          </button>
          <button
            type="button"
            className="btn-secondary text-health-red"
            disabled={saving}
            onClick={() => onStepChange('cancelled_reason')}
          >
            Cancelled
          </button>
          <button
            type="button"
            className="btn-ghost text-2xs"
            disabled={saving}
            onClick={() => onStepChange('idle')}
          >
            Back
          </button>
        </div>
        <p className="mt-2 text-2xs text-ink-tertiary">
          Reschedule keeps the engagement Scheduled — pick a new visit date above and save.
        </p>
      </div>
    );
  }

  if (step === 'cancelled_reason') {
    return (
      <div className="mt-4 w-full rounded-lg border border-line bg-canvas px-3 py-3">
        <p className="text-2xs font-medium text-ink-secondary">Drop reason</p>
        <div className="mt-2 space-y-1">
          {DROP_REASON_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="btn-ghost w-full justify-start text-2xs text-health-red"
              disabled={saving}
              onClick={() => onCancelled(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-2 w-full"
          disabled={saving}
          onClick={() => onStepChange('didnt_happen')}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex w-full flex-wrap gap-2 border-t border-line pt-4">
      <button
        type="button"
        className="btn-primary"
        disabled={saving}
        onClick={onVisitDone}
      >
        Visit done
      </button>
      <button
        type="button"
        className="btn-secondary"
        disabled={saving}
        onClick={() => onStepChange('didnt_happen')}
      >
        Didn&apos;t happen
      </button>
    </div>
  );
}

function VisitSummary({ engagement, outletName, completed = false, className = '' }) {
  if (!engagement?.visit_date) return null;
  return (
    <dl className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      <DetailItem label="Visit date" value={formatDate(engagement.visit_date)} />
      {engagement.visit_time && (
        <DetailItem label="Time" value={formatVisitTimeForDisplay(engagement.visit_time)} />
      )}
      {outletName && (
        <DetailItem label="Outlet" value={outletName} className="sm:col-span-2" />
      )}
      {engagement.visit_notes && (
        <DetailItem label="Notes" value={engagement.visit_notes} className="sm:col-span-2" />
      )}
      {completed && engagement.visit_completed_date && (
        <DetailItem
          label="Visit completed"
          value={formatDate(engagement.visit_completed_date)}
        />
      )}
    </dl>
  );
}

function ActionCard({
  title,
  subtitle,
  badge,
  badgeTone = 'default',
  disabled = false,
  dimmed,
  lockedLabel = 'Locked',
  onClick,
}) {
  const isDimmed = dimmed ?? disabled;
  return (
    <Card
      elevated
      interactive={!disabled}
      onClick={disabled ? undefined : onClick}
      className={`!p-4 ${isDimmed ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className={`mt-0.5 text-2xs ${isDimmed ? 'text-ink-tertiary' : 'text-ink-secondary'}`}>
            {subtitle}
          </div>
        </div>
        {!disabled && <span className="text-lg text-ink-tertiary" aria-hidden>→</span>}
        {disabled && lockedLabel && (
          <span className="text-2xs font-medium text-ink-tertiary" aria-hidden>{lockedLabel}</span>
        )}
      </div>
      {badge && (
        <div className="mt-3">
          <Pill tone={badgeTone}>{badge}</Pill>
        </div>
      )}
    </Card>
  );
}

function CollaborationReasonField({
  value,
  editable,
  lockedReason,
  onChange,
  className = '',
}) {
  return (
    <div className={className}>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
        Collaboration reason
        {!editable && <span className="ml-1 normal-case text-ink-tertiary">(locked)</span>}
      </dt>
      <dd className="mt-1.5">
        {editable ? (
          <>
            <select
              className="input-field max-w-[240px]"
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value || null)}
              aria-label="Primary collaboration reason"
            >
              <option value="">Select reason…</option>
              {COLLABORATION_REASONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {!value && (
              <p className="mt-1.5 text-2xs text-health-amber">Required before scheduling</p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">{formatCollaborationReason(value)}</p>
            {lockedReason && (
              <p className="mt-1 text-2xs text-ink-tertiary">{lockedReason}</p>
            )}
          </>
        )}
      </dd>
    </div>
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
        <dd className="mt-1 text-sm font-medium text-ink">
          {value ? formatDate(value) : '—'}
        </dd>
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
  canShowProofUI = false,
  showLineFee = false,
  lineFeeEditable = false,
  canMarkPosted = false,
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
              canShowProofUI={canShowProofUI}
              showLineFee={showLineFee}
              lineFeeEditable={lineFeeEditable}
              canMarkPosted={canMarkPosted}
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
