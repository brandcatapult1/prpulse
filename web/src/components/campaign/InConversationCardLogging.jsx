import { useState } from 'react';
import { formatDate } from '../../lib/format.jsx';
import { logNoReplyAttempt, logRepliedContact } from '../../lib/contactLogging.js';
import {
  DROP_REASON_OPTIONS,
  STAGE,
  transitionStage,
} from '../../lib/engagementTransitions.js';

/**
 * In-conversation contact log flow (Replied / No reply → stage transitions).
 * Renders inline on kanban cards and dashboard task rows.
 */
export function InConversationCardLogging({
  engagement,
  onApply,
  onError,
  onScheduleRequest,
  alwaysShowActions = false,
  embedded = false,
  onComplete,
}) {
  const [step, setStep] = useState('idle');
  const [retryDate, setRetryDate] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const noReplyCount = engagement.no_reply_count ?? 0;

  function reset() {
    setStep('idle');
    setRetryDate('');
    setFollowUpDate('');
  }

  function repliedContactPatch() {
    return logRepliedContact().patch;
  }

  function apply(patch, message) {
    onApply(patch, message, Object.keys(patch));
    reset();
    onComplete?.();
  }

  function handleNoReplyConfirm() {
    if (!retryDate) return;
    const { patch, toastMessage } = logNoReplyAttempt(engagement, retryDate);
    onApply(patch, toastMessage, Object.keys(patch));
    setRetryDate('');
    setStep('idle');
    onComplete?.();
  }

  function handleRepliedStart() {
    setStep('replied_where');
  }

  function handleStillConfirm() {
    if (!followUpDate) return;
    const result = transitionStage(engagement, STAGE.IN_CONVERSATION, {
      nextFollowUpDate: followUpDate,
    });
    if (!result.ok) return;
    apply(
      { ...repliedContactPatch(), ...result.patch },
      `Logged — next follow-up ${formatDate(followUpDate)}`,
    );
  }

  function handleScheduleRequest() {
    if (onScheduleRequest) {
      onScheduleRequest();
      reset();
      onComplete?.();
      return;
    }
    onError?.('Open the campaign board to schedule this visit');
  }

  function handleDropped(reason) {
    const result = transitionStage(engagement, STAGE.DROPPED, { dropReason: reason });
    if (!result.ok) return;
    const label = DROP_REASON_OPTIONS.find((o) => o.value === reason)?.label ?? 'Dropped';
    apply(
      { ...repliedContactPatch(), ...result.patch },
      `Moved to Dropped — ${label}`,
    );
  }

  if (step === 'no_reply_date') {
    return (
      <LoggingPanel embedded={embedded}>
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

  if (step === 'replied_where') {
    return (
      <LoggingPanel embedded={embedded}>
        <p className="text-[11px] font-medium text-ink-secondary">Where are they now?</p>
        <button type="button" className="btn-secondary w-full !py-1 text-[11px]" onClick={() => setStep('replied_follow_up')}>
          Still in conversation
        </button>
        <button type="button" className="btn-secondary w-full !py-1 text-[11px]" onClick={handleScheduleRequest}>
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
      <LoggingPanel embedded={embedded}>
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
      <LoggingPanel embedded={embedded}>
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

  const actionRowClass = alwaysShowActions
    ? 'flex gap-1'
    : 'flex gap-1 max-md:flex md:hidden md:group-hover/card:flex';

  return (
    <LoggingPanel embedded={embedded}>
      <div className={actionRowClass}>
        <ActionButton label="Replied" onClick={handleRepliedStart} />
        <ActionButton label="No reply" variant="secondary" onClick={() => setStep('no_reply_date')} />
      </div>
      {noReplyCount >= 3 && (
        <p className="mt-2 text-[11px] text-health-amber">
          {noReplyCount} unanswered attempts — flagged as no response.
        </p>
      )}
    </LoggingPanel>
  );
}

function LoggingPanel({ children, embedded = false }) {
  return (
    <div
      className={embedded ? '' : 'mt-2 border-t border-line/80 pt-2'}
      onClick={(e) => e.stopPropagation()}
    >
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
el}
    </button>
  );
}
