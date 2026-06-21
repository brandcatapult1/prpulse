import { collaborationReasonLabel } from './collaborationReasons.js';
import { deliverableHasProof } from './deliverableLogging.js';
import { getCachedContact } from './contactsCache.js';
import { getDeliverablesForEngagement } from './deliverablesCache.js';
import { addDaysToIsoDate, todayIso } from './dates.js';

/** PRD Module 5 conversation statuses — one Kanban column per parent stage. */
export const CAMPAIGN_KANBAN_COLUMNS = [
  {
    id: 'not_contacted',
    label: 'Not contacted',
    statuses: ['not_contacted'],
  },
  {
    id: 'in_conversation',
    label: 'In conversation',
    statuses: ['in_conversation', 'no_response'],
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    statuses: ['scheduled'],
  },
  {
    id: 'dropped',
    label: 'Dropped',
    statuses: [
      'dropped_profile_rejected',
      'dropped_not_interested',
      'dropped_terms_disagreement',
      'dropped_didnt_deliver',
    ],
  },
  {
    id: 'awaiting_final',
    label: 'Awaited final deliverables',
    statuses: ['awaiting_final_deliverables'],
  },
  {
    id: 'complete',
    label: 'Collaboration complete',
    statuses: ['collaboration_complete'],
  },
];

export { collaborationReasonLabel };

export function columnIdForStatus(status) {
  const col = CAMPAIGN_KANBAN_COLUMNS.find((c) => c.statuses.includes(status));
  return col?.id ?? 'not_contacted';
}

export function droppedReasonLabel(status) {
  const labels = {
    dropped_profile_rejected: 'Profile rejected',
    dropped_not_interested: 'Not interested',
    dropped_terms_disagreement: 'Terms disagreement',
    dropped_didnt_deliver: "Didn't Deliver",
  };
  return labels[status] ?? 'Dropped';
}

/** @deprecated use droppedReasonLabel */
export function dropReasonLabel(status) {
  return droppedReasonLabel(status);
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
  const contact = engagement.contact_id ? getCachedContact(engagement.contact_id) : null;
  const ig = contact?.instagram_url ?? null;
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
  const dels = getDeliverablesForEngagement(engagementId);
  if (!dels.length) return null;
  const types = [...new Set(dels.map((d) => d.deliverable_type))];
  return types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ');
}

export function deliverableProgress(engagementId) {
  const dels = getDeliverablesForEngagement(engagementId);
  const total = dels.length;
  const posted = dels.filter((d) => d.status === 'posted').length;
  return { posted, total, pct: total ? Math.round((posted / total) * 100) : 0 };
}

/** Default SLA after visit completion before deliverables are all posted (days). */
export const DELIVERABLES_AT_RISK_SLA_DAYS = 7;

/** Unposted deliverables past SLA — sub-status only; card stays in Awaiting. */
export function isDeliverablesAtRisk(engagement) {
  if (engagement.conversation_status !== 'awaiting_final_deliverables') return false;
  const { posted, total } = deliverableProgress(engagement.id);
  if (total === 0 || posted === total) return false;
  const visitDate = engagement.visit_completed_date ?? engagement.visit_date;
  if (!visitDate) return false;
  const slaDeadline = addDaysToIsoDate(visitDate, DELIVERABLES_AT_RISK_SLA_DAYS);
  return todayIso() > slaDeadline;
}

export function isFollowUpOverdue(date) {
  if (!date) return false;
  return date < todayIso();
}

/** Scheduled visit past due with no outcome logged — sub-status only, never moves the card. */
export function isVisitOverdue(engagement) {
  if (engagement.conversation_status !== 'scheduled') return false;
  const visitDate = engagement.visit_date ?? engagement.next_follow_up_date;
  if (!visitDate) return false;
  return visitDate < todayIso();
}

export function regionLabel(engagement) {
  const contact = engagement.contact_id ? getCachedContact(engagement.contact_id) : null;
  return contact?.city ?? engagement.city ?? null;
}

/** Display-only commercial tag for board cards — not operationally gated. */
/** Display-only commercial tag for board cards — not operationally gated. */
export function commercialTypeLabel(engagement) {
  const explicit = engagement.collaboration_type?.toLowerCase();
  if (explicit === 'paid') return 'Paid';
  if (explicit === 'barter') return 'Barter';
  if (engagement.agreed_fee != null && Number(engagement.agreed_fee) > 0) {
    return 'Paid';
  }
  return null;
}

export function deliverableProofSummary(engagementId) {
  const dels = getDeliverablesForEngagement(engagementId).filter(
    (d) => d.status === 'posted' && deliverableHasProof(d),
  );
  return dels.map((d) => ({
    id: d.id,
    label: `${d.deliverable_type} ×${d.quantity}`,
    content_link: d.content_link,
    screenshots: d.screenshots ?? [],
  }));
}

export function groupEngagementsByColumn(engagements) {
  const groups = Object.fromEntries(CAMPAIGN_KANBAN_COLUMNS.map((c) => [c.id, []]));
  for (const row of engagements) {
    const colId = columnIdForStatus(row.conversation_status);
    groups[colId].push(row);
  }
  return groups;
}
