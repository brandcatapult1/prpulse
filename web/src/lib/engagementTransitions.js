import { getDemoDeliverables } from './demo.js';
import { deliverableHasProof } from './deliverableLogging.js';
import { sideEffectsOnStatusChange } from './engagementRules.js';

/** Shared stage targets for drag-and-drop and inline card flows. */
export const STAGE = {
  SCHEDULED: 'Scheduled',
  AWAITING_FINAL_DELIVERABLES: 'AwaitingFinalDeliverables',
  DROPPED: 'Dropped',
  COMPLETE: 'CollaborationComplete',
  NO_RESPONSE: 'No Response',
  IN_CONVERSATION: 'In Conversation',
};

/** Drop reasons available before Awaiting Final Deliverables. */
export const DROP_REASON_OPTIONS = [
  { value: 'dropped_profile_rejected', label: 'Profile rejected' },
  { value: 'dropped_not_interested', label: 'Not interested' },
  { value: 'dropped_terms_disagreement', label: 'Terms disagreement' },
];

export const DIDNT_DELIVER_DROP_REASON = {
  value: 'dropped_didnt_deliver',
  label: "Didn't Deliver",
};

export function isValidDropReason(dropReason, fromStatus) {
  if (dropReason === DIDNT_DELIVER_DROP_REASON.value) {
    return fromStatus === 'awaiting_final_deliverables';
  }
  return DROP_REASON_OPTIONS.some((o) => o.value === dropReason);
}

export function canCompleteEngagement(engagementId) {
  const dels = getDemoDeliverables(engagementId);
  return (
    dels.length > 0
    && dels.every((d) => d.status === 'posted' && deliverableHasProof(d))
  );
}

/**
 * Single entry point for stage changes (board drag, card logging, drawer).
 * Returns { ok, patch } or { ok: false, needsPrompt, error }.
 */
export function transitionStage(engagement, target, payload = {}) {
  const normalized = String(target);

  if (normalized === STAGE.SCHEDULED || normalized === 'scheduled') {
    if (!payload.visitDate) {
      return { ok: false, needsPrompt: 'visit_date' };
    }
    return {
      ok: true,
      patch: {
        conversation_status: 'scheduled',
        visit_date: payload.visitDate,
        next_follow_up_date: payload.visitDate,
      },
    };
  }

  if (
    normalized === STAGE.AWAITING_FINAL_DELIVERABLES
    || normalized === 'awaiting_final_deliverables'
    || normalized === 'Awaiting Final Deliverables'
  ) {
    const visitCompletedDate =
      payload.visitCompletedDate ?? engagement.visit_date ?? engagement.next_follow_up_date;
    if (!visitCompletedDate) {
      return { ok: false, error: 'Visit date required' };
    }
    const dels = getDemoDeliverables(engagement.id);
    if (dels.length === 0) {
      return { ok: false, error: 'Add deliverables before logging visit complete' };
    }
    const nextFollowUp =
      dels
        .map((d) => d.due_date)
        .filter(Boolean)
        .sort()[0] ?? visitCompletedDate;
    return {
      ok: true,
      patch: {
        conversation_status: 'awaiting_final_deliverables',
        visit_completed_date: visitCompletedDate,
        next_follow_up_date: nextFollowUp,
      },
    };
  }

  if (normalized === STAGE.DROPPED || normalized === 'Dropped') {
    if (!payload.dropReason) {
      return { ok: false, needsPrompt: 'drop_reason' };
    }
    if (!isValidDropReason(payload.dropReason, engagement.conversation_status)) {
      return { ok: false, error: 'Invalid drop reason for this stage' };
    }
    const patch = {
      conversation_status: payload.dropReason,
      ...sideEffectsOnStatusChange(payload.dropReason),
    };
    if (payload.dropReason === DIDNT_DELIVER_DROP_REASON.value) {
      patch.drop_failed_at_stage = payload.failedAt ?? 'awaiting_final_deliverables';
    }
    return { ok: true, patch };
  }

  if (normalized === STAGE.NO_RESPONSE || normalized === 'no_response') {
    return {
      ok: true,
      patch: {
        conversation_status: 'no_response',
        next_follow_up_date: payload.nextFollowUpDate ?? null,
      },
    };
  }

  if (normalized === STAGE.IN_CONVERSATION || normalized === 'in_conversation') {
    if (!payload.nextFollowUpDate) {
      return { ok: false, needsPrompt: 'follow_up_date' };
    }
    return {
      ok: true,
      patch: {
        conversation_status: 'in_conversation',
        next_follow_up_date: payload.nextFollowUpDate,
      },
    };
  }

  if (
    normalized === STAGE.COMPLETE
    || normalized === 'collaboration_complete'
    || normalized === 'CollaborationComplete'
  ) {
    if (!canCompleteEngagement(engagement.id)) {
      return { ok: false, error: 'Complete when all deliverables are Posted with proof' };
    }
    return {
      ok: true,
      patch: {
        conversation_status: 'collaboration_complete',
        ...sideEffectsOnStatusChange('collaboration_complete'),
      },
    };
  }

  return { ok: false, error: 'Unknown stage' };
}
