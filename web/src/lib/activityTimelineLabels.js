/** Display-only labels for activity timeline — mirrors server activityTimelineLabels.mjs. */

const CONVERSATION_STATUS_LABELS = {
  not_contacted: 'Not Contacted',
  in_conversation: 'In Conversation',
  scheduled: 'Scheduled',
  no_response: 'No Response',
  dropped_profile_rejected: 'Dropped – Profile Rejected',
  dropped_not_interested: 'Dropped – Not Interested',
  dropped_terms_disagreement: 'Dropped – Terms Disagreement',
  dropped: 'Dropped',
  awaiting_final_deliverables: 'Awaiting Final Deliverables',
  collaboration_complete: 'Collaboration Complete',
};

const DROP_REASON_LABELS = {
  didnt_deliver: "Didn't Deliver",
  profile_rejected: 'Profile rejected',
  dropped_profile_rejected: 'Profile rejected',
  dropped_not_interested: 'Not interested',
  dropped_terms_disagreement: 'Terms disagreement',
};

const STAGE_SLUG_LABELS = {
  not_contacted: 'Not Contacted',
  in_conversation: 'In Conversation',
  scheduled: 'Scheduled',
  no_response: 'No Response',
  awaiting_final_deliverables: 'Awaiting Final Deliverables',
};

const ACTION_LABELS = {
  stage_changed: 'Status changed',
  first_outreach: 'First outreach logged',
  contact_replied: 'Contact logged — replied',
  contact_no_reply: 'Contact logged — no reply',
  deliverable_posted: 'Deliverable posted',
  deliverable_demoted: 'Deliverable moved off Posted',
  reject: 'Profile rejected',
  reopen: 'Engagement reopened',
  didnt_deliver: "Didn't deliver",
  blacklist_set: 'Contact blacklisted',
  blacklist_cleared: 'Blacklist cleared',
  feedback_logged: 'Feedback logged',
  contact_tags_added: 'Contact tag added',
  visit_reminded: 'Visit reminder sent',
  status_change: 'Status changed',
};

function titleCaseSlug(value) {
  return String(value ?? '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function looksLikeEnumSlug(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]*$/i.test(value) && value.includes('_');
}

export function formatDropReason(reason) {
  if (!reason) return null;
  return DROP_REASON_LABELS[reason]
    ?? CONVERSATION_STATUS_LABELS[reason]
    ?? titleCaseSlug(reason);
}

export function formatStageSlug(slug) {
  if (!slug) return null;
  return STAGE_SLUG_LABELS[slug] ?? titleCaseSlug(slug);
}

export function formatEngagementStatus(status, { dropReason = null } = {}) {
  if (!status) return '—';
  if (status === 'dropped') {
    if (dropReason === 'didnt_deliver') return "Dropped – Didn't Deliver";
    if (dropReason) return `Dropped – ${formatDropReason(dropReason)}`;
    return CONVERSATION_STATUS_LABELS.dropped;
  }
  return CONVERSATION_STATUS_LABELS[status] ?? titleCaseSlug(status);
}

export function formatLegacyStatusChange(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const arrowMatch = trimmed.match(/^(.+?)\s*->\s*(.+)$/);
  if (!arrowMatch) {
    return formatEngagementStatus(trimmed);
  }
  return `${formatEngagementStatus(arrowMatch[1].trim())} → ${formatEngagementStatus(arrowMatch[2].trim())}`;
}

/** Normalize a timeline row for display (API rows and legacy fallbacks). */
export function formatTimelineEntry(entry) {
  if (!entry) return entry;

  const action = ACTION_LABELS[entry.action] ?? entry.action;
  let statusChange = entry.status_change ?? null;

  if (statusChange && (statusChange.includes('->') || looksLikeEnumSlug(statusChange))) {
    statusChange = formatLegacyStatusChange(statusChange);
  } else if (statusChange && statusChange.includes('_')) {
    statusChange = formatLegacyStatusChange(statusChange);
  }

  let notes = entry.notes ?? null;
  if (notes && looksLikeEnumSlug(notes)) {
    notes = formatDropReason(notes);
  }

  return {
    ...entry,
    action,
    status_change: statusChange,
    notes,
  };
}
