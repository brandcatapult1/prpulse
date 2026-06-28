import { todayIso } from './dates.js';

/**
 * Build the engagement feedback record for a collaboration.
 *
 * Contact relationship rollups (avg_content_quality / avg_professionalism /
 * avg_timeliness / would_work_again_pct / total_collaborations) are derived
 * columns recomputed by the `fn_feedback_after` DB trigger - they are NOT
 * directly patchable on the contact, so we only write the feedback row here.
 */
export function buildContactFeedbackUpdate({ rating, wouldWorkAgain, note }) {
  return {
    engagementFeedback: {
      content_quality: rating,
      professionalism: rating,
      timeliness: rating,
      would_work_again: wouldWorkAgain,
      internal_notes: note?.trim() || null,
      saved_at: todayIso(),
    },
  };
}

export function contactFeedbackToastMessage(rating, wouldWorkAgain) {
  return `Feedback logged — ★${rating} · ${wouldWorkAgain ? 'Would work again' : 'Would not repeat'}`;
}
