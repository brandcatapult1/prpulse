import { todayIso } from './dates.js';
import { avgRatingFromScores } from './contactProfile.js';

/**
 * Build the engagement feedback record for a collaboration.
 *
 * Contact relationship rollups (avg_content_quality / avg_professionalism /
 * avg_timeliness / would_work_again_pct / total_collaborations) are derived
 * columns recomputed by the `fn_feedback_after` DB trigger - they are NOT
 * directly patchable on the contact, so we only write the feedback row here.
 */
export function buildContactFeedbackUpdate({
  contentQuality,
  professionalism,
  timeliness,
  wouldWorkAgain,
  note,
}) {
  return {
    engagementFeedback: {
      content_quality: contentQuality ?? null,
      professionalism: professionalism ?? null,
      timeliness: timeliness ?? null,
      would_work_again: wouldWorkAgain,
      internal_notes: note?.trim() || null,
      saved_at: todayIso(),
    },
  };
}

export function contactFeedbackToastMessage({
  contentQuality,
  professionalism,
  timeliness,
  wouldWorkAgain,
}) {
  const avg = avgRatingFromScores(contentQuality, professionalism, timeliness);
  const ratingPart = avg != null ? `★${avg.toFixed(1)}` : 'Feedback logged';
  return `${ratingPart} · ${wouldWorkAgain ? 'Would work again' : 'Would not repeat'}`;
}
