import {
  deliverablePostedProofSatisfied,
  screenshotHasUrl,
} from './deliverableProofRules.mjs';

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function resolveDeliverablePostedDate(deliverable, unitProofs) {
  const fromRow = toIsoDate(deliverable.published_date);
  if (fromRow) return fromRow;
  for (let i = unitProofs.length - 1; i >= 0; i -= 1) {
    const unitDate = toIsoDate(unitProofs[i]?.published_date);
    if (unitDate) return unitDate;
  }
  return null;
}

export function deliverablePostedUnits(deliverable) {
  if (!deliverable) return 0;
  const posted = Number(deliverable.posted_quantity);
  if (Number.isFinite(posted)) return posted;
  return deliverable.status === 'posted' ? Number(deliverable.quantity) || 1 : 0;
}

export function deliverableTotalUnits(deliverable) {
  return Number(deliverable?.quantity) || 1;
}

export function isDeliverableFullyPosted(deliverable) {
  return (
    deliverablePostedUnits(deliverable) >= deliverableTotalUnits(deliverable)
    && deliverable?.status === 'posted'
  );
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

export function deliverableAwaitedUnits(deliverable) {
  const qty = deliverableTotalUnits(deliverable);
  const posted = deliverablePostedUnits(deliverable);
  if (deliverable.status === 'posted' && posted >= qty) return 0;
  return Math.max(0, qty - posted);
}

/** Mirror campaign board proof summary — links + Cloudinary screenshots. */
export function buildDeliverableProofItems(deliverables) {
  return (deliverables ?? [])
    .filter((d) => isDeliverableFullyPosted(d) && deliverableHasProof(d))
    .map((d) => {
      const unitProofs = Array.isArray(d.unit_proofs) ? d.unit_proofs : [];
      const postedDate = resolveDeliverablePostedDate(d, unitProofs);

      const links = [];
      const addLink = (link) => {
        const trimmed = link?.trim?.() ?? link;
        if (trimmed && !links.includes(trimmed)) links.push(trimmed);
      };
      addLink(d.content_link);
      unitProofs.forEach((u) => addLink(u.content_link));

      const screenshots = [];
      const seen = new Set();
      const addShot = (s, shotPostedDate) => {
        if (!s) return;
        const url = s.url ?? s.file_path ?? null;
        const key = url ?? s.id ?? s.label;
        if (!key || seen.has(key)) return;
        seen.add(key);
        screenshots.push({
          id: s.id ?? key,
          label: s.label ?? 'Screenshot',
          url,
          posted_date: shotPostedDate ?? postedDate,
        });
      };
      (d.screenshots ?? []).forEach((s) => addShot(s, postedDate));
      unitProofs.forEach((u) => {
        const unitDate = toIsoDate(u.published_date) ?? postedDate;
        (u.screenshots ?? []).forEach((s) => addShot(s, unitDate));
      });

      return {
        id: d.id,
        label: `${d.deliverable_type} ×${d.quantity}`,
        deliverable_type: d.deliverable_type,
        posted_date: postedDate,
        links,
        screenshots,
      };
    });
}

export { screenshotHasUrl };
