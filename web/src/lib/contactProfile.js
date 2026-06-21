import { MOCK_CONTACT_PROFILE, MOCK_ENGAGEMENTS_BY_ID } from '../data/mock.js';
import { getDemoDeliverables, getDemoFeedback } from './demo.js';
import { getEngagementAdds, getContactProfileOverride, mergeEngagementRecord } from './demoStore.js';
import { getCachedContact } from './contactsCache.js';
import { getDeliverablesForEngagement } from './deliverablesCache.js';

const TERMINAL_STATUSES = new Set([
  'collaboration_complete',
  'dropped_profile_rejected',
  'dropped_not_interested',
  'dropped_terms_disagreement',
  'dropped_didnt_deliver',
]);

export function isTerminalEngagement(status) {
  return TERMINAL_STATUSES.has(status) || status?.startsWith('dropped_');
}

export function isActiveEngagement(status) {
  return status && !isTerminalEngagement(status);
}

function resolveContactId(contactOrId) {
  if (contactOrId == null) return null;
  if (typeof contactOrId === 'object') return contactOrId.id ?? null;
  return String(contactOrId);
}

/** Profile extras — accepts a contact row or contact id (legacy call sites). */
export function getContactProfileExtras(contactOrId) {
  const id = resolveContactId(contactOrId);
  const cached = id ? getCachedContact(id) : null;
  const base = id ? (MOCK_CONTACT_PROFILE[id] ?? {}) : {};
  const override = id ? getContactProfileOverride(id) : null;
  const fromRecord =
    typeof contactOrId === 'object' && contactOrId !== null
      ? {
          instagram_url: contactOrId.instagram_url ?? null,
          youtube_url: contactOrId.youtube_url ?? null,
          notes: contactOrId.notes ?? null,
          open_to_paid: contactOrId.open_to_paid ?? null,
          open_to_barter: contactOrId.open_to_barter ?? null,
        }
      : {};
  const fromCache = cached
    ? {
        instagram_url: cached.instagram_url ?? null,
        youtube_url: cached.youtube_url ?? null,
        notes: cached.notes ?? null,
        open_to_paid: cached.open_to_paid ?? null,
        open_to_barter: cached.open_to_barter ?? null,
      }
    : {};
  return { ...base, ...fromCache, ...fromRecord, ...(override ?? {}) };
}

export function getEngagementsForContact(contact) {
  if (!contact) return [];

  const fromMock = Object.values(MOCK_ENGAGEMENTS_BY_ID).filter(
    (e) =>
      e.contact_id === contact.id
      || (contact.full_name && e.contact_name === contact.full_name),
  );
  const fromAdds = getEngagementAdds().filter((e) => e.contact_id === contact.id);
  const byId = new Map();
  for (const row of [...fromMock, ...fromAdds]) {
    byId.set(row.id, mergeEngagementRecord(row));
  }
  return [...byId.values()].sort((a, b) => {
    const da = a.last_contact_date ?? a.next_follow_up_date ?? '';
    const db = b.last_contact_date ?? b.next_follow_up_date ?? '';
    return db.localeCompare(da);
  });
}

export function sortEngagements(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const da = a.last_contact_date ?? a.next_follow_up_date ?? '';
    const db = b.last_contact_date ?? b.next_follow_up_date ?? '';
    return db.localeCompare(da);
  });
}

function deliverablesForEngagement(engagementId, deliverablesByEngagement = {}) {
  if (deliverablesByEngagement[engagementId]?.length) {
    return deliverablesByEngagement[engagementId];
  }
  const cached = getDeliverablesForEngagement(engagementId);
  if (cached.length) return cached;
  return getDemoDeliverables(engagementId);
}

function feedbackForEngagement(engagementId, feedbackByEngagement = {}) {
  return feedbackByEngagement[engagementId] ?? getDemoFeedback(engagementId);
}

export function getCollaborationHistory(contactOrEngagements, options = {}) {
  const { deliverablesByEngagement = {}, feedbackByEngagement = {} } = options;
  const engagements = Array.isArray(contactOrEngagements)
    ? contactOrEngagements
    : getEngagementsForContact(contactOrEngagements);

  return sortEngagements(engagements)
    .filter((e) => e.conversation_status === 'collaboration_complete')
    .map((e) => {
      const dels = deliverablesForEngagement(e.id, deliverablesByEngagement);
      const posted = dels.filter((d) => d.status === 'posted').length;
      const feedback = feedbackForEngagement(e.id, feedbackByEngagement);
      const avgRating = feedback
        ? ((feedback.content_quality ?? 0) + (feedback.professionalism ?? 0) + (feedback.timeliness ?? 0)) / 3
        : null;
      return {
        ...e,
        deliverables_completed: `${posted}/${dels.length || '—'}`,
        avg_rating: avgRating,
        would_work_again: feedback?.would_work_again,
        internal_notes: feedback?.internal_notes ?? e.notes,
      };
    });
}

export function getActiveEngagementsForContact(contactOrEngagements) {
  const engagements = Array.isArray(contactOrEngagements)
    ? contactOrEngagements
    : getEngagementsForContact(contactOrEngagements);
  return sortEngagements(engagements).filter((e) => isActiveEngagement(e.conversation_status));
}

export function getFeedbackHistoryForContact(contactOrEngagements, feedbackByEngagement = {}) {
  const engagements = Array.isArray(contactOrEngagements)
    ? contactOrEngagements
    : getEngagementsForContact(contactOrEngagements);

  return sortEngagements(engagements)
    .map((e) => {
      const feedback = feedbackForEngagement(e.id, feedbackByEngagement);
      if (!feedback) return null;
      return {
        engagement_id: e.id,
        campaign_name: e.campaign_name,
        brand_name: e.brand_name,
        saved_at: feedback.updated_at ?? feedback.created_at ?? feedback.saved_at,
        content_quality: feedback.content_quality,
        professionalism: feedback.professionalism,
        timeliness: feedback.timeliness,
        would_work_again: feedback.would_work_again,
        internal_notes: feedback.internal_notes,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.saved_at ?? '').localeCompare(a.saved_at ?? ''));
}

export function countPostedDeliverables(engagementId, deliverablesByEngagement = {}) {
  const dels = deliverablesForEngagement(engagementId, deliverablesByEngagement);
  return dels.filter((d) => d.status === 'posted').length;
}
