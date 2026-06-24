import { COLLABORATION_REASONS } from './collaborationReasons.js';
import {
  isDeliverablesAtRisk,
  isFollowUpOverdue,
  isVisitOverdue,
} from './campaignKanban.js';
import { isTerminal } from './engagementRules.js';

export const CAMPAIGN_RISK_FILTERS = [
  { value: 'any', label: 'Any flag' },
  { value: 'overdue_follow_up', label: 'Overdue follow-up' },
  { value: 'no_response', label: 'No response' },
  { value: 'visit_overdue', label: 'Visit overdue' },
  { value: 'deliverables_at_risk', label: 'Deliverables at risk' },
];

export const CAMPAIGN_EMPTY_FILTERS = {
  owner: null,
  collabReason: null,
  risk: null,
};

function isTerminalStatus(status) {
  return isTerminal(status);
}

/** Follow-up date past due — active engagements only. */
export function isEngagementFollowUpOverdue(engagement) {
  if (isTerminalStatus(engagement.conversation_status)) return false;
  return isFollowUpOverdue(engagement.next_follow_up_date);
}

export function isEngagementNoResponse(engagement) {
  return engagement.conversation_status === 'no_response';
}

export function engagementHasRiskFlag(engagement, risk) {
  if (!risk) return true;
  switch (risk) {
    case 'overdue_follow_up':
      return isEngagementFollowUpOverdue(engagement);
    case 'no_response':
      return isEngagementNoResponse(engagement);
    case 'visit_overdue':
      return isVisitOverdue(engagement);
    case 'deliverables_at_risk':
      return isDeliverablesAtRisk(engagement);
    case 'any':
      return (
        isEngagementFollowUpOverdue(engagement)
        || isEngagementNoResponse(engagement)
        || isVisitOverdue(engagement)
        || isDeliverablesAtRisk(engagement)
      );
    default:
      return true;
  }
}

export function riskFilterLabel(value) {
  return CAMPAIGN_RISK_FILTERS.find((r) => r.value === value)?.label ?? value;
}

export function collabReasonFilterLabel(value) {
  return COLLABORATION_REASONS.find((r) => r.value === value)?.label ?? value;
}

export function filterCampaignEngagements(engagements, filters) {
  let rows = engagements;
  if (filters.owner) {
    rows = rows.filter((r) => r.owner_name === filters.owner);
  }
  if (filters.collabReason) {
    rows = rows.filter((r) => r.primary_collaboration_reason === filters.collabReason);
  }
  if (filters.risk) {
    rows = rows.filter((r) => engagementHasRiskFlag(r, filters.risk));
  }
  return rows;
}
