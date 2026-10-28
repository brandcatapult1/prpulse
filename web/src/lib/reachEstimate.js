/**
 * Reach is private to a post's owner, so where Instagram's own figure isn't available it is worked out
 * from public numbers. These are rules of thumb, not measured values:
 *  - with views (reels / video): reach is about 70% of views (views include repeat plays)
 *  - without views (photo posts, carousels): reach = (likes + comments) / rate, where the share of people
 *    reached who like or comment falls as the creator gets bigger (by classification).
 * Sanity limits (followers change, so they are generous and only used when the count is known):
 *  - reach is never below likes + comments, and never above views
 *  - reach is capped at a multiple of the creator's followers: posts 5x, reels 10x
 *  - viral override: the cap is lifted when the post's own numbers show it travelled beyond followers
 *    (posts: likes + comments of at least 10% of followers; reels: views of at least 3x followers)
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

export const POST_FOLLOWER_CAP = 5;
export const REEL_FOLLOWER_CAP = 10;
export const VIRAL_POST_INTERACTIONS = 0.1; // of followers
export const VIRAL_REEL_VIEWS = 3; // x followers
// Below this the follower count is too small to be a useful ceiling (new or test accounts).
const MIN_FOLLOWERS_FOR_CAP = 1000;

/** Worked-out reach for a metrics row that has no measured reach; otherwise null. */
export function estimateReach(metrics, classification, followers = null) {
  const reach = Number(metrics?.reach);
  if (Number.isFinite(reach) && reach > 0) return null;
  const views = Number(metrics?.views);
  const interactions = (Number(metrics?.likes) || 0) + (Number(metrics?.comments) || 0);
  const hasViews = Number.isFinite(views) && views > 0;
  if (!hasViews && interactions <= 0) return null;

  let est = hasViews
    ? views * REACH_PER_VIEW
    : interactions / (INTERACTION_RATE_BY_CLASS[classification] ?? DEFAULT_INTERACTION_RATE);

  const f = Number(followers);
  if (Number.isFinite(f) && f >= MIN_FOLLOWERS_FOR_CAP) {
    const viral = hasViews ? views >= f * VIRAL_REEL_VIEWS : interactions >= f * VIRAL_POST_INTERACTIONS;
    if (!viral) est = Math.min(est, f * (hasViews ? REEL_FOLLOWER_CAP : POST_FOLLOWER_CAP));
  }
  if (hasViews) est = Math.min(est, views);
  est = Math.max(est, interactions);
  return Math.round(est);
}
