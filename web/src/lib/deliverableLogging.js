import { formatDate } from './format.jsx';

export function unitProofHasEvidence(unit) {
  const link = unit?.content_link?.trim();
  const shots = unit?.screenshots?.length ?? 0;
  return Boolean(link) || shots > 0;
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
  const qty = deliverableTotalUnits(deliverable);
  const unitProofs = deliverable?.unit_proofs ?? [];

  if (unitProofs.length >= qty) {
    return unitProofs.slice(0, qty).every(unitProofHasEvidence);
  }

  if (deliverable?.status === 'posted' && unitProofs.length === 0) {
    const link = deliverable?.content_link?.trim();
    const shots = deliverable?.screenshots?.length ?? 0;
    return Boolean(link) || shots > 0;
  }

  return false;
}

export function deliverableProofEmphasis(type) {
  const normalized = (type ?? '').toLowerCase();
  if (normalized === 'story') {
    return {
      linkLabel: 'Post link (optional)',
      screenshotLabel: 'Screenshot — needed, stories expire',
      screenshotPrimary: true,
    };
  }
  return {
    linkLabel: 'Post link — needed',
    screenshotLabel: 'Screenshot (optional)',
    screenshotPrimary: false,
  };
}

export function canMarkDeliverablePosted({ contentLink, screenshots }) {
  const link = contentLink?.trim();
  const shots = screenshots?.length ?? 0;
  return Boolean(link) || shots > 0;
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
