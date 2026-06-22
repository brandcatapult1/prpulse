import { buildNewDeliverable } from './deliverableTypes.js';
import { deliverablePostedUnits } from './deliverableLogging.js';

/** Sum asset units across deliverable rows (not row count). */
export function deliverableListUnitTotals(list) {
  const total = (list ?? []).reduce((sum, d) => sum + (d.quantity ?? 1), 0);
  const posted = (list ?? []).reduce((sum, d) => sum + deliverablePostedUnits(d), 0);
  return { posted, total };
}

/**
 * Add a deliverable type — increments quantity when the same type is already on the engagement.
 */
export function addDeliverableToList(list, type, engagementStatus) {
  const rows = list ?? [];
  const existing = rows.find(
    (d) => d.deliverable_type === type && d.status !== 'posted',
  );
  if (existing) {
    return rows.map((d) =>
      (d.id === existing.id
        ? { ...d, quantity: (d.quantity ?? 1) + 1 }
        : d),
    );
  }
  return [...rows, buildNewDeliverable({ type, engagementStatus })];
}

/** Remove one unit from a type, or drop the row when quantity is 1. */
export function removeDeliverableFromList(list, delId) {
  const rows = list ?? [];
  const item = rows.find((d) => d.id === delId);
  if (!item) return rows;

  if ((item.quantity ?? 1) > 1) {
    const nextQty = item.quantity - 1;
    const posted = Math.min(deliverablePostedUnits(item), nextQty);
    const unitProofs = (item.unit_proofs ?? []).slice(0, posted);
    return rows.map((d) => {
      if (d.id !== delId) return d;
      return {
        ...d,
        quantity: nextQty,
        posted_quantity: posted,
        unit_proofs: unitProofs,
        status: posted >= nextQty && posted > 0 ? 'posted' : 'pending',
      };
    });
  }

  return rows.filter((d) => d.id !== delId);
}
