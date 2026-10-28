/**
 * Reach is private to a post's owner, so where Instagram's own figure isn't available it is worked out
 * from public numbers. These are rules of thumb, not measured values:
 *  - with views (reels / video): reach is about 70% of views (views include repeat plays)
 *  - without views (photo posts, carousels): reach = (likes + comments) / rate, where the share of people
 *    reached who like or comment falls as the creator gets bigger (by classification).
 * Real reach (from the creator's approved access) always wins.
 */
export const REACH_PER_VIEW = 0.7;

/** Share of people reached who like or comment, by creator classification. */
export const INTERACTION_RATE_BY_CLASS = {
  nano: 0.045,
  micro: 0.04,
  mid: 0.035,
  category_a: 0.03,
  macro: 0.025,
};
export const DEFAULT_INTERACTION_RATE = 0.04;

/** Worked-out reach for a metrics row that has no measured reach; otherwise null. */
export function estimateReach(metrics, classification) {
  const reach = Number(metrics?.reach);
  if (Number.isFinite(reach) && reach > 0) return null;
  const views = Number(metrics?.views);
  if (Number.isFinite(views) && views > 0) return Math.round(views * REACH_PER_VIEW);
  const interactions = (Number(metrics?.likes) || 0) + (Number(metrics?.comments) || 0);
  if (interactions <= 0) return null;
  const rate = INTERACTION_RATE_BY_CLASS[classification] ?? DEFAULT_INTERACTION_RATE;
  return Math.round(interactions / rate);
}
