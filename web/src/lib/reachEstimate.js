/**
 * Reach is private to a post's owner, so for posts without approved insights we show an
 * estimate from public views. Views include repeat plays, so reach is lower than views;
 * 0.7 is a rule of thumb, not a measured figure — always label it as an estimate.
 */
export const REACH_PER_VIEW = 0.7;

/** Estimated reach for a metrics row that has views but no measured reach; otherwise null. */
export function estimateReach(metrics) {
  const reach = Number(metrics?.reach);
  if (Number.isFinite(reach) && reach > 0) return null;
  const views = Number(metrics?.views);
  if (!Number.isFinite(views) || views <= 0) return null;
  return Math.round(views * REACH_PER_VIEW);
}
