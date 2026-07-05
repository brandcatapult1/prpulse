/** Display-only labels for activity timeline — stored enum/slug values are never shown raw. */

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
  'Not Contacted': 'Not Contacted',
  'In Conversation': 'In Conversation',
  Scheduled: 'Scheduled',
  'No Response': 'No Response',
  'Awaiting Final Deliverables': 'Awaiting Final Deliverables',
};

const DELIVERABLE_TYPE_LABELS = {
  reel: 'Reel',
  story: 'Story',
  static_carousel_post: 'Static / carousel post',
  other: 'Other',
};

const LEGACY_ACTION_LABELS = {
  status_change: 'Status changed',
  contact_tags_added: 'Contact tag added',
};

function titleCaseSlug(value) {
  return String(value ?? '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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

export function formatDeliverableType(type) {
  if (!type) return null;
  return DELIVERABLE_TYPE_LABELS[type] ?? titleCaseSlug(type);
}

/**
 * @param {string | null | undefined} status conversation_status enum value
 * @param {{ dropReason?: string | null }} [opts]
 */
export function formatEngagementStatus(status, { dropReason = null } = {}) {
  if (!status) return '—';
  if (status === 'dropped') {
    if (dropReason === 'didnt_deliver') return "Dropped – Didn't Deliver";
    if (dropReason) return `Dropped – ${formatDropReason(dropReason)}`;
    return CONVERSATION_STATUS_LABELS.dropped;
  }
  return CONVERSATION_STATUS_LABELS[status] ?? titleCaseSlug(status);
}

function resolveDropReasonForStatus(status, reason) {
  if (status === 'dropped' && reason && !reason.startsWith('dropped_')) {
    return reason;
  }
  if (status?.startsWith('dropped_')) return null;
  return null;
}

export function formatStageTransition(fromStage, toStage, details = {}) {
  const toDropReason = resolveDropReasonForStatus(toStage, details.reason);
  const fromLabel = formatEngagementStatus(fromStage, {
    dropReason: details.fromDropReason ?? null,
  });
  const toLabel = formatEngagementStatus(toStage, { dropReason: toDropReason });
  return `${fromLabel} → ${toLabel}`;
}

/** Legacy DB trigger rows: `not_contacted -> dropped_profile_rejected`. */
export function formatLegacyStatusChange(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const arrowMatch = trimmed.match(/^(.+?)\s*->\s*(.+)$/);
  if (!arrowMatch) {
    return formatEngagementStatus(trimmed) ?? titleCaseSlug(trimmed);
  }
  const from = formatEngagementStatus(arrowMatch[1].trim());
  const to = formatEngagementStatus(arrowMatch[2].trim());
  return `${from} → ${to}`;
}

export function formatLegacyAction(action) {
  return LEGACY_ACTION_LABELS[action] ?? titleCaseSlug(action);
}

export function formatTimelineNotes(row, details, { statusChange } = {}) {
  if (details.note) return details.note;
  if (details.internal_notes) return details.internal_notes;

  if (row.action === 'stage_changed' && statusChange) {
    return null;
  }

  if (row.action === 'reject') {
    return null;
  }

  if (details.reason) {
    const formatted = formatDropReason(details.reason);
    if (!statusChange) return formatted;
  }

  if (details.droppedFrom) {
    return `Failed at: ${formatStageSlug(details.droppedFrom)}`;
  }

  if (details.priorDroppedFrom) {
    return `Previously at: ${formatStageSlug(details.priorDroppedFrom)}`;
  }

  if (row.action === 'contact_tags_added') {
    return 'Applied after collaboration completed';
  }

  if (row.action === 'deliverable_demoted' && details.message) {
    return details.message;
  }

  return null;
}
