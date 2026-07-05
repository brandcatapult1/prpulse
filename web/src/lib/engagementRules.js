/**
 * Engagement Record UI rules — derived from PRD Module 5, UX Spec §5.2–5.5, Module 9.
 */

export const CONVERSATION_STATUSES = [
  'not_contacted',
  'in_conversation',
  'scheduled',
  'no_response',
  'dropped_profile_rejected',
  'dropped_not_interested',
  'dropped_terms_disagreement',
  'dropped',
  'awaiting_final_deliverables',
  'collaboration_complete',
];

export function isComplete(status) {
  return status === 'collaboration_complete';
}

export function isDropped(status) {
  return status === 'dropped' || status?.startsWith('dropped_');
}

export function isTerminal(status) {
  return isComplete(status) || isDropped(status);
}

/** Follow-up: cleared when Complete or Dropped; editable only during active outreach. */
export function followUpRules(status) {
  if (isComplete(status)) {
    return {
      editable: false,
      display: '—',
      hint: 'No follow-up — collaboration is complete',
    };
  }
  if (isDropped(status)) {
    return {
      editable: false,
      display: '—',
      hint: 'No follow-up — engagement was dropped',
    };
  }
  return { editable: true, display: null, hint: null };
}

/** Visit: only while status is Scheduled (PRD § Scheduled Visit Tracking). */
export function visitRules(status) {
  if (status === 'scheduled') {
    return { available: true, lockedReason: null };
  }
  if (isComplete(status)) {
    return { available: false, lockedReason: 'Not applicable after collaboration is complete' };
  }
  if (isDropped(status)) {
    return { available: false, lockedReason: 'Not applicable — engagement dropped' };
  }
  return { available: false, lockedReason: 'Set status to Scheduled to plan a visit' };
}

/**
 * Deliverables: add/edit during delivery phase; read-only when Complete or Dropped.
 * Primary phase: Awaiting Final Deliverables.
 * Posted content requires Awaiting Final Deliverables — never during outreach stages.
 */
export function deliverablesRules(status) {
  if (isComplete(status)) {
    return {
      canAdd: false,
      canEditStatus: false,
      lockedReason: 'Locked — collaboration complete. Reopen to amend.',
    };
  }
  if (isDropped(status)) {
    return {
      canAdd: false,
      canEditStatus: false,
      lockedReason: 'Engagement was dropped',
    };
  }
  if (status === 'awaiting_final_deliverables') {
    return { canAdd: true, canEditStatus: true, lockedReason: null };
  }
  if (['in_conversation', 'scheduled', 'no_response'].includes(status)) {
    return {
      canAdd: true,
      canEditStatus: true,
      lockedReason: null,
      hint: 'Plan deliverables here — move to Awaiting Final Deliverables before content goes live',
    };
  }
  return {
    canAdd: false,
    canEditStatus: false,
    lockedReason: 'Start outreach before adding deliverables',
  };
}

/**
 * Removable whenever deliverables are editable for this engagement stage.
 * Keys off conversation_status via deliverablesRules (locked only when
 * collaboration_complete or dropped) — never completed_at.
 */
export function canRemoveDeliverable(engagementStatus, deliverable) {
  const rules = deliverablesRules(engagementStatus);
  if (!rules.canAdd || !deliverable) return false;
  return true;
}

export const DELIVERABLE_STATUSES = ['pending', 'received', 'approved', 'posted'];

const DELIVERABLE_STATUS_LABELS = {
  pending: 'Pending',
  received: 'Received',
  approved: 'Approved',
  posted: 'Posted',
};

/** Statuses allowed for an engagement stage (PRD funnel §10). */
export function allowedDeliverableStatuses(engagementStatus) {
  if (engagementStatus === 'awaiting_final_deliverables') {
    return DELIVERABLE_STATUSES;
  }
  if (['in_conversation', 'scheduled', 'no_response'].includes(engagementStatus)) {
    return ['pending'];
  }
  return [];
}

export function deliverableStatusOptionsForEngagement(engagementStatus) {
  return allowedDeliverableStatuses(engagementStatus).map((value) => ({
    value,
    label: DELIVERABLE_STATUS_LABELS[value],
  }));
}

export function canSetDeliverableStatus(engagementStatus, nextStatus) {
  return allowedDeliverableStatuses(engagementStatus).includes(nextStatus);
}

export function deliverableStatusBlockReason(engagementStatus, nextStatus) {
  if (nextStatus === 'posted') {
    return 'Move to Awaiting Final Deliverables before marking content Posted';
  }
  if (['received', 'approved'].includes(nextStatus)) {
    return 'Content tracking starts in Awaiting Final Deliverables';
  }
  if (nextStatus === 'pending') {
    return null;
  }
  return 'This status is not available at the current stage';
}

/** Feedback: after collaboration completion only (PRD Module 9). */
export function feedbackRules(status) {
  return {
    available: isComplete(status),
    lockedReason: isComplete(status)
      ? null
      : 'Available after Collaboration Complete',
  };
}

/** Agreed fee frozen while Complete (UX §5.5). */
export function agreedFeeRules(status) {
  return {
    editable: !isComplete(status),
    frozenReason: isComplete(status) ? 'Reopen engagement to amend fee' : null,
  };
}

export function interestRules(status) {
  return { editable: !isTerminal(status) };
}

export function notesRules(status) {
  return { editable: !isTerminal(status) };
}

export function followUpSuggestionForStatus(status) {
  if (status === 'in_conversation') return { days: 3, label: '3 days from today' };
  if (status === 'no_response') return { days: 7, label: '7 days from today' };
  return null;
}

export function sideEffectsOnStatusChange(nextStatus) {
  const patch = {};
  if (isComplete(nextStatus) || isDropped(nextStatus)) {
    patch.next_follow_up_date = null;
  }
  return patch;
}

export function getStatusOptions({ current, canComplete, formatStatus }) {
  // Complete is a one-way trapdoor in the status control — use sanctioned Reopen.
  if (isComplete(current)) {
    return [{
      value: 'collaboration_complete',
      label: formatStatus('collaboration_complete'),
    }];
  }

  const all = CONVERSATION_STATUSES.map((v) => ({
    value: v,
    label: formatStatus(v),
  }));

  let options = all;
  if (!canComplete) {
    options = options.filter((o) => o.value !== 'collaboration_complete');
  }

  return options;
}

/** Banner when terminal state explains locked fields. */
export function terminalBanner(status) {
  if (isComplete(status)) {
    return {
      tone: 'success',
      title: 'Collaboration complete',
      body: 'Follow-up and visit are closed. Deliverables and fee are locked. Add feedback or use Reopen to amend.',
    };
  }
  if (isDropped(status)) {
    return {
      tone: 'muted',
      title: 'Engagement dropped',
      body: 'Outreach actions are closed. View timeline for history.',
    };
  }
  return null;
}
