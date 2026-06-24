import { useMemo } from 'react';
import { deliverableProgress } from '../../lib/campaignKanban.js';

export function CompleteCardLogging({
  engagement,
  boardRevision,
  onRequestProof,
  onRequestFeedback,
}) {
  const { posted, total } = useMemo(
    () => deliverableProgress(engagement.id),
    [engagement.id, boardRevision],
  );

  return (
    <LoggingPanel>
      <div className="max-md:block md:hidden md:group-hover/card:block space-y-2">
        <button
          type="button"
          className="btn-ghost w-full justify-start !py-1 text-[11px] text-brand"
          onClick={() => onRequestProof?.(engagement)}
        >
          View proof · {posted}/{total}
        </button>
        <button
          type="button"
          className="btn-secondary w-full !py-1 text-[11px]"
          onClick={() => onRequestFeedback?.(engagement)}
        >
          Log feedback
        </button>
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
