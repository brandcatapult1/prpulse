import { getDemoContact, getDemoDeliverables } from './demo.js';
import { getContactProfileExtras } from './contactProfile.js';
import { todayIso } from './dates.js';

/** Board column layout — do not reorder without product sign-off. */
export const CAMPAIGN_KANBAN_COLUMNS = [
  {
    id: 'in_conversation',
    label: 'In Conversation',
    statuses: ['not_contacted', 'in_conversation'],
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    statuses: ['scheduled'],
  },
  {
    id: 'awaiting_final',
    label: 'Awaiting Final',
    statuses: ['awaiting_final_deliverables'],
  },
  {
    id: 'complete',
    label: 'Complete',
    statuses: ['collaboration_complete'],
  },
  {
    id: 'dropped',
    label: 'Dropped / No Response',
    statuses: [
      'no_response',
      'dropped_profile_rejected',
      'dropped_not_interested',
      'dropped_terms_disagreement',
    ],
  },
];

export function columnIdForStatus(status) {
  const col = CAMPAIGN_KANBAN_COLUMNS.find((c) => c.statuses.includes(status));
  return col?.id ?? 'in_conversation';
}

export function dropReasonLabel(status) {
  const labels = {
    no_response: 'No response',
    dropped_profile_rejected: 'Profile rejected',
    dropped_not_interested: 'Not interested',
    dropped_terms_disagreement: 'Terms disagreement',
  };
  return labels[status] ?? 'Dropped';
}

export function contactInitials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function contactHandle(engagement) {
  const contact = engagement.contact_id ? getDemoContact(engagement.contact_id) : null;
  const ig = contact ? getContactProfileExtras(contact.id).instagram_url : null;
  if (ig) {
    const match = ig.match(/instagram\.com\/([^/?]+)/i);
    if (match) return `@${match[1]}`;
  }
  const slug = (engagement.contact_name ?? 'creator')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  return `@${slug || 'creator'}`;
}

export function contentTypeSummary(engagementId) {
  const dels = getDemoDeliverables(engagementId);
  if (!dels.length) return '—';
  const types = [...new Set(dels.map((d) => d.deliverable_type))];
  return types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ');
}

export function deliverableProgress(engagementId) {
  const dels = getDemoDeliverables(engagementId);
  const total = dels.length;
  const posted = dels.filter((d) => d.status === 'posted').length;
  return { posted, total, pct: total ? Math.round((posted / total) * 100) : 0 };
}

export function isFollowUpOverdue(date) {
  if (!date) return false;
  return date < todayIso();
}

export function regionLabel(engagement) {
  const contact = engagement.contact_id ? getDemoContact(engagement.contact_id) : null;
  return contact?.city ?? '—';
}

export function groupEngagementsByColumn(engagements) {
  const groups = Object.fromEntries(CAMPAIGN_KANBAN_COLUMNS.map((c) => [c.id, []]));
  for (const row of engagements) {
    const colId = columnIdForStatus(row.conversation_status);
    groups[colId].push(row);
  }
  return groups;
}
