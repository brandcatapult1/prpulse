import { getDemoDeliverables } from './demo.js';
import { deliverableHasProof } from './deliverableLogging.js';
import { todayIso } from './dates.js';
import { canMarkDidntDeliver } from './campaignPermissions.js';
import { sideEffectsOnStatusChange } from './engagementRules.js';
import {
  conversationStatusToDroppedFrom,
  droppedFromToStatus,
  isValidDropReason,
  resolveDroppedFrom,
} from './dropTransitions.js';

/** Shared stage targets for drag-and-drop and inline card flows. */
export const STAGE = {
  SCHEDULED: 'Scheduled',
  AWAITING_FINAL_DELIVERABLES: 'AwaitingFinalDeliverables',
  DROPPED: 'Dropped',
  COMPLETE: 'CollaborationComplete',
  NO_RESPONSE: 'No Response',
  IN_CONVERSATION: 'In Conversation',
  REOPEN: 'Reopen',
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

export { isValidDropReason, resolveDroppedFrom, droppedFromToStatus } from './dropTransitions.js';
export { NOT_CONTACTED_DROP_REASON } from './dropTransitions.js';

export function canCompleteEngagement(engagementId) {
  const dels = getDemoDeliverables(engagementId);
  return (
    dels.length > 0
    && dels.every((d) => d.status === 'posted' && deliverableHasProof(d))
  );
}

function buildDropPatch(engagement, dropReason, payload) {
  const fromStatus = engagement.conversation_status;
  const droppedFrom =
    payload.droppedFrom
    ?? conversationStatusToDroppedFrom(fromStatus === 'no_response' ? 'no_response' : fromStatus);
  return {
    conversation_status: dropReason,
    dropped_from: droppedFrom,
    ...sideEffectsOnStatusChange(dropReason),
  };
}

/**
 * Single entry point for stage changes (board drag, card logging, drawer).
 * Returns { ok, patch } or { ok: false, needsPrompt, error }.
 */
export function transitionStage(engagement, target, payload = {}) {
  const normalized = String(target);

  if (normalized === STAGE.REOPEN || normalized === 'Reopen') {
    if (!engagement.conversation_status?.startsWith('dropped_')) {
      return { ok: false, error: 'Engagement is not dropped' };
    }
    const droppedFrom = resolveDroppedFrom(engagement);
    if (!droppedFrom) {
      return { ok: false, error: 'No prior stage recorded' };
    }
    if (
      engagement.conversation_status === DIDNT_DELIVER_DROP_REASON.value
      && !canMarkDidntDeliver(payload.role)
    ) {
      return { ok: false, error: 'Senior Manager or Admin required to reopen' };
    }
    const targetStatus = droppedFromToStatus(droppedFrom);
    return {
      ok: true,
      patch: {
        conversation_status: targetStatus,
        dropped_from: null,
      },
      clearBlacklist: Boolean(payload.clearBlacklist),
    };
  }

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
    return {
      ok: true,
      patch: buildDropPatch(engagement, payload.dropReason, payload),
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
    const patch = {
      conversation_status: 'in_conversation',
      next_follow_up_date: payload.nextFollowUpDate,
    };
    if (payload.logFirstOutreach || engagement.conversation_status === 'not_contacted') {
      const today = payload.contactDate ?? todayIso();
      patch.initial_contact_date = today;
      patch.last_contact_date = today;
      patch.last_contact_log_type = 'conversation';
      patch.no_reply_count = 0;
    }
    return { ok: true, patch };
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
