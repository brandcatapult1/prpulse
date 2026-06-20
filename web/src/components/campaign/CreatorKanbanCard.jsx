import { formatDate } from '../../lib/format.jsx';
import {
  collaborationReasonLabel,
  columnIdForStatus,
  contactHandle,
  contactInitials,
  contentTypeSummary,
  deliverableProgress,
  droppedReasonLabel,
  isDeliverablesAtRisk,
  isFollowUpOverdue,
  isVisitOverdue,
  commercialTypeLabel,
} from '../../lib/campaignKanban.js';
import { resolveDroppedFrom } from '../../lib/engagementTransitions.js';
import { droppedFromLabel } from '../../lib/dropTransitions.js';
import { isContactBlacklisted } from '../../lib/demo.js';
import { InConversationCardLogging } from './InConversationCardLogging.jsx';
import { ScheduledCardLogging } from './ScheduledCardLogging.jsx';
import { AwaitingDeliverablesCardLogging } from './AwaitingDeliverablesCardLogging.jsx';
import { NotContactedCardLogging } from './NotContactedCardLogging.jsx';
import { DroppedCardLogging } from './DroppedCardLogging.jsx';
import { CompleteCardLogging } from './CompleteCardLogging.jsx';

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
    if (status === 'no_response') {
      return (
        <p className={`text-2xs ${overdue ? 'font-medium text-health-red' : 'text-ink-secondary'}`}>
          {date ? `No reply — retry ${formatDate(date)}` : 'No reply yet — set retry date'}
        </p>
      );
    }
    return (
      <p className={`text-2xs ${overdue ? 'font-medium text-health-red' : 'text-ink-secondary'}`}>
        {date ? `Follow-up ${formatDate(date)}` : 'Set a follow-up date'}
      </p>
    );
  }

  if (columnId === 'scheduled') {
    const visitDate = engagement.visit_date ?? engagement.next_follow_up_date;
    const overdue = isVisitOverdue(engagement);
    return (
      <div className="space-y-1">
        {overdue && (
          <span className="inline-flex rounded px-1.5 py-0.5 text-2xs font-medium text-health-red ring-1 ring-red-200">
            Visit overdue
          </span>
        )}
        <p className={`text-2xs ${overdue ? 'font-medium text-health-red' : 'text-ink-secondary'}`}>
          Visit {visitDate ? formatDate(visitDate) : '—'}
        </p>
      </div>
    );
  }

  if (columnId === 'awaiting_final') {
    const { posted, total, pct } = deliverableProgress(engagement.id);
    const atRisk = isDeliverablesAtRisk(engagement);
    if (total === 0) {
      return <p className="text-2xs text-ink-tertiary">Add deliverables to track progress</p>;
    }
    return (
      <div className="space-y-1">
        {atRisk && (
          <span className="inline-flex rounded px-1.5 py-0.5 text-2xs font-medium text-health-amber ring-1 ring-amber-200">
            At risk
          </span>
        )}
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
    const { posted, total } = deliverableProgress(engagement.id);
    return (
      <p className="text-2xs font-medium text-health-green">
        Delivered · {posted}/{total}
      </p>
    );
  }

  if (columnId === 'dropped') {
    const blacklisted =
      engagement.contact_id && isContactBlacklisted(engagement.contact_id);
    const droppedFrom = resolveDroppedFrom(engagement);
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded px-1.5 py-0.5 text-2xs font-medium text-health-red ring-1 ring-red-200">
          {droppedReasonLabel(status)}
        </span>
        {status === 'dropped_didnt_deliver' && droppedFrom && (
          <p className="text-[11px] text-ink-secondary">
            Failed at: {droppedFromLabel(droppedFrom)}
          </p>
        )}
        {blacklisted && (
          <span className="inline-flex rounded px-1.5 py-0.5 text-2xs font-medium text-health-red ring-1 ring-red-200">
            Blacklisted
          </span>
        )}
      </div>
    );
  }

  return <p className="text-2xs text-ink-tertiary">{status?.replace(/_/g, ' ') ?? '—'}</p>;
}

/**
 * Glanceable creator summary for the campaign Kanban board.
 * Card body opens quick-edit drawer; In conversation cards add inline logging on hover.
 */
export function CreatorKanbanCard({
  engagement,
  onClick,
  onApplyLogging,
  onApplyDeliverables,
  onApplyDidntDeliver,
  onApplyReopen,
  onApplyContactFeedback,
  onLoggingError,
  userRole,
  boardRevision,
}) {
  const columnId = columnIdForStatus(engagement.conversation_status);
  const showNotContactedLogging =
    columnId === 'not_contacted' && engagement.conversation_status === 'not_contacted';
  const showInConversationLogging =
    columnId === 'in_conversation' && engagement.conversation_status === 'in_conversation';
  const showScheduledLogging =
    columnId === 'scheduled' && engagement.conversation_status === 'scheduled';
  const showAwaitingLogging =
    columnId === 'awaiting_final' && engagement.conversation_status === 'awaiting_final_deliverables';
  const showDroppedLogging = columnId === 'dropped';
  const showCompleteLogging =
    columnId === 'complete' && engagement.conversation_status === 'collaboration_complete';
  const owner = engagement.owner_name?.split(' ')[0] ?? '—';
  const contentType = contentTypeSummary(engagement.id);
  const commercial = commercialTypeLabel(engagement);
  const reason = collaborationReasonLabel(engagement.primary_collaboration_reason);
  const footerParts = [owner, reason ?? 'Reason not set', contentType, commercial].filter(Boolean);

  return (
    <div className="group/card campaign-kanban-card w-full text-left">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
      >
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

        <div className="mt-2.5 min-h-[1.25rem]">
          <StatusLine engagement={engagement} columnId={columnId} />
        </div>

        <p className="mt-2.5 truncate text-[11px] leading-snug text-ink-tertiary">
          {footerParts.join(' · ')}
        </p>
      </button>

      {showNotContactedLogging && onApplyLogging && (
        <NotContactedCardLogging
          engagement={engagement}
          onApply={onApplyLogging}
          onError={onLoggingError}
        />
      )}

      {showInConversationLogging && onApplyLogging && (
        <InConversationCardLogging
          engagement={engagement}
          onApply={onApplyLogging}
          onError={onLoggingError}
        />
      )}

      {showScheduledLogging && onApplyLogging && (
        <ScheduledCardLogging
          engagement={engagement}
          onApply={onApplyLogging}
          onError={onLoggingError}
        />
      )}

      {showAwaitingLogging && onApplyDeliverables && (
        <AwaitingDeliverablesCardLogging
          engagement={engagement}
          userRole={userRole}
          boardRevision={boardRevision}
          onApplyEngagement={onApplyLogging}
          onApplyDeliverables={onApplyDeliverables}
          onApplyDidntDeliver={onApplyDidntDeliver}
          onError={onLoggingError}
        />
      )}

      {showDroppedLogging && onApplyReopen && (
        <DroppedCardLogging
          engagement={engagement}
          userRole={userRole}
          onApplyReopen={onApplyReopen}
          onError={onLoggingError}
        />
      )}

      {showCompleteLogging && onApplyContactFeedback && (
        <CompleteCardLogging
          engagement={engagement}
          boardRevision={boardRevision}
          onApplyContactFeedback={onApplyContactFeedback}
          onError={onLoggingError}
        />
      )}
    </div>
  );
}
