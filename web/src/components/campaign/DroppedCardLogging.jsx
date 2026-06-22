import { useState } from 'react';
import { Modal } from '../ui/Primitives.jsx';
import { isContactBlacklisted } from '../../lib/contactsHelpers.js';
import { canReopenDropped, droppedFromLabel, isDidntDeliverDrop } from '../../lib/dropTransitions.js';
import { reopenToastMessage } from '../../lib/outreachLogging.js';
import { resolveDroppedFrom, STAGE, transitionStage } from '../../lib/engagementTransitions.js';

export function DroppedCardLogging({ engagement, userRole, onApplyReopen, onError }) {
  const [reopenOpen, setReopenOpen] = useState(false);
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
      setReopenOpen(false);
      return;
    }
    onApplyReopen({
      engagementPatch: result.patch,
      clearBlacklist: result.clearBlacklist && needsBlacklistPrompt && clearBlacklist,
      message: reopenToastMessage(droppedFromLabel(droppedFrom)),
    });
    setReopenOpen(false);
    setClearBlacklist(false);
  }

  return (
    <>
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
              onClick={() => setReopenOpen(true)}
            >
              Reopen
            </button>
          ) : (
            <p className="text-[11px] text-ink-tertiary">Reopen requires Senior Manager or Admin</p>
          )}
        </div>
      </LoggingPanel>

      <Modal
        open={reopenOpen}
        title="Reopen engagement?"
        onClose={() => {
          setReopenOpen(false);
          setClearBlacklist(false);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setReopenOpen(false);
                setClearBlacklist(false);
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleReopenConfirm}>
              Reopen
            </button>
          </div>
        }
      >
        <p className="text-2xs text-ink-secondary">
          Return to <span className="font-medium text-ink">{droppedFromLabel(droppedFrom)}</span>?
        </p>
        {needsBlacklistPrompt && (
          <label className="mt-4 flex items-start gap-2 text-2xs text-ink-secondary">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={clearBlacklist}
              onChange={(e) => setClearBlacklist(e.target.checked)}
            />
            <span>Clear blacklist on this creator&apos;s contact record</span>
          </label>
        )}
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
