import { getCachedContact } from './contactsCache.js';
import { getDeliverablesForEngagement } from './deliverablesCache.js';
import { deliverablePostedUnits, deliverableTotalUnits } from './deliverableLogging.js';

const TERMINAL_STATUSES = new Set([
  'collaboration_complete',
  'dropped_profile_rejected',
  'dropped_not_interested',
  'dropped_terms_disagreement',
  'dropped',
]);

export function isTerminalEngagement(status) {
  return TERMINAL_STATUSES.has(status) || status?.startsWith('dropped_');
}

export function isActiveEngagement(status) {
  return status && !isTerminalEngagement(status);
}

// Postgres numeric columns (avg_*, would_work_again_pct) arrive as strings;
// coerce before doing math so we don't string-concat into NaN.
function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Average only populated scores; skip null/undefined. */
export function avgRatingFromScores(...values) {
  const scores = values.map(toNumberOrNull).filter((n) => n != null);
  if (scores.length === 0) return null;
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

function avgRatingFromSummary(row) {
  return avgRatingFromScores(
    row.avg_content_quality,
    row.avg_professionalism,
    row.avg_timeliness,
  );
}

export function getContactProfileExtras(contact) {
  if (!contact) return {};
  const cached = contact.id ? getCachedContact(contact.id) : null;
  const row = cached ?? contact;
  return {
    instagram_url: row.instagram_url ?? null,
    youtube_url: row.youtube_url ?? null,
    other_platform_links: row.other_platform_links ?? [],
    notes: row.notes ?? null,
    open_to_paid: row.open_to_paid ?? null,
    open_to_barter: row.open_to_barter ?? null,
    reel_rate: row.reel_rate ?? null,
    story_rate: row.story_rate ?? null,
    post_rate: row.post_rate ?? null,
    other_rate: row.other_rate ?? null,
    email: row.email ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
    primary_category: row.primary_category ?? null,
    total_collaborations: row.total_collaborations,
    last_collaboration_date: row.last_collaboration_date,
    avg_rating: avgRatingFromSummary(row),
    would_work_again_pct: toNumberOrNull(row.would_work_again_pct),
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
      const dels = deliverablesByEngagement[e.id] ?? getDeliverablesForEngagement(e.id);
      const posted = dels.reduce((sum, d) => sum + deliverablePostedUnits(d), 0);
      const total = dels.reduce((sum, d) => sum + deliverableTotalUnits(d), 0);
      const feedback = feedbackByEngagement[e.id];
      const avgRating = feedback
        ? avgRatingFromScores(
          feedback.content_quality,
          feedback.professionalism,
          feedback.timeliness,
        )
        : null;
      return {
        ...e,
        deliverables_completed: `${posted}/${total || '—'}`,
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
  const dels = deliverablesByEngagement[engagementId] ?? getDeliverablesForEngagement(engagementId);
  return dels.reduce((sum, d) => sum + deliverablePostedUnits(d), 0);
}
