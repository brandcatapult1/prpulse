import { CAMPAIGN_KANBAN_COLUMNS, groupEngagementsByColumn } from '../../lib/campaignKanban.js';
import { CreatorKanbanCard } from './CreatorKanbanCard.jsx';

export function CampaignKanbanBoard({ engagements, onCardClick }) {
  const grouped = groupEngagementsByColumn(engagements);

  return (
    <div className="campaign-board -mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max gap-3">
        {CAMPAIGN_KANBAN_COLUMNS.map((column) => (
          <section
            key={column.id}
            className="flex w-[220px] shrink-0 flex-col rounded-lg bg-[#14161c]"
            aria-label={column.label}
          >
            <header className="flex items-center justify-between px-3 py-2.5">
              <h3 className="text-2xs font-medium text-zinc-400">{column.label}</h3>
              <span className="text-2xs tabular-nums text-zinc-600">{grouped[column.id].length}</span>
            </header>
            <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
              {grouped[column.id].map((engagement) => (
                <CreatorKanbanCard
                  key={engagement.id}
                  engagement={engagement}
                  onClick={() => onCardClick?.(engagement)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
