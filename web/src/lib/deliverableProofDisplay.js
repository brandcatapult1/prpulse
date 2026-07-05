/**
 * Merge assets + unit_proofs for proof DISPLAY (same sources as deliverableProofSatisfied).
 * Mirror: server/src/lib/deliverableProofDisplay.mjs
 */

import { screenshotHasUrl } from './deliverableProofRules.js';

export function resolveDisplayContentLink(contentLink, unitProofs) {
  if (String(contentLink ?? '').trim()) return contentLink;
  for (const unit of unitProofs ?? []) {
    const link = String(unit?.content_link ?? '').trim();
    if (link) return link;
  }
  return null;
}

export function mergeScreenshotsForDisplay(assetScreenshots, unitProofs, quantity) {
  const qty = Number(quantity) || 1;
  const units = Array.isArray(unitProofs) ? unitProofs : [];
  const byUrl = new Map();

  function addShot(shot, { unitIndex } = {}) {
    if (!screenshotHasUrl(shot)) return;
    const url = String(shot.url ?? shot.file_path).trim();
    const key = url.toLowerCase();
    if (byUrl.has(key)) {
      const existing = byUrl.get(key);
      if (unitIndex != null && existing.unitIndex == null) {
        existing.unitIndex = unitIndex;
        existing.label = `Unit ${unitIndex} screenshot`;
      }
      return;
    }
    byUrl.set(key, {
      id: shot.id ?? `proof-${byUrl.size}`,
      label: shot.label ?? (unitIndex != null ? `Unit ${unitIndex} screenshot` : 'Screenshot'),
      url,
      ...(unitIndex != null && qty > 1 ? { unitIndex } : {}),
    });
  }

  for (const shot of assetScreenshots ?? []) {
    addShot(shot);
  }

  units.forEach((unit, index) => {
    const unitIndex = qty > 1 ? index + 1 : undefined;
    for (const shot of unit?.screenshots ?? []) {
      addShot(shot, { unitIndex });
    }
  });

  return [...byUrl.values()];
}

/** Apply merged proof display fields to a deliverable row (draft or saved). */
export function mergeDeliverableProofForDisplay(deliverable) {
  if (!deliverable) return deliverable;
  const unitProofs = Array.isArray(deliverable.unit_proofs) ? deliverable.unit_proofs : [];
  const assetShots = Array.isArray(deliverable.screenshots) ? deliverable.screenshots : [];
  return {
    ...deliverable,
    content_link: resolveDisplayContentLink(deliverable.content_link, unitProofs),
    screenshots: mergeScreenshotsForDisplay(assetShots, unitProofs, deliverable.quantity),
  };
}
