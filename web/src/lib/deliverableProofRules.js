/**
 * Type-aware deliverable proof rules — canonical client copy.
 * Mirror: server/src/lib/deliverableProofRules.mjs (keep in sync).
 *
 * reel, static_carousel_post => content_link required (screenshot optional)
 * story => >=1 screenshot required (link optional)
 * other => content_link OR screenshot
 */

const UI_TO_DB = {
  reel: 'reel',
  story: 'story',
  post: 'other',
  carousel: 'static_carousel_post',
  static_carousel_post: 'static_carousel_post',
  other: 'other',
};

const DB_TYPES = new Set(['reel', 'story', 'static_carousel_post', 'other']);

export function normalizeDeliverableDbType(type) {
  const key = String(type ?? '').toLowerCase();
  if (DB_TYPES.has(key)) return key;
  return UI_TO_DB[key] ?? 'other';
}

export function screenshotHasUrl(shot) {
  const url = shot?.url ?? shot?.file_path;
  return Boolean(String(url ?? '').trim());
}

function hasContentLink(contentLink, unitProofs) {
  if (String(contentLink ?? '').trim()) return true;
  return (unitProofs ?? []).some((unit) => String(unit?.content_link ?? '').trim());
}

function hasScreenshot(screenshots, unitProofs) {
  if ((screenshots ?? []).some(screenshotHasUrl)) return true;
  return (unitProofs ?? []).some((unit) => (unit?.screenshots ?? []).some(screenshotHasUrl));
}

/** Single source of truth — pass UI or DB deliverable_type. */
export function deliverableProofSatisfied(type, { content_link, screenshots, unit_proofs } = {}) {
  const dbType = normalizeDeliverableDbType(type);
  if (dbType === 'reel' || dbType === 'static_carousel_post') {
    return hasContentLink(content_link, unit_proofs);
  }
  if (dbType === 'story') {
    return hasScreenshot(screenshots, unit_proofs);
  }
  return hasContentLink(content_link, unit_proofs) || hasScreenshot(screenshots, unit_proofs);
}

export function deliverableProofRequirementMessage(type) {
  const dbType = normalizeDeliverableDbType(type);
  if (dbType === 'reel') {
    return 'Reel requires a post link before it can be marked Posted.';
  }
  if (dbType === 'static_carousel_post') {
    return 'Carousel requires a post link before it can be marked Posted.';
  }
  if (dbType === 'story') {
    return 'Story requires at least one screenshot before it can be marked Posted.';
  }
  return 'Post requires a content link or screenshot before it can be marked Posted.';
}

/** True when a posted deliverable meets its type proof rule. */
export function deliverablePostedProofSatisfied({
  deliverable_type,
  content_link,
  unit_proofs,
  screenshots,
  quantity,
  status,
}) {
  if (status !== 'posted') return true;
  const qty = Number(quantity) || 1;
  const unitProofs = Array.isArray(unit_proofs) ? unit_proofs : [];
  const dbType = normalizeDeliverableDbType(deliverable_type);

  if (unitProofs.length >= qty) {
    return unitProofs.slice(0, qty).every((unit) =>
      deliverableProofSatisfied(dbType, {
        content_link: unit.content_link,
        screenshots: unit.screenshots ?? [],
        unit_proofs: [],
      }),
    );
  }

  return deliverableProofSatisfied(dbType, {
    content_link,
    screenshots: screenshots ?? [],
    unit_proofs: unitProofs,
  });
}
