/** PRD Module 4 — campaign_type + date rules (schema: campaigns.campaign_type, start_date, end_date). */
export const CAMPAIGN_TYPES = [
  { value: 'monthly', label: 'Monthly recurring' },
  { value: 'project', label: 'One-time project' },
];

export function campaignTypeLabel(value) {
  return CAMPAIGN_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function targetCollaborationsLabel(campaignType) {
  return campaignType === 'monthly'
    ? 'Monthly target (collaborations per month)'
    : 'Target collaborations';
}

export function parseTargetCollaborationsInput(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseTermMonthsInput(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function validateCampaignTarget({ campaign_type, target_collaborations }) {
  const target = parseTargetCollaborationsInput(target_collaborations);
  if (target == null || target < 0) {
    return targetCollaborationsLabel(campaign_type) + ' is required';
  }
  return null;
}

export function validateTermMonths({ campaign_type, term_months }) {
  if (campaign_type !== 'monthly') return null;
  if (!parseTermMonthsInput(term_months)) {
    return 'Number of months is required (minimum 1)';
  }
  return null;
}

export function validateCampaignSchedule({ campaign_type, start_date, end_date }) {
  if (!campaign_type) return 'Select a campaign type';
  if (!start_date) return 'Start date is required';
  if (campaign_type === 'project') {
    if (!end_date) return 'End date is required for one-time projects';
    if (end_date < start_date) return 'End date must be on or after start date';
  }
  return null;
}

/** Payload dates for API — monthly campaigns store start only. */
export function campaignSchedulePayload({ campaign_type, start_date, end_date }) {
  return {
    campaign_type,
    start_date: start_date || null,
    end_date: campaign_type === 'project' ? (end_date || null) : null,
  };
}
