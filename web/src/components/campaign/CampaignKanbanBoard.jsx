import { CAMPAIGN_KANBAN_COLUMNS, groupEngagementsByColumn } from '../../lib/campaignKanban.js';
import { CreatorKanbanCard } from './CreatorKanbanCard.jsx';

export function CampaignKanbanBoard({
  engagements,
  onCardClick,
  onApplyLogging,
  onApplyDeliverables,
  onApplyDidntDeliver,
  onApplyReopen,
  onApplyContactFeedback,
  onLoggingError,
  userRole,
  boardRevision,
}) {
  const grouped = groupEngagementsByColumn(engagements);

  return (
    <div className="campaign-board -mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max gap-3">
        {CAMPAIGN_KANBAN_COLUMNS.map((column) => (
          <section
            key={column.id}
            className="flex w-[232px] shrink-0 flex-col rounded-lg border border-line bg-canvas/60"
            aria-label={column.label}
          >
            <header className="flex items-center justify-between border-b border-line/80 px-3 py-2.5">
              <h3 className="text-2xs font-medium text-ink-secondary">{column.label}</h3>
              <span className="text-2xs tabular-nums text-ink-tertiary">{grouped[column.id].length}</span>
            </header>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {grouped[column.id].length === 0 ? (
                <p className="px-1 py-4 text-center text-[11px] text-ink-tertiary">No creators here</p>
              ) : (
                grouped[column.id].map((engagement) => (
                  <CreatorKanbanCard
                    key={engagement.id}
                    engagement={engagement}
                    userRole={userRole}
                    boardRevision={boardRevision}
                    onClick={() => onCardClick?.(engagement)}
                    onApplyLogging={(patch, message, snapshotKeys) =>
                      onApplyLogging?.(engagement.id, patch, message, snapshotKeys)
                    }
                    onApplyDeliverables={(deliverables, message) =>
                      onApplyDeliverables?.(engagement.id, deliverables, message)
                    }
                    onApplyDidntDeliver={(payload) =>
                      onApplyDidntDeliver?.(engagement.id, payload)
                    }
                    onApplyReopen={(payload) => onApplyReopen?.(engagement.id, payload)}
                    onApplyContactFeedback={(payload) =>
                      onApplyContactFeedback?.(engagement.id, payload)
                    }
                    onLoggingError={onLoggingError}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
