import { deliverableTotalUnits } from './deliverableLogging.js';

/**
 * Map deliverable type → contact indicative rate (coerce Postgres numerics to Number).
 * Matches server deliverableTypes: UI post → DB other; carousel → static_carousel_post.
 */
export function indicativeRateForDeliverableType(deliverableType, rates = {}) {
  const type = String(deliverableType ?? '').toLowerCase();
  if (type === 'reel') return Number(rates.reel_rate) || 0;
  if (type === 'story') return Number(rates.story_rate) || 0;
  if (type === 'carousel' || type === 'static_carousel_post') return Number(rates.post_rate) || 0;
  return Number(rates.other_rate) || 0;
}

/**
 * One-time pre-fill when switching to Paid: sum (indicative rate × quantity) per planned deliverable.
 * Returns null when no deliverables are planned (caller should leave agreed_fee blank).
 */
export function estimateAgreedFeeFromIndicativeRates(deliverables, rates = {}) {
  const list = deliverables ?? [];
  if (list.length === 0) return null;
  return list.reduce((sum, d) => {
    const qty = deliverableTotalUnits(d);
    const rate = indicativeRateForDeliverableType(d.deliverable_type, rates);
    return sum + rate * qty;
  }, 0);
}
