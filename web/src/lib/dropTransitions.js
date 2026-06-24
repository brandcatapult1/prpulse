import { canMarkDidntDeliver } from './campaignPermissions.js';

/** Generic Dropped stage status — reason lives in drop_reason. */
export const DROPPED_STAGE_STATUS = 'dropped';

export const DIDNT_DELIVER_REASON = 'didnt_deliver';

/** Map live status → dropped_from slug stored on the engagement. */
export function conversationStatusToDroppedFrom(status) {
  if (status === 'no_response') return 'no_response';
  if (status === 'not_contacted') return 'not_contacted';
  if (status === 'in_conversation') return 'in_conversation';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'awaiting_final_deliverables') return 'awaiting_final_deliverables';
  return status;
}

/** Resolve stored dropped_from (or legacy drop_failed_at_stage) → conversation_status. */
export function droppedFromToStatus(droppedFrom) {
  const map = {
    not_contacted: 'not_contacted',
    'Not Contacted': 'not_contacted',
    in_conversation: 'in_conversation',
    'In Conversation': 'in_conversation',
    no_response: 'no_response',
    'No Response': 'no_response',
    scheduled: 'scheduled',
    Scheduled: 'scheduled',
    awaiting_final_deliverables: 'awaiting_final_deliverables',
    'Awaiting Final Deliverables': 'awaiting_final_deliverables',
  };
  return map[droppedFrom] ?? droppedFrom;
}

export function resolveDroppedFrom(engagement) {
  return engagement.dropped_from ?? engagement.drop_failed_at_stage ?? null;
}

export function droppedFromLabel(droppedFrom) {
  const labels = {
    not_contacted: 'Not Contacted',
    in_conversation: 'In Conversation',
    no_response: 'No Response',
    scheduled: 'Scheduled',
    awaiting_final_deliverables: 'Awaiting Final Deliverables',
  };
  return labels[droppedFrom] ?? (String(droppedFrom ?? '').replace(/_/g, ' ') || '—');
}

export function isDroppedStatus(status) {
  return status === DROPPED_STAGE_STATUS || status?.startsWith('dropped_');
}

/** Didn't Deliver: conversation_status=dropped + drop_reason=didnt_deliver (see migration 007). */
export function isDidntDeliverDrop(engagement) {
  return engagement?.drop_reason === DIDNT_DELIVER_REASON;
}

export function canReopenDropped(role, engagement) {
  if (isDidntDeliverDrop(engagement)) {
    return canMarkDidntDeliver(role);
  }
  return true;
}

/** Stage-scoped drop reasons (PRD funnel). Keys are drop_reason slugs or conversation_status values. */
export const DROP_REASON_STAGES = {
  dropped_profile_rejected: ['not_contacted', 'in_conversation'],
  dropped_not_interested: ['in_conversation', 'scheduled', 'no_response'],
  dropped_terms_disagreement: ['in_conversation', 'scheduled', 'no_response'],
  [DIDNT_DELIVER_REASON]: ['awaiting_final_deliverables'],
};

export function isValidDropReason(dropReason, fromStatus) {
  const allowed = DROP_REASON_STAGES[dropReason];
  if (!allowed) return false;
  return allowed.includes(fromStatus);
}

export const NOT_CONTACTED_DROP_REASON = {
  value: 'dropped_profile_rejected',
  label: 'Profile rejected',
};
