import { formatDate } from '../../lib/format.jsx';
import { getCreatorCardIdentity } from '../../lib/contactSocialLinks.js';
import {
  columnIdForStatus,
  contactInitials,
  contentTypeSummary,
  deliverableProgress,
  droppedReasonLabel,
  isDeliverablesAtRisk,
  isFollowUpOverdue,
  isVisitOverdue,
  regionLabel,
} from '../../lib/campaignKanban.js';
import { resolveDroppedFrom } from '../../lib/engagementTransitions.js';
import { droppedFromLabel } from '../../lib/dropTransitions.js';
import { isContactBlacklisted } from '../../lib/contactsHelpers.js';
import { InConversationCardLogging } from './InConversationCardLogging.jsx';
import { ScheduledCardLogging } from './ScheduledCardLogging.jsx';
import { AwaitingDeliverablesCardLogging } from './AwaitingDeliverablesCardLogging.jsx';
import { NotContactedCardLogging } from './NotContactedCardLogging.jsx';
import { DroppedCardLogging } from './DroppedCardLogging.jsx';
import { CompleteCardLogging } from './CompleteCardLogging.jsx';

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

function WhatsAppIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CreatorHandle({ handleLabel, profileUrl, onLinkClick }) {
  if (profileUrl) {
    return (
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-2xs text-ink-tertiary hover:text-brand hover:underline"
        onClick={onLinkClick}
        onMouseDown={onLinkClick}
      >
        {handleLabel}
      </a>
    );
  }
  return <span className="truncate text-2xs text-ink-tertiary">{handleLabel}</span>;
}

function CreatorCardHeader({ engagement }) {
  const { handleLabel, profileUrl, whatsAppUrl } = getCreatorCardIdentity(engagement);

  function stopCardOpen(event) {
    event.stopPropagation();
  }

  return (
    <div className="flex items-start gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xs font-semibold text-brand"
        aria-hidden
      >
        {contactInitials(engagement.contact_name)}
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium leading-tight text-ink">
              {engagement.contact_name}
            </span>
          </div>
          <div className="mt-0.5">
            <CreatorHandle
              handleLabel={handleLabel}
              profileUrl={profileUrl}
              onLinkClick={stopCardOpen}
            />
          </div>
        </div>
        {whatsAppUrl ? (
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${engagement.contact_name}`}
            title="WhatsApp"
            className="shrink-0 rounded-full border border-line p-1.5 text-health-green transition-colors hover:border-health-green/40 hover:bg-teal-50/80"
            onClick={stopCardOpen}
            onMouseDown={stopCardOpen}
          >
            <WhatsAppIcon />
          </a>
        ) : (
          <span
            aria-label={`WhatsApp unavailable for ${engagement.contact_name}`}
            title="No phone on file"
            className="shrink-0 cursor-not-allowed rounded-full border border-line p-1.5 text-ink-tertiary/50"
          >
            <WhatsAppIcon />
          </span>
        )}
      </div>
    </div>
  );
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
  const showInConversationLogging = columnId === 'in_conversation';
  const showScheduledLogging =
    columnId === 'scheduled' && engagement.conversation_status === 'scheduled';
  const showAwaitingLogging =
    columnId === 'awaiting_final' && engagement.conversation_status === 'awaiting_final_deliverables';
  const showDroppedLogging = columnId === 'dropped';
  const showCompleteLogging =
    columnId === 'complete' && engagement.conversation_status === 'collaboration_complete';
  const owner = engagement.owner_name?.split(' ')[0] ?? '—';
  const contentType = contentTypeSummary(engagement.id);
  const region = regionLabel(engagement);
  const footerParts = [owner, contentType, region].filter(Boolean);

  function openCard(event) {
    if (event.defaultPrevented) return;
    onClick?.();
  }

  function onCardKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  }

  return (
    <div className="group/card campaign-kanban-card w-full text-left">
      <div
        role="button"
        tabIndex={0}
        onClick={openCard}
        onKeyDown={onCardKeyDown}
        className="w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/30 rounded-md"
      >
        <CreatorCardHeader engagement={engagement} />

        <div className="mt-2.5 min-h-[1.25rem]">
          <StatusLine engagement={engagement} columnId={columnId} />
        </div>

        <p className="mt-2.5 truncate text-[11px] leading-snug text-ink-tertiary">
          {footerParts.join(' · ')}
        </p>
      </div>

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
