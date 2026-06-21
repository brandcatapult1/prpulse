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

export function getContactProfileExtras(contact) {
  if (!contact) return {};
  return {
    instagram_url: contact.instagram_url ?? null,
    notes: contact.notes ?? null,
  };
}

export function sortEngagements(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const da = a.last_contact_date ?? a.next_follow_up_date ?? '';
    const db = b.last_contact_date ?? b.next_follow_up_date ?? '';
    return db.localeCompare(da);
  });
}

export function getCollaborationHistory(engagements, { deliverablesByEngagement = {}, feedbackByEngagement = {} } = {}) {
  return sortEngagements(engagements)
    .filter((e) => e.conversation_status === 'collaboration_complete')
    .map((e) => {
      const dels = deliverablesByEngagement[e.id] ?? [];
      const posted = dels.filter((d) => d.status === 'posted').length;
      const feedback = feedbackByEngagement[e.id];
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

export function getActiveEngagementsForContact(engagements) {
  return sortEngagements(engagements).filter((e) => isActiveEngagement(e.conversation_status));
}

export function getFeedbackHistoryForContact(engagements, feedbackByEngagement = {}) {
  return sortEngagements(engagements)
    .map((e) => {
      const feedback = feedbackByEngagement[e.id];
      if (!feedback) return null;
      return {
        engagement_id: e.id,
        campaign_name: e.campaign_name,
        brand_name: e.brand_name,
        saved_at: feedback.updated_at ?? feedback.created_at,
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
  const dels = deliverablesByEngagement[engagementId] ?? [];
  return dels.filter((d) => d.status === 'posted').length;
}
