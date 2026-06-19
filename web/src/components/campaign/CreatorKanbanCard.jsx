import { formatDate } from '../../lib/format.jsx';
import {
  columnIdForStatus,
  contactHandle,
  contactInitials,
  contentTypeSummary,
  deliverableProgress,
  dropReasonLabel,
  isFollowUpOverdue,
  regionLabel,
} from '../../lib/campaignKanban.js';

function InterestDot({ level }) {
  const title = level ? `${level} interest` : 'Interest not set';
  if (level === 'high') {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" title={title} aria-hidden />;
  }
  if (level === 'medium') {
    return (
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full border border-zinc-500 bg-zinc-600/40"
        title={title}
        aria-hidden
      />
    );
  }
  return (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-zinc-600 bg-transparent" title={title} aria-hidden />
  );
}

function StatusLine({ engagement, columnId }) {
  const status = engagement.conversation_status;

  if (columnId === 'in_conversation') {
    const date = engagement.next_follow_up_date;
    const overdue = isFollowUpOverdue(date);
    return (
      <p className={`text-2xs ${overdue ? 'font-medium text-red-400' : 'text-zinc-400'}`}>
        {date ? `Follow-up ${formatDate(date)}` : 'No follow-up set'}
      </p>
    );
  }

  if (columnId === 'scheduled') {
    const visitDate = engagement.visit_date ?? engagement.next_follow_up_date;
    return (
      <p className="text-2xs text-zinc-400">
        Visit {visitDate ? formatDate(visitDate) : '—'}
      </p>
    );
  }

  if (columnId === 'awaiting_final') {
    const { posted, total, pct } = deliverableProgress(engagement.id);
    if (total === 0) {
      return <p className="text-2xs text-zinc-500">No deliverables yet</p>;
    }
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-2xs text-zinc-400">
          <span>{posted} / {total} posted</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-zinc-700/80">
          <div
            className="h-full rounded-full bg-zinc-400 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (columnId === 'complete') {
    return <p className="text-2xs font-medium text-emerald-400">Content live</p>;
  }

  if (columnId === 'dropped') {
    return (
      <span className="inline-flex rounded px-1.5 py-0.5 text-2xs font-medium text-red-300 ring-1 ring-red-500/40">
        {dropReasonLabel(status)}
      </span>
    );
  }

  return <p className="text-2xs text-zinc-500">{status?.replace(/_/g, ' ') ?? '—'}</p>;
}

/**
 * Glanceable creator summary for the campaign Kanban board.
 * Full record fields live in CampaignQuickEditDrawer.
 */
export function CreatorKanbanCard({ engagement, onClick }) {
  const columnId = columnIdForStatus(engagement.conversation_status);
  const owner = engagement.owner_name?.split(' ')[0] ?? '—';
  const contentType = contentTypeSummary(engagement.id);
  const region = regionLabel(engagement);

  return (
    <button
      type="button"
      onClick={onClick}
      className="campaign-kanban-card w-full text-left"
    >
      {/* Zone 1 — Identity */}
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700/90 text-2xs font-semibold text-zinc-100"
          aria-hidden
        >
          {contactInitials(engagement.contact_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium leading-tight text-zinc-100">
              {engagement.contact_name}
            </span>
            <InterestDot level={engagement.interest_level} />
          </div>
          <p className="truncate text-2xs text-zinc-500">{contactHandle(engagement)}</p>
        </div>
      </div>

      {/* Zone 2 — Column-aware status */}
      <div className="mt-2.5 min-h-[1.25rem]">
        <StatusLine engagement={engagement} columnId={columnId} />
      </div>

      {/* Zone 3 — Quiet metadata footer */}
      <p className="mt-2.5 truncate text-[11px] leading-snug text-zinc-600">
        {owner} · {contentType} · {region}
      </p>
    </button>
  );
}
