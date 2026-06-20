import { useState } from 'react';
import { formatDate } from '../../lib/format.jsx';
import { logNoReplyAttempt, logRepliedContact } from '../../lib/contactLogging.js';
import {
  DROP_REASON_OPTIONS,
  STAGE,
  transitionStage,
} from '../../lib/engagementTransitions.js';

/**
 * Inline logging for In conversation cards only — one disclosure level at a time.
 */
export function InConversationCardLogging({ engagement, onApply, onError }) {
  const [step, setStep] = useState('idle');
  const [retryDate, setRetryDate] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [visitDate, setVisitDate] = useState('');

  const noReplyCount = engagement.no_reply_count ?? 0;

  function reset() {
    setStep('idle');
    setRetryDate('');
    setFollowUpDate('');
    setVisitDate('');
  }

  function apply(patch, message) {
    onApply(patch, message, Object.keys(patch));
    reset();
  }

  function handleNoReplyConfirm() {
    if (!retryDate) return;
    const { patch, toastMessage } = logNoReplyAttempt(engagement, retryDate);
    onApply(patch, toastMessage, Object.keys(patch));
    setRetryDate('');
    setStep('idle');
  }

  function handleRepliedStart() {
    const { patch, toastMessage } = logRepliedContact();
    onApply(patch, toastMessage, Object.keys(patch));
    setStep('replied_where');
  }

  function handleStillConfirm() {
    if (!followUpDate) return;
    const result = transitionStage(engagement, STAGE.IN_CONVERSATION, {
      nextFollowUpDate: followUpDate,
    });
    if (!result.ok) return;
    apply(
      result.patch,
      `Logged — next follow-up ${formatDate(followUpDate)}`,
    );
  }

  function handleScheduledConfirm() {
    if (!visitDate) return;
    const result = transitionStage(engagement, STAGE.SCHEDULED, { visitDate });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not schedule visit');
      return;
    }
    apply(result.patch, `Scheduled — visit ${formatDate(visitDate)}`);
  }

  function handleDropped(reason) {
    const result = transitionStage(engagement, STAGE.DROPPED, { dropReason: reason });
    if (!result.ok) return;
    const label = DROP_REASON_OPTIONS.find((o) => o.value === reason)?.label ?? 'Dropped';
    apply(result.patch, `Moved to Dropped — ${label}`);
  }

  function handleNoResponseConfirm() {
    if (!followUpDate) return;
    const result = transitionStage(engagement, STAGE.NO_RESPONSE, {
      nextFollowUpDate: followUpDate,
    });
    if (!result.ok) return;
    apply(
      result.patch,
      `Moved to No Response — follow-up ${formatDate(followUpDate)}`,
    );
  }

  if (step === 'no_reply_date') {
    return (
      <LoggingPanel>
        <label className="block text-[11px] text-ink-secondary">
          Retry on
          <input
            type="date"
            className="input-field mt-1 w-full text-2xs"
            value={retryDate}
            onChange={(e) => setRetryDate(e.target.value)}
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
            disabled={!retryDate}
            onClick={handleNoReplyConfirm}
          >
            Log attempt
          </button>
        </div>
      </LoggingPanel>
    );
  }

  if (step === 'suggest_no_response_date') {
    return (
      <LoggingPanel>
        <label className="block text-[11px] text-ink-secondary">
          Follow-up if still no response
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
            onClick={handleNoResponseConfirm}
          >
            Move to No Response
          </button>
        </div>
      </LoggingPanel>
    );
  }

  if (step === 'replied_where') {
    return (
      <LoggingPanel>
        <p className="text-[11px] font-medium text-ink-secondary">Where are they now?</p>
        <button type="button" className="btn-secondary w-full !py-1 text-[11px]" onClick={() => setStep('replied_follow_up')}>
          Still in conversation
        </button>
        <button type="button" className="btn-secondary w-full !py-1 text-[11px]" onClick={() => setStep('replied_scheduled')}>
          Scheduled
        </button>
        <button
          type="button"
          className="btn-secondary w-full !py-1 text-[11px] text-health-red"
          onClick={() => setStep('replied_dropped')}
        >
          Dropped
        </button>
        <button type="button" className="text-[11px] text-ink-tertiary hover:text-ink" onClick={reset}>
          Cancel
        </button>
      </LoggingPanel>
    );
  }

  if (step === 'replied_dropped') {
    return (
      <LoggingPanel>
        <p className="text-[11px] font-medium text-ink-secondary">Drop reason</p>
        {DROP_REASON_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="btn-ghost w-full justify-start !py-1 text-[11px] text-health-red"
            onClick={() => handleDropped(o.value)}
          >
            {o.label}
          </button>
        ))}
        <button type="button" className="text-[11px] text-ink-tertiary hover:text-ink" onClick={() => setStep('replied_where')}>
          Back
        </button>
      </LoggingPanel>
    );
  }

  if (step === 'replied_follow_up') {
    return (
      <LoggingPanel>
        <label className="block text-[11px] text-ink-secondary">
          Next follow-up
          <input
            type="date"
            className="input-field mt-1 w-full text-2xs"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            autoFocus
          />
        </label>
        <div className="flex gap-1">
          <button type="button" className="btn-secondary flex-1 !py-1 text-[11px]" onClick={() => setStep('replied_where')}>
            Back
          </button>
          <button
            type="button"
            className="btn-primary flex-1 !py-1 text-[11px]"
            disabled={!followUpDate}
            onClick={handleStillConfirm}
          >
            Save
          </button>
        </div>
      </LoggingPanel>
    );
  }

  if (step === 'replied_scheduled') {
    return (
      <LoggingPanel>
        <label className="block text-[11px] text-ink-secondary">
          Visit date
          <input
            type="date"
            className="input-field mt-1 w-full text-2xs"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            autoFocus
          />
        </label>
        <div className="flex gap-1">
          <button type="button" className="btn-secondary flex-1 !py-1 text-[11px]" onClick={() => setStep('replied_where')}>
            Back
          </button>
          <button
            type="button"
            className="btn-primary flex-1 !py-1 text-[11px]"
            disabled={!visitDate}
            onClick={handleScheduledConfirm}
          >
            Schedule visit
          </button>
        </div>
      </LoggingPanel>
    );
  }

  return (
    <LoggingPanel>
      <div className="flex gap-1 max-md:flex md:hidden md:group-hover/card:flex">
        <ActionButton label="Replied" onClick={handleRepliedStart} />
        <ActionButton label="No reply" variant="secondary" onClick={() => setStep('no_reply_date')} />
      </div>
      {noReplyCount >= 3 && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-health-amber">
            {noReplyCount} unanswered attempts — consider No Response.
          </p>
          <button
            type="button"
            className="btn-secondary w-full !py-1 text-[11px]"
            onClick={() => setStep('suggest_no_response_date')}
          >
            Move to No Response…
          </button>
        </div>
      )}
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
