import {
  MOCK_CONTACT_PROFILE,
  MOCK_DELIVERABLES_BY_ENGAGEMENT,
  MOCK_ENGAGEMENTS_BY_ID,
} from '../data/mock.js';
import {
  getDemoDeliverables,
  getDemoFeedback,
} from './demo.js';
import { getEngagementAdds, getContactProfileOverride, mergeEngagementRecord } from './demoStore.js';

const TERMINAL_STATUSES = new Set([
  'collaboration_complete',
  'dropped_no_response',
  'dropped_declined',
  'dropped_other',
]);

export function isTerminalEngagement(status) {
  return TERMINAL_STATUSES.has(status) || status?.startsWith('dropped_');
}

export function isActiveEngagement(status) {
  return status && !isTerminalEngagement(status);
}

export function getContactProfileExtras(contactId) {
  const base = MOCK_CONTACT_PROFILE[contactId] ?? {};
  const override = getContactProfileOverride(contactId);
  return override ? { ...base, ...override } : base;
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

export function getCollaborationHistory(contact) {
  return getEngagementsForContact(contact)
    .filter((e) => e.conversation_status === 'collaboration_complete')
    .map((e) => {
      const dels = getDemoDeliverables(e.id);
      const posted = dels.filter((d) => d.status === 'posted').length;
      const feedback = getDemoFeedback(e.id);
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

export function getActiveEngagementsForContact(contact) {
  return getEngagementsForContact(contact).filter((e) => isActiveEngagement(e.conversation_status));
}

export function getFeedbackHistoryForContact(contact) {
  return getEngagementsForContact(contact)
    .map((e) => {
      const feedback = getDemoFeedback(e.id);
      if (!feedback) return null;
      return {
        engagement_id: e.id,
        campaign_name: e.campaign_name,
        brand_name: e.brand_name,
        saved_at: feedback.saved_at,
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

export function countPostedDeliverables(engagementId) {
  const dels = MOCK_DELIVERABLES_BY_ENGAGEMENT[engagementId] ?? getDemoDeliverables(engagementId);
  return dels.filter((d) => d.status === 'posted').length;
}
