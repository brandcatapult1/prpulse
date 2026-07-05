import { buildNewDeliverable } from './deliverableTypes.js';
import { deliverablePostedUnits, deliverableTotalUnits } from './deliverableLogging.js';

/** Sum asset units across deliverable rows (not row count). */
export function deliverableListUnitTotals(list) {
  return (list ?? []).reduce(
    (acc, d) => ({
      total: acc.total + deliverableTotalUnits(d),
      posted: acc.posted + deliverablePostedUnits(d),
    }),
    { posted: 0, total: 0 },
  );
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

  const itemQty = deliverableTotalUnits(item);
  if (itemQty > 1) {
    const nextQty = itemQty - 1;
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
