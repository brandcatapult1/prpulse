/**
 * Reach is private to a post's owner, so where Instagram's own figure isn't available it is worked out
 * from public numbers. These are rules of thumb, not measured values:
 *  - with views (reels / video): reach is about 70% of views (views include repeat plays)
 *  - without views (photo posts, carousels): about 4% of the people reached like or comment
 * Real reach (from the creator's approved access) always wins.
 */
export const REACH_PER_VIEW = 0.7;
export const INTERACTION_RATE = 0.04;

/** Worked-out reach for a metrics row that has no measured reach; otherwise null. */
export function estimateReach(metrics) {
  const reach = Number(metrics?.reach);
  if (Number.isFinite(reach) && reach > 0) return null;
  const views = Number(metrics?.views);
  if (Number.isFinite(views) && views > 0) return Math.round(views * REACH_PER_VIEW);
  const interactions = (Number(metrics?.likes) || 0) + (Number(metrics?.comments) || 0);
  if (interactions > 0) return Math.round(interactions / INTERACTION_RATE);
  return null;
}
