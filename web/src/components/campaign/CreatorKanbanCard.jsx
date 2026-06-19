import { formatDate } from '../../lib/format.jsx';
import {
  collaborationReasonLabel,
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
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" title={title} aria-hidden />;
  }
  if (level === 'medium') {
    return (
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full border border-ink-secondary bg-ink/20"
        title={title}
        aria-hidden
      />
    );
  }
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full border border-line bg-transparent"
      title={title}
      aria-hidden
    />
  );
}

function StatusLine({ engagement, columnId }) {
  const status = engagement.conversation_status;

  if (columnId === 'not_contacted') {
    return <p className="text-2xs text-ink-secondary">Ready to reach out</p>;
  }

  if (columnId === 'in_conversation') {
    const date = engagement.next_follow_up_date;
    const overdue = isFollowUpOverdue(date);
    return (
      <p className={`text-2xs ${overdue ? 'font-medium text-health-red' : 'text-ink-secondary'}`}>
        {date ? `Follow-up ${formatDate(date)}` : 'Set a follow-up date'}
      </p>
    );
  }

  if (columnId === 'scheduled') {
    const visitDate = engagement.visit_date ?? engagement.next_follow_up_date;
    return (
      <p className="text-2xs text-ink-secondary">
        Visit {visitDate ? formatDate(visitDate) : '—'}
      </p>
    );
  }

  if (columnId === 'awaiting_final') {
    const { posted, total, pct } = deliverableProgress(engagement.id);
    if (total === 0) {
      return <p className="text-2xs text-ink-tertiary">Add deliverables to track progress</p>;
    }
    return (
      <div className="space-y-1">
        <div className="text-2xs text-ink-secondary">{posted} / {total} posted</div>
        <div className="h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-ink/30 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (columnId === 'complete') {
    return <p className="text-2xs font-medium text-health-green">Content live</p>;
  }

  if (columnId === 'rejected') {
    return (
      <span className="inline-flex rounded px-1.5 py-0.5 text-2xs font-medium text-health-red ring-1 ring-red-200">
        {dropReasonLabel(status)}
      </span>
    );
  }

  return <p className="text-2xs text-ink-tertiary">{status?.replace(/_/g, ' ') ?? '—'}</p>;
}

/**
 * Glanceable creator summary for the campaign Kanban board.
 * Tap opens CampaignQuickEditDrawer for status + reason updates.
 */
export function CreatorKanbanCard({ engagement, onClick }) {
  const columnId = columnIdForStatus(engagement.conversation_status);
  const owner = engagement.owner_name?.split(' ')[0] ?? '—';
  const contentType = contentTypeSummary(engagement.id);
  const region = regionLabel(engagement);
  const reason = collaborationReasonLabel(engagement.primary_collaboration_reason);
  const footerParts = [owner, reason ?? 'Reason not set', contentType, region].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      className="campaign-kanban-card w-full text-left"
    >
      {/* Zone 1 — Identity */}
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xs font-semibold text-brand"
          aria-hidden
        >
          {contactInitials(engagement.contact_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium leading-tight text-ink">
              {engagement.contact_name}
            </span>
            <InterestDot level={engagement.interest_level} />
          </div>
          <p className="truncate text-2xs text-ink-tertiary">{contactHandle(engagement)}</p>
        </div>
      </div>

      {/* Zone 2 — Column-aware status */}
      <div className="mt-2.5 min-h-[1.25rem]">
        <StatusLine engagement={engagement} columnId={columnId} />
      </div>

      {/* Zone 3 — Quiet metadata footer (includes collab reason per PRD) */}
      <p className="mt-2.5 truncate text-[11px] leading-snug text-ink-tertiary">
        {footerParts.join(' · ')}
      </p>
    </button>
  );
}
