import { useEffect, useState } from 'react';
import { Modal } from '../ui/Primitives.jsx';
import { addDaysIso } from '../../lib/dates.js';
import { DELIVERABLE_TYPES } from '../../lib/deliverableTypes.js';

export function AddDeliverableModal({ open, initialType = 'reel', onClose, contactName, onAdd }) {
  const [type, setType] = useState(initialType);
  const [quantity, setQuantity] = useState(1);
  const [dueDate, setDueDate] = useState(() => addDaysIso(7));

  useEffect(() => {
    if (open) {
      setType(initialType);
      setQuantity(1);
      setDueDate(addDaysIso(7));
    }
  }, [open, initialType]);

  return (
    <Modal
      open={open}
      title={`Add deliverable · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onAdd({ type, quantity, dueDate })}
          >
            Add to engagement
          </button>
        </div>
      }
    >
      <p className="mb-4 text-2xs text-ink-secondary">
        Choose the content type you agreed on with this creator.
      </p>
      <div className="grid gap-3">
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Type</label>
          <select className="input-field" value={type} onChange={(e) => setType(e.target.value)}>
            {DELIVERABLE_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
            <option value="carousel">Carousel</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Quantity</label>
          <input
            type="number"
            className="input-field"
            value={quantity}
            min={1}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Due date</label>
          <input
            type="date"
            className="input-field"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
