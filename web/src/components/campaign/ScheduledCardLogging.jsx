import { useState } from 'react';
import { formatDate } from '../../lib/format.jsx';
import {
  buildVisitDoneTransition,
  visitDoneToastMessage,
  visitRescheduleToastMessage,
} from '../../lib/visitLogging.js';
import {
  DROP_REASON_OPTIONS,
  STAGE,
  transitionStage,
} from '../../lib/engagementTransitions.js';

/**
 * Inline logging for Scheduled column cards only — one disclosure level at a time.
 */
export function ScheduledCardLogging({ engagement, onApply, onError }) {
  const [step, setStep] = useState('idle');
  const [visitDate, setVisitDate] = useState('');

  function reset() {
    setStep('idle');
    setVisitDate('');
  }

  function apply(patch, message) {
    onApply(patch, message, Object.keys(patch));
    reset();
  }

  function handleVisitDone() {
    const result = buildVisitDoneTransition(engagement, transitionStage, STAGE);
    if (!result.ok) {
      onError?.(result.error ?? 'Could not log visit');
      return;
    }
    apply(result.patch, visitDoneToastMessage());
  }

  function handleRescheduleConfirm() {
    if (!visitDate) return;
    const result = transitionStage(engagement, STAGE.SCHEDULED, { visitDate });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not reschedule visit');
      return;
    }
    apply(result.patch, visitRescheduleToastMessage(visitDate));
  }

  function handleCancelled(reason) {
    const result = transitionStage(engagement, STAGE.DROPPED, { dropReason: reason });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not drop engagement');
      return;
    }
    const label = DROP_REASON_OPTIONS.find((o) => o.value === reason)?.label ?? 'Dropped';
    apply(result.patch, `Visit cancelled — ${label}`);
  }

  if (step === 'reschedule_date') {
    return (
      <LoggingPanel>
        <label className="block text-[11px] text-ink-secondary">
          New visit date
          <input
            type="date"
            className="input-field mt-1 w-full text-2xs"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            autoFocus
          />
        </label>
        <div className="flex gap-1">
          <button type="button" className="btn-secondary flex-1 !py-1 text-[11px]" onClick={reset}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1 !py-1 text-[11px]"
            disabled={!visitDate}
            onClick={handleRescheduleConfirm}
          >
            Reschedule
          </button>
        </div>
      </LoggingPanel>
    );
  }

  if (step === 'didnt_happen') {
    return (
      <LoggingPanel>
        <p className="text-[11px] font-medium text-ink-secondary">What happened?</p>
        <button
          type="button"
          className="btn-secondary w-full !py-1 text-[11px]"
          onClick={() => setStep('reschedule_date')}
        >
          Reschedule
        </button>
        <button
          type="button"
          className="btn-secondary w-full !py-1 text-[11px] text-health-red"
          onClick={() => setStep('cancelled_reason')}
        >
          Cancelled
        </button>
        <button type="button" className="text-[11px] text-ink-tertiary hover:text-ink" onClick={reset}>
          Back
        </button>
      </LoggingPanel>
    );
  }

  if (step === 'cancelled_reason') {
    return (
      <LoggingPanel>
        <p className="text-[11px] font-medium text-ink-secondary">Drop reason</p>
        {DROP_REASON_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="btn-ghost w-full justify-start !py-1 text-[11px] text-health-red"
            onClick={() => handleCancelled(o.value)}
          >
            {o.label}
          </button>
        ))}
        <button type="button" className="text-[11px] text-ink-tertiary hover:text-ink" onClick={() => setStep('didnt_happen')}>
          Back
        </button>
      </LoggingPanel>
    );
  }

  return (
    <LoggingPanel>
      <div className="flex gap-1 max-md:flex md:hidden md:group-hover/card:flex">
        <ActionButton label="Visit done" onClick={handleVisitDone} />
        <ActionButton label="Didn't happen" variant="secondary" onClick={() => setStep('didnt_happen')} />
      </div>
    </LoggingPanel>
  );
}

function LoggingPanel({ children }) {
  return (
    <div className="mt-2 border-t border-line/80 pt-2" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function ActionButton({ label, onClick, variant = 'primary' }) {
  return (
    <button
      type="button"
      className={`flex-1 rounded-md !py-1 text-[11px] font-medium ${
        variant === 'secondary'
          ? 'border border-line bg-white text-ink-secondary hover:bg-canvas'
          : 'bg-brand text-white hover:bg-brand-hover'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
