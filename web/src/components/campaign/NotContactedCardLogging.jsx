import { useState } from 'react';
import { todayIso } from '../../lib/dates.js';
import {
  firstOutreachToastMessage,
  rejectProfileToastMessage,
} from '../../lib/outreachLogging.js';
import {
  NOT_CONTACTED_DROP_REASON,
  STAGE,
  transitionStage,
} from '../../lib/engagementTransitions.js';

export function NotContactedCardLogging({ engagement, onApply, onError }) {
  const [step, setStep] = useState('idle');
  const [followUpDate, setFollowUpDate] = useState('');

  function reset() {
    setStep('idle');
    setFollowUpDate('');
  }

  function handleOutreachConfirm() {
    if (!followUpDate) return;
    const result = transitionStage(engagement, STAGE.IN_CONVERSATION, {
      nextFollowUpDate: followUpDate,
      logFirstOutreach: true,
      contactDate: todayIso(),
    });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not log outreach');
      return;
    }
    onApply(result.patch, firstOutreachToastMessage(followUpDate), Object.keys(result.patch));
    reset();
  }

  function handleReject() {
    const result = transitionStage(engagement, STAGE.DROPPED, {
      dropReason: NOT_CONTACTED_DROP_REASON.value,
      droppedFrom: 'not_contacted',
    });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not reject');
      return;
    }
    onApply(result.patch, rejectProfileToastMessage(), Object.keys(result.patch));
    reset();
  }

  if (step === 'outreach_date') {
    return (
      <LoggingPanel>
        <label className="block text-[11px] text-ink-secondary">
          Follow-up date
          <input
            type="date"
            className="input-field mt-1 w-full text-2xs"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
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
            disabled={!followUpDate}
            onClick={handleOutreachConfirm}
          >
            Log outreach
          </button>
        </div>
      </LoggingPanel>
    );
  }

  return (
    <LoggingPanel>
      <div className="flex gap-1 max-md:flex md:hidden md:group-hover/card:flex">
        <ActionButton label="Log first outreach" onClick={() => setStep('outreach_date')} />
        <ActionButton label="Reject" variant="secondary" onClick={handleReject} />
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
