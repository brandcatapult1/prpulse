import { getDemoDeliverables } from './demo.js';
import { sideEffectsOnStatusChange } from './engagementRules.js';

/** Shared stage targets for drag-and-drop and inline card flows. */
export const STAGE = {
  SCHEDULED: 'Scheduled',
  AWAITING_FINAL_DELIVERABLES: 'AwaitingFinalDeliverables',
  DROPPED: 'Dropped',
  COMPLETE: 'Complete',
  NO_RESPONSE: 'No Response',
  IN_CONVERSATION: 'In Conversation',
};

export const DROP_REASON_OPTIONS = [
  { value: 'dropped_profile_rejected', label: 'Profile rejected' },
  { value: 'dropped_not_interested', label: 'Not interested' },
  { value: 'dropped_terms_disagreement', label: 'Terms disagreement' },
];

export function canCompleteEngagement(engagementId) {
  const dels = getDemoDeliverables(engagementId);
  return dels.length > 0 && dels.every((d) => d.status === 'posted');
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
    if (!DROP_REASON_OPTIONS.some((o) => o.value === payload.dropReason)) {
      return { ok: false, error: 'Pick a drop reason' };
    }
    return {
      ok: true,
      patch: {
        conversation_status: payload.dropReason,
        ...sideEffectsOnStatusChange(payload.dropReason),
      },
    };
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

  if (normalized === STAGE.COMPLETE || normalized === 'collaboration_complete') {
    if (!canCompleteEngagement(engagement.id)) {
      return { ok: false, error: 'Complete when all deliverables are Posted' };
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
