import { useMemo, useState } from 'react';
import { LogDeliverableDrawer } from '../deliverables/LogDeliverableDrawer.jsx';
import { InlineCardConfirm } from '../ui/InlineCardConfirm.jsx';
import { getDeliverablesForEngagement } from '../../lib/deliverablesCache.js';
import { canMarkDidntDeliver } from '../../lib/campaignPermissions.js';
import { deliverableProgress } from '../../lib/campaignKanban.js';
import {
  deliverableHasProof,
  markDeliverablePostedToastMessage,
  deliverablePostedUnits,
  deliverableTotalUnits,
  isDeliverableFullyPosted,
} from '../../lib/deliverableLogging.js';
import {
  DIDNT_DELIVER_DROP_REASON,
  STAGE,
  transitionStage,
} from '../../lib/engagementTransitions.js';

function deliverableLabel(d) {
  const qty = deliverableTotalUnits(d);
  const posted = deliverablePostedUnits(d);
  const base = `${d.deliverable_type} ×${qty}`;
  if (qty > 1 && posted > 0 && !isDeliverableFullyPosted(d)) {
    return `${base} · ${posted}/${qty} posted`;
  }
  return base;
}

/**
 * Inline deliverable tracking for Awaiting Final Deliverables cards.
 */
export function AwaitingDeliverablesCardLogging({
  engagement,
  userRole,
  boardRevision,
  onApplyEngagement,
  onApplyDeliverables,
  onApplyDidntDeliver,
  onError,
}) {
  const [loggingDeliverableId, setLoggingDeliverableId] = useState(null);
  const [step, setStep] = useState('idle');
  const [blacklistOnDrop, setBlacklistOnDrop] = useState(false);

  const deliverables = useMemo(
    () => getDeliverablesForEngagement(engagement.id),
    [engagement.id, boardRevision],
  );

  const { posted, total, pct } = deliverableProgress(engagement.id);
  const allPostedWithProof =
    total > 0
    && deliverables.every((d) => isDeliverableFullyPosted(d) && deliverableHasProof(d));
  const showDidntDeliver = canMarkDidntDeliver(userRole);
  const loggingDeliverable = deliverables.find((d) => d.id === loggingDeliverableId) ?? null;

  function handleLogDeliverable(nextDeliverable) {
    const nextList = deliverables.map((d) => (d.id === nextDeliverable.id ? nextDeliverable : d));
    onApplyDeliverables(nextList, markDeliverablePostedToastMessage(nextDeliverable));
  }

  function handleMarkComplete() {
    const result = transitionStage(engagement, STAGE.COMPLETE);
    if (!result.ok) {
      onError?.(result.error ?? 'Could not mark complete');
      setStep('idle');
      return;
    }
    onApplyEngagement(result.patch, 'Collaboration marked complete', Object.keys(result.patch));
    setStep('idle');
  }

  function handleDidntDeliver() {
    const result = transitionStage(engagement, STAGE.DROPPED, {
      dropReason: DIDNT_DELIVER_DROP_REASON.value,
      droppedFrom: 'awaiting_final_deliverables',
    });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not mark didn\'t deliver');
      setStep('idle');
      return;
    }
    onApplyDidntDeliver({
      engagementPatch: result.patch,
      blacklist: blacklistOnDrop,
      message: blacklistOnDrop
        ? "Didn't Deliver — creator blacklisted"
        : "Didn't Deliver — moved to Dropped",
    });
    setStep('idle');
    setBlacklistOnDrop(false);
  }

  if (step === 'confirm_complete') {
    return (
      <LoggingPanel>
        <InlineCardConfirm
          title="Mark collaboration complete?"
          body="All deliverables are posted with proof on file."
          confirmLabel="Mark complete"
          onConfirm={handleMarkComplete}
          onCancel={() => setStep('idle')}
        />
      </LoggingPanel>
    );
  }

  if (step === 'confirm_didnt_deliver') {
    return (
      <LoggingPanel>
        <InlineCardConfirm
          title="Mark didn't deliver?"
          body="Moves this creator to Dropped with reason Didn't Deliver."
          confirmLabel="Confirm"
          danger
          onConfirm={handleDidntDeliver}
          onCancel={() => {
            setStep('idle');
            setBlacklistOnDrop(false);
          }}
        >
          <label className="flex items-start gap-2 text-[11px] text-ink-secondary">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={blacklistOnDrop}
              onChange={(e) => setBlacklistOnDrop(e.target.checked)}
            />
            <span>Also blacklist this creator on their contact record</span>
          </label>
        </InlineCardConfirm>
      </LoggingPanel>
    );
  }

  return (
    <>
      <LoggingPanel>
        <div className="max-md:block md:hidden md:group-hover/card:block">
          <div className="mb-2 space-y-1">
            <div className="text-[11px] text-ink-secondary">{posted} / {total} posted</div>
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-ink/30 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <ul className="space-y-1">
            {deliverables.map((d) => {
              const isPosted = isDeliverableFullyPosted(d);
              return (
                <li key={d.id}>
                  {isPosted ? (
                    <div className="flex items-center gap-2 rounded-md bg-canvas px-2 py-1.5 text-[11px] text-ink-secondary">
                      <span className="text-health-green" aria-hidden>✓</span>
                      <span className="capitalize">{deliverableLabel(d)}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-line bg-white px-2 py-1.5 text-left text-[11px] hover:border-brand/40"
                      onClick={() => setLoggingDeliverableId(d.id)}
                    >
                      <span className="text-ink-tertiary" aria-hidden>○</span>
                      <span className="capitalize text-ink">{deliverableLabel(d)}</span>
                      <span className="ml-auto text-ink-tertiary">Log →</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {allPostedWithProof && (
            <button
              type="button"
              className="btn-primary mt-2 w-full !py-1.5 text-[11px]"
              onClick={() => setStep('confirm_complete')}
            >
              Mark Collaboration Complete
            </button>
          )}

          {showDidntDeliver && (
            <button
              type="button"
              className="btn-ghost mt-2 w-full !py-1 text-[11px] text-health-red"
              onClick={() => setStep('confirm_didnt_deliver')}
            >
              Mark Didn&apos;t Deliver
            </button>
          )}
        </div>
      </LoggingPanel>

      <LogDeliverableDrawer
        deliverable={loggingDeliverable}
        open={Boolean(loggingDeliverable)}
        onClose={() => setLoggingDeliverableId(null)}
        onConfirm={handleLogDeliverable}
      />
    </>
  );
}

function LoggingPanel({ children }) {
  return (
    <div className="mt-2 border-t border-line/80 pt-2" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
