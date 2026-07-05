import { formatDate } from './format.jsx';
import {
  deliverablePostedProofSatisfied,
  deliverableProofRequirementMessage,
  deliverableProofSatisfied,
  screenshotHasUrl,
} from './deliverableProofRules.js';

export { screenshotHasUrl, deliverableProofRequirementMessage };

/** Short row label for save/error feedback, e.g. "reel ×1". */
export function deliverableRowLabel(deliverable) {
  const qty = Number(deliverable?.quantity) || 1;
  const type = deliverable?.deliverable_type ?? 'Deliverable';
  return `${type} ×${qty}`;
}

/** Name the deliverable and attach the proof requirement (client or server message). */
export function deliverableProofRejectMessage(deliverable, serverMessage) {
  const reason = serverMessage || deliverableProofRequirementMessage(deliverable?.deliverable_type);
  return `${deliverableRowLabel(deliverable)}: ${reason}`;
}

/** How many units on this row have been logged with proof. */
export function deliverablePostedUnits(deliverable) {
  if (!deliverable) return 0;
  if (typeof deliverable.posted_quantity === 'number') {
    return deliverable.posted_quantity;
  }
  return deliverable.status === 'posted' ? (deliverable.quantity ?? 1) : 0;
}

export function deliverableTotalUnits(deliverable) {
  return deliverable?.quantity ?? 1;
}

export function isDeliverableFullyPosted(deliverable) {
  return deliverablePostedUnits(deliverable) >= deliverableTotalUnits(deliverable)
    && deliverable?.status === 'posted';
}

export function deliverableHasProof(deliverable) {
  if (!deliverable) return false;
  return deliverablePostedProofSatisfied({
    deliverable_type: deliverable.deliverable_type,
    content_link: deliverable.content_link,
    unit_proofs: deliverable.unit_proofs,
    screenshots: deliverable.screenshots,
    quantity: deliverable.quantity,
    status: deliverable.status,
  });
}

export function deliverableProofEmphasis(type) {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized === 'story') {
    return {
      linkLabel: 'Post link (optional)',
      screenshotLabel: 'Screenshot — required',
      screenshotPrimary: true,
    };
  }
  if (normalized === 'reel' || normalized === 'carousel' || normalized === 'static_carousel_post') {
    return {
      linkLabel: 'Post link — required',
      screenshotLabel: 'Screenshot (optional)',
      screenshotPrimary: false,
    };
  }
  return {
    linkLabel: 'Post link or screenshot — one required',
    screenshotLabel: 'Screenshot (optional)',
    screenshotPrimary: false,
  };
}

export function canMarkDeliverablePosted({ contentLink, screenshots, deliverableType }) {
  return deliverableProofSatisfied(deliverableType, {
    content_link: contentLink,
    screenshots: screenshots ?? [],
    unit_proofs: [],
  });
}

/** Log one unit; marks the row posted when all units are logged. */
export function buildUnitPostedPatch(deliverable, { contentLink, screenshots, publishedDate }) {
  const quantity = deliverableTotalUnits(deliverable);
  const unitProof = {
    content_link: contentLink?.trim() || null,
    screenshots: screenshots ?? [],
    published_date: publishedDate,
  };
  const unit_proofs = [...(deliverable.unit_proofs ?? []), unitProof];
  const posted_quantity = deliverablePostedUnits(deliverable) + 1;
  const isComplete = posted_quantity >= quantity;

  const patch = {
    ...deliverable,
    unit_proofs,
    posted_quantity,
    status: isComplete ? 'posted' : 'pending',
    published_date: isComplete ? publishedDate : (deliverable.published_date ?? null),
    is_overdue: false,
  };

  if (isComplete && quantity === 1) {
    patch.content_link = unitProof.content_link;
    patch.screenshots = unitProof.screenshots;
  } else if (isComplete) {
    const lastWithLink = [...unit_proofs].reverse().find((u) => u.content_link?.trim());
    patch.content_link = lastWithLink?.content_link ?? null;
    patch.screenshots = unit_proofs.flatMap((u) => u.screenshots ?? []);
  }

  return patch;
}

/** @deprecated use buildUnitPostedPatch */
export function buildPostedDeliverablePatch(deliverable, proof) {
  return buildUnitPostedPatch(deliverable, proof);
}

export function markDeliverablePostedToastMessage(deliverable) {
  const qty = deliverableTotalUnits(deliverable);
  const posted = deliverablePostedUnits(deliverable);
  const label = `${deliverable.deliverable_type} ×${qty}`;
  const unitProofs = deliverable.unit_proofs ?? [];
  const publishedDate = unitProofs[unitProofs.length - 1]?.published_date
    ?? deliverable.published_date;
  if (qty > 1 && posted < qty) {
    return `Logged ${label} — unit ${posted} of ${qty}`;
  }
  return `Logged ${label} — posted ${formatDate(publishedDate)}`;
}
