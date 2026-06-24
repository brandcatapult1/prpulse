import { useState } from 'react';
import { InlineCardConfirm } from '../ui/InlineCardConfirm.jsx';
import { isContactBlacklisted } from '../../lib/contactsHelpers.js';
import { canReopenDropped, droppedFromLabel, isDidntDeliverDrop } from '../../lib/dropTransitions.js';
import { reopenToastMessage } from '../../lib/outreachLogging.js';
import { resolveDroppedFrom, STAGE, transitionStage } from '../../lib/engagementTransitions.js';

export function DroppedCardLogging({ engagement, userRole, onApplyReopen, onError }) {
  const [step, setStep] = useState('idle');
  const [clearBlacklist, setClearBlacklist] = useState(false);

  const droppedFrom = resolveDroppedFrom(engagement);
  const blacklisted = engagement.contact_id && isContactBlacklisted(engagement.contact_id);
  const isDidntDeliver = isDidntDeliverDrop(engagement);
  const canReopen = canReopenDropped(userRole, engagement);
  const needsBlacklistPrompt = isDidntDeliver && blacklisted;

  function handleReopenConfirm() {
    const result = transitionStage(engagement, STAGE.REOPEN, {
      role: userRole,
      clearBlacklist: needsBlacklistPrompt && clearBlacklist,
    });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not reopen');
      setStep('idle');
      return;
    }
    onApplyReopen({
      engagementPatch: result.patch,
      clearBlacklist: result.clearBlacklist && needsBlacklistPrompt && clearBlacklist,
      message: reopenToastMessage(droppedFromLabel(droppedFrom)),
    });
    setStep('idle');
    setClearBlacklist(false);
  }

  if (step === 'confirm_reopen') {
    return (
      <LoggingPanel>
        <InlineCardConfirm
          title="Reopen engagement?"
          body={`Return to ${droppedFromLabel(droppedFrom)}?`}
          confirmLabel="Reopen"
          onConfirm={handleReopenConfirm}
          onCancel={() => {
            setStep('idle');
            setClearBlacklist(false);
          }}
        >
          {needsBlacklistPrompt && (
            <label className="flex items-start gap-2 text-[11px] text-ink-secondary">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={clearBlacklist}
                onChange={(e) => setClearBlacklist(e.target.checked)}
              />
              <span>Clear blacklist on this creator&apos;s contact record</span>
            </label>
          )}
        </InlineCardConfirm>
      </LoggingPanel>
    );
  }

  return (
    <LoggingPanel>
      <div className="max-md:block md:hidden md:group-hover/card:block">
        {isDidntDeliver && droppedFrom && (
          <p className="mb-2 text-[11px] text-ink-secondary">
            Failed at: {droppedFromLabel(droppedFrom)}
          </p>
        )}
        {blacklisted && (
          <p className="mb-2 text-[11px] font-medium text-health-red">Blacklisted</p>
        )}
        {canReopen ? (
          <button
            type="button"
            className="btn-secondary w-full !py-1 text-[11px]"
            onClick={() => setStep('confirm_reopen')}
          >
            Reopen
          </button>
        ) : (
          <p className="text-[11px] text-ink-tertiary">Reopen requires Senior Manager or Admin</p>
        )}
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
