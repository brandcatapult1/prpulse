import { DELIVERABLE_TYPES, deliverableTypeLabel } from '../../lib/deliverableTypes.js';

/** One-tap chips to add a deliverable — no modal, qty defaults to 1. */
export function DeliverableTypeButtons({ onAdd, disabled, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {DELIVERABLE_TYPES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className="btn-secondary !py-1 text-[11px]"
          disabled={disabled}
          onClick={() => onAdd(value)}
        >
          + {label}
        </button>
      ))}
    </div>
  );
}

export { deliverableTypeLabel };
