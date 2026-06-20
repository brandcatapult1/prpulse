import { useMemo, useState } from 'react';
import { ConfirmDialog, Modal } from '../ui/Primitives.jsx';
import { getDemoDeliverables } from '../../lib/demo.js';
import { canMarkDidntDeliver } from '../../lib/campaignPermissions.js';
import { deliverableProgress } from '../../lib/campaignKanban.js';
import {
  deliverableHasProof,
  markDeliverablePostedToastMessage,
} from '../../lib/deliverableLogging.js';
import {
  DIDNT_DELIVER_DROP_REASON,
  STAGE,
  transitionStage,
} from '../../lib/engagementTransitions.js';
import { LogDeliverablePanel } from './LogDeliverablePanel.jsx';

function deliverableLabel(d) {
  return `${d.deliverable_type} ×${d.quantity}`;
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
  const [completeOpen, setCompleteOpen] = useState(false);
  const [didntDeliverOpen, setDidntDeliverOpen] = useState(false);
  const [blacklistOnDrop, setBlacklistOnDrop] = useState(false);

  const deliverables = useMemo(
    () => getDemoDeliverables(engagement.id),
    [engagement.id, boardRevision],
  );

  const { posted, total, pct } = deliverableProgress(engagement.id);
  const allPostedWithProof =
    total > 0
    && deliverables.every((d) => d.status === 'posted' && deliverableHasProof(d));
  const showDidntDeliver = canMarkDidntDeliver(userRole);
  const loggingDeliverable = deliverables.find((d) => d.id === loggingDeliverableId) ?? null;

  function handleLogDeliverable(nextDeliverable) {
    const nextList = deliverables.map((d) => (d.id === nextDeliverable.id ? nextDeliverable : d));
    onApplyDeliverables(
      nextList,
      markDeliverablePostedToastMessage(nextDeliverable),
    );
  }

  function handleMarkComplete() {
    const result = transitionStage(engagement, STAGE.COMPLETE);
    if (!result.ok) {
      onError?.(result.error ?? 'Could not mark complete');
      setCompleteOpen(false);
      return;
    }
    onApplyEngagement(result.patch, 'Collaboration marked complete', Object.keys(result.patch));
    setCompleteOpen(false);
  }

  function handleDidntDeliver() {
    const result = transitionStage(engagement, STAGE.DROPPED, {
      dropReason: DIDNT_DELIVER_DROP_REASON.value,
      failedAt: 'awaiting_final_deliverables',
    });
    if (!result.ok) {
      onError?.(result.error ?? 'Could not mark didn\'t deliver');
      setDidntDeliverOpen(false);
      return;
    }
    onApplyDidntDeliver({
      engagementPatch: result.patch,
      blacklist: blacklistOnDrop,
      message: blacklistOnDrop
        ? "Didn't Deliver — creator blacklisted"
        : "Didn't Deliver — moved to Dropped",
    });
    setDidntDeliverOpen(false);
    setBlacklistOnDrop(false);
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
              const isPosted = d.status === 'posted';
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
              onClick={() => setCompleteOpen(true)}
            >
              Mark Collaboration Complete
            </button>
          )}

          {showDidntDeliver && (
            <button
              type="button"
              className="btn-ghost mt-2 w-full !py-1 text-[11px] text-health-red"
              onClick={() => setDidntDeliverOpen(true)}
            >
              Mark Didn&apos;t Deliver
            </button>
          )}
        </div>
      </LoggingPanel>

      <LogDeliverablePanel
        deliverable={loggingDeliverable}
        open={Boolean(loggingDeliverableId)}
        onClose={() => setLoggingDeliverableId(null)}
        onConfirm={handleLogDeliverable}
      />

      <ConfirmDialog
        open={completeOpen}
        title="Mark Collaboration Complete?"
        body="All deliverables are posted with proof on file. Confirm to close this collaboration."
        confirmLabel="Mark complete"
        onConfirm={handleMarkComplete}
        onCancel={() => setCompleteOpen(false)}
      />

      <Modal
        open={didntDeliverOpen}
        title="Mark Didn't Deliver?"
        onClose={() => {
          setDidntDeliverOpen(false);
          setBlacklistOnDrop(false);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setDidntDeliverOpen(false);
                setBlacklistOnDrop(false);
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleDidntDeliver}>
              Confirm
            </button>
          </div>
        }
      >
        <p className="text-2xs text-ink-secondary">
          Moves this creator to Dropped with reason Didn&apos;t Deliver.
        </p>
        <label className="mt-4 flex items-start gap-2 text-2xs text-ink-secondary">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={blacklistOnDrop}
            onChange={(e) => setBlacklistOnDrop(e.target.checked)}
          />
          <span>Also blacklist this creator on their contact record</span>
        </label>
      </Modal>
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
