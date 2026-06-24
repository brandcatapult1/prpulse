import { useEffect, useState } from 'react';
import { emptyVisitFields } from '../../lib/visitFields.js';

/**
 * Shared visit capture fields — date (required), time, notes; outlet shown read-only.
 */
export function VisitCaptureForm({
  outletName,
  value,
  initialValues,
  compact = false,
  onChange,
}) {
  const [internal, setInternal] = useState(value ?? initialValues ?? emptyVisitFields());
  const fields = value ?? internal;

  useEffect(() => {
    if (value == null && initialValues) setInternal(initialValues);
  }, [initialValues, value]);

  function update(patch) {
    const next = { ...fields, ...patch };
    if (value == null) setInternal(next);
    onChange?.(next);
  }

  const labelClass = compact
    ? 'block text-[11px] text-ink-secondary'
    : 'mb-1.5 block text-2xs font-medium text-ink-secondary';
  const inputClass = compact ? 'input-field mt-1 w-full text-2xs' : 'input-field';
  const notesClass = compact
    ? 'input-field mt-1 min-h-[56px] w-full resize-y py-2 text-2xs'
    : 'input-field min-h-[72px] py-2';

  return (
    <div className={compact ? 'space-y-2' : 'grid gap-3'}>
      <div>
        <label className={labelClass}>
          Visit date *
          <input
            type="date"
            className={inputClass}
            required
            value={fields.visitDate}
            onChange={(e) => update({ visitDate: e.target.value })}
          />
        </label>
      </div>
      <div>
        <label className={labelClass}>
          Time
          <input
            type="time"
            className={inputClass}
            value={fields.visitTime}
            onChange={(e) => update({ visitTime: e.target.value })}
          />
        </label>
      </div>
      {outletName && (
        <div>
          <span className={labelClass}>Outlet</span>
          <p className={`${compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-sm'} font-medium text-ink`}>
            {outletName}
          </p>
        </div>
      )}
      <div>
        <label className={labelClass}>
          Notes
          <textarea
            className={notesClass}
            placeholder="What to cover at the visit…"
            value={fields.visitNotes}
            onChange={(e) => update({ visitNotes: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
