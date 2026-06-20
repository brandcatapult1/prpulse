import { todayIso } from './dates.js';

/**
 * Write relationship feedback to the contact profile (not pipeline state).
 * Also returns engagement feedback record for the collaboration.
 */
export function buildContactFeedbackUpdate(existingProfile, { rating, wouldWorkAgain, note }) {
  const prevCount = existingProfile?.total_collaborations ?? 0;
  const prevAvg = existingProfile?.avg_rating;
  const nextCount = prevCount + 1;
  const nextAvg =
    prevAvg == null
      ? rating
      : Math.round((((prevAvg * prevCount) + rating) / nextCount) * 10) / 10;

  const prevYes = existingProfile?.feedback_yes_count ?? 0;
  const prevTotal = existingProfile?.feedback_count ?? 0;
  const nextYes = prevYes + (wouldWorkAgain ? 1 : 0);
  const nextFeedbackTotal = prevTotal + 1;
  const wouldWorkAgainPct = Math.round((nextYes / nextFeedbackTotal) * 100);

  return {
    contactProfilePatch: {
      avg_rating: nextAvg,
      would_work_again_pct: wouldWorkAgainPct,
      feedback_count: nextFeedbackTotal,
      feedback_yes_count: nextYes,
      last_feedback_note: note?.trim() || null,
      last_feedback_at: todayIso(),
    },
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
