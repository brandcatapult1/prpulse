import { columnIdForStatus } from './campaignKanban.js';
import { canMarkDidntDeliver } from './campaignPermissions.js';
import { isValidDropReason } from './dropTransitions.js';
import {
  DIDNT_DELIVER_DROP_REASON,
  DROP_REASON_OPTIONS,
  NOT_CONTACTED_DROP_REASON,
  STAGE,
} from './engagementTransitions.js';

/** Drawer move tokens — never conversation_status flag values. */
export const DRAWER_MOVE = {
  FIRST_OUTREACH: 'drawer:first_outreach',
  PROFILE_REJECTED: 'drawer:profile_rejected',
  IN_CONVERSATION: 'drawer:in_conversation',
  SCHEDULED: 'drawer:scheduled',
  DROPPED: 'drawer:dropped',
  VISIT_DONE: 'drawer:visit_done',
  COMPLETE: 'drawer:complete',
  DIDNT_DELIVER: 'drawer:didnt_deliver',
  REOPEN: 'drawer:reopen',
};

export function drawerCurrentStageLabel(engagement, formatStatus) {
  if (engagement.conversation_status === 'no_response') {
    return 'In conversation · No response';
  }
  return formatStatus(engagement.conversation_status);
}

export function getDropReasonOptionsForStatus(status) {
  return DROP_REASON_OPTIONS.filter((o) => isValidDropReason(o.value, status));
}

/**
 * Stage-scoped move targets for the Campaign View drawer.
 * Objective stages only — no in-place flags (no_response, at-risk, visit-overdue).
 */
export function getCampaignDrawerMoveTargets(engagement, { canComplete, role }) {
  const status = engagement.conversation_status;
  const columnId = columnIdForStatus(status);

  if (columnId === 'not_contacted' && status === 'not_contacted') {
    return [
      {
        value: DRAWER_MOVE.FIRST_OUTREACH,
        label: 'Log first outreach',
        target: STAGE.IN_CONVERSATION,
        needsPrompt: 'follow_up_date',
        logFirstOutreach: true,
      },
      {
        value: DRAWER_MOVE.PROFILE_REJECTED,
        label: 'Profile rejected',
        target: STAGE.DROPPED,
        dropReason: NOT_CONTACTED_DROP_REASON.value,
        droppedFrom: 'not_contacted',
      },
    ];
  }

  if (columnId === 'in_conversation') {
    return [
      {
        value: DRAWER_MOVE.IN_CONVERSATION,
        label: 'Still in conversation',
        target: STAGE.IN_CONVERSATION,
        needsPrompt: 'follow_up_date',
      },
      {
        value: DRAWER_MOVE.SCHEDULED,
        label: 'Scheduled',
        target: STAGE.SCHEDULED,
        needsPrompt: 'visit_date',
      },
      {
        value: DRAWER_MOVE.DROPPED,
        label: 'Dropped',
        target: STAGE.DROPPED,
        needsPrompt: 'drop_reason',
      },
    ];
  }

  if (columnId === 'scheduled' && status === 'scheduled') {
    return [
      {
        value: DRAWER_MOVE.VISIT_DONE,
        label: 'Visit done',
        target: STAGE.AWAITING_FINAL_DELIVERABLES,
      },
      {
        value: DRAWER_MOVE.DROPPED,
        label: 'Dropped',
        target: STAGE.DROPPED,
        needsPrompt: 'drop_reason',
      },
    ];
  }

  if (columnId === 'awaiting_final' && status === 'awaiting_final_deliverables') {
    const targets = [];
    if (canComplete) {
      targets.push({
        value: DRAWER_MOVE.COMPLETE,
        label: 'Collaboration complete',
        target: STAGE.COMPLETE,
        needsConfirm: 'complete',
      });
    }
    if (canMarkDidntDeliver(role)) {
      targets.push({
        value: DRAWER_MOVE.DIDNT_DELIVER,
        label: "Didn't deliver",
        target: STAGE.DROPPED,
        dropReason: DIDNT_DELIVER_DROP_REASON.value,
        droppedFrom: 'awaiting_final_deliverables',
        needsConfirm: 'didnt_deliver',
      });
    }
    return targets;
  }

  if (columnId === 'dropped' && status?.startsWith('dropped_')) {
    return [
      {
        value: DRAWER_MOVE.REOPEN,
        label: 'Reopen',
        target: STAGE.REOPEN,
        needsConfirm: 'reopen',
      },
    ];
  }

  return [];
}
