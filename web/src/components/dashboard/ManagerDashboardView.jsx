import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Toast } from '../ui/Primitives.jsx';
import { LogDeliverableDrawer } from '../deliverables/LogDeliverableDrawer.jsx';
import { InConversationCardLogging } from '../campaign/InConversationCardLogging.jsx';
import {
  buildVisitDoneTransition,
  buildVisitReminderUrl,
  visitDoneToastMessage,
} from '../../lib/visitLogging.js';
import { STAGE, transitionStage } from '../../lib/engagementTransitions.js';
import { markDeliverablePostedToastMessage } from '../../lib/deliverableLogging.js';
import {
  buildDashboardFromEngagements,
  dashboardDateLabel,
  dashboardGreeting,
  firstPendingDeliverable,
  MODULE_ROW_LIMIT,
} from '../../lib/dashboardData.js';
import { healthDotClass, healthLabel } from '../../lib/format.jsx';
import {
  patchEngagement,
  logDeliverableProof,
  fetchDashboardWorkspace,
  logVisitReminder,
} from '../../lib/persistence.js';
import { setDeliverablesCache, getDeliverablesForEngagement } from '../../lib/deliverablesCache.js';
import { getCachedContact } from '../../lib/contactsCache.js';

/** Single-person dashboard workspace — optionally scoped to a direct report. */
export function ManagerDashboardView({ scopeUserId, displayFirstName }) {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [loggingDeliverable, setLoggingDeliverable] = useState(null);
  const [contactLoggingEngagementId, setContactLoggingEngagementId] = useState(null);
  const [revision, setRevision] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardWorkspace(scopeUserId);
      setDeliverablesCache(data.deliverablesByEngagement ?? {});
      setWorkspace(data);
      setRevision((r) => r + 1);
    } catch {
      setWorkspace({ engagements: [], campaigns: [], deliverablesByEngagement: {} });
    } finally {
      setLoading(false);
    }
  }, [scopeUserId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const dashboard = useMemo(() => {
    if (!workspace) {
      return buildDashboardFromEngagements({
        engagements: [],
        campaigns: [],
        getDeliverables: getDeliverablesForEngagement,
      });
    }
    void revision;
    return buildDashboardFromEngagements({
      engagements: workspace.engagements,
      campaigns: workspace.campaigns,
      getDeliverables: getDeliverablesForEngagement,
    });
  }, [workspace, revision]);

  useEffect(() => {
    const breakdown = dashboard?.attentionBreakdown;
    if (!breakdown || !workspace?.engagements?.length) return;

    console.group(
      `[Dashboard] ${breakdown.total} engagement(s) need attention — breakdown by qualification`,
    );
    console.log('Headline total (unique engagement ids):', breakdown.total);
    console.log('Dedupe key: engagementId — multi-module engagements count once in headline');
    if (breakdown.followUpDueToday.length) {
      console.log("Today's tasks — follow-up due today:", breakdown.followUpDueToday);
    }
    if (breakdown.followUpOverdue.length) {
      console.log("Today's tasks — follow-up overdue:", breakdown.followUpOverdue);
    }
    if (breakdown.pendingDeliverableEngagements.length) {
      console.log('Pending deliverables (unique engagements):', breakdown.pendingDeliverableEngagements);
    }
    if (breakdown.atRiskEngagements.length) {
      console.log('At risk (unique engagements):', breakdown.atRiskEngagements);
    }
    console.table(
      breakdown.perEngagement.map((row) => ({
        engagementId: row.engagementId,
        contact: row.contactName,
        campaign: row.campaignName,
        modules: row.modules,
        reasons: row.reasons,
        flags: row.flags,
        deliverableCount: row.deliverableCount,
      })),
    );
    console.groupEnd();
  }, [dashboard?.attentionBreakdown, dashboard?.today]);

  const firstName = displayFirstName ?? 'there';

  const showActionToast = useCallback((message, onUndo) => {
    setToast({ message, onUndo });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 8000);
  }, []);

  const applyEngagementLogging = useCallback(
    async (engagementId, patch, message, snapshotKeys) => {
      const base = workspace?.engagements?.find((e) => e.id === engagementId);
      const snapshot = {};
      for (const key of snapshotKeys) snapshot[key] = base?.[key];
      try {
        const updated = await patchEngagement(engagementId, patch);
        setWorkspace((ws) => ({
          ...ws,
          engagements: (ws?.engagements ?? []).map((r) =>
            (r.id === engagementId ? { ...r, ...updated } : r)),
        }));
        setRevision((r) => r + 1);
        showActionToast(message, async () => {
          const restored = await patchEngagement(engagementId, snapshot);
          setWorkspace((ws) => ({
            ...ws,
            engagements: (ws?.engagements ?? []).map((r) =>
              (r.id === engagementId ? { ...r, ...restored } : r)),
          }));
          setRevision((r) => r + 1);
          setToast(null);
        });
      } catch (err) {
        showActionToast(err.message ?? 'Save failed', null);
      }
    },
    [workspace?.engagements, showActionToast],
  );

  const handleOpenContactLogging = useCallback((engagementId) => {
    setContactLoggingEngagementId((current) => (current === engagementId ? null : engagementId));
  }, []);

  const handleCloseContactLogging = useCallback(() => {
    setContactLoggingEngagementId(null);
  }, []);

  const applyDeliverablesLogging = useCallback(
    async (engagementId, deliverable, message) => {
      try {
        await logDeliverableProof(engagementId, deliverable);
        await reload();
        showActionToast(message, null);
      } catch (err) {
        showActionToast(err.message ?? 'Could not log deliverable', null);
      }
    },
    [reload, showActionToast],
  );

  const handleVisitDone = useCallback(
    (engagementId) => {
      const engagement = workspace?.engagements?.find((e) => e.id === engagementId);
      if (!engagement) return;
      const result = buildVisitDoneTransition(engagement, transitionStage, STAGE);
      if (!result.ok) {
        showActionToast(result.error ?? 'Could not log visit');
        return;
      }
      applyEngagementLogging(
        engagementId,
        result.patch,
        visitDoneToastMessage(),
        Object.keys(result.patch),
      );
    },
    [applyEngagementLogging, showActionToast, workspace?.engagements],
  );

  const handleLogDeliverableClick = useCallback((engagementId) => {
    const deliverable = firstPendingDeliverable(engagementId, getDeliverablesForEngagement);
    if (!deliverable) return;
    setLoggingDeliverable({ ...deliverable, engagementId });
  }, []);

  const handleDeliverableConfirm = useCallback(
    (nextDeliverable) => {
      const engagementId = loggingDeliverable?.engagementId;
      if (!engagementId) return;
      applyDeliverablesLogging(
        engagementId,
        nextDeliverable,
        markDeliverablePostedToastMessage(nextDeliverable),
      );
      setLoggingDeliverable(null);
    },
    [applyDeliverablesLogging, loggingDeliverable?.engagementId],
  );

  const handleRemindCreator = useCallback(
    async (visitRow) => {
      const engagement = visitRow.engagement;
      const contact = getCachedContact(visitRow.contactId);
      const url = buildVisitReminderUrl(contact?.mobile_number, {
        creatorName: visitRow.fullName,
        visitDate: visitRow.visitDate,
        visitTime: visitRow.visitTime,
        venue: visitRow.venue,
        campaignName: visitRow.campaignName,
      });
      if (!url) {
        showActionToast('No mobile number on file for WhatsApp');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      try {
        await logVisitReminder(engagement.id, {
          visitDate: visitRow.visitDate,
          visitTime: visitRow.visitTime,
          venue: visitRow.venue,
          creatorName: visitRow.fullName,
        });
      } catch {
        /* activity is best-effort */
      }
      showActionToast(`Reminder opened for ${visitRow.fullName}`);
    },
    [showActionToast],
  );

  const openEngagementRecord = useCallback((engagementId) => {
    const path = engagementRecordPath(engagementId);
    if (!path) return;
    navigate(path);
  }, [navigate]);

  if (loading && !workspace) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-ink-secondary">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <DashboardHero
          greeting={dashboardGreeting(firstName)}
          dateLabel={dashboardDateLabel(dashboard.today)}
          actionCount={dashboard.actionCount}
          glance={dashboard.glance}
        />

        {dashboard.allClear ? (
          <GlassCard className="py-14 text-center">
            <p className="text-sm font-medium text-ink">You&apos;re all caught up.</p>
            <p className="mt-1 text-2xs text-ink-tertiary">No critical actions need your attention right now.</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <DashboardModule
              icon={IconTasks}
              iconTint="bg-brand-soft text-brand"
              title="Today's tasks"
              count={dashboard.todaysTasks.length}
              viewAllHref="/campaigns"
              emptyLabel="No follow-ups due"
            >
              {dashboard.todaysTasks.slice(0, MODULE_ROW_LIMIT).map((row) => (
                <TaskRow
                  key={row.id}
                  row={row}
                  engagement={workspace?.engagements?.find((e) => e.id === row.engagementId)}
                  contactLoggingOpen={contactLoggingEngagementId === row.engagementId}
                  onOpen={() => openEngagementRecord(row.engagementId)}
                  onLogContact={() => handleOpenContactLogging(row.engagementId)}
                  onVisitDone={() => handleVisitDone(row.engagementId)}
                  onLogDeliverable={() => handleLogDeliverableClick(row.engagementId)}
                  onCloseContactLog={handleCloseContactLogging}
                  onApplyContactLog={(patch, message, snapshotKeys) =>
                    applyEngagementLogging(row.engagementId, patch, message, snapshotKeys)
                  }
                  onScheduleRequest={(engagement) => {
                    handleCloseContactLogging();
                    navigate(`/campaigns/${engagement.campaign_id}`, {
                      state: { scheduleEngagementId: engagement.id, scheduleLogContact: true },
                    });
                  }}
                  onContactLogError={(message) => showActionToast(message ?? 'Could not save', null)}
                />
              ))}
            </DashboardModule>

            <DashboardModule
              icon={IconVisits}
              iconTint="bg-sky-50 text-sky-600"
              title="Today's visits"
              count={dashboard.todaysVisits.length}
              viewAllHref="/campaigns"
              emptyLabel="No visits today"
            >
              {dashboard.todaysVisits.slice(0, MODULE_ROW_LIMIT).map((row) => (
                <VisitRow
                  key={row.id}
                  row={row}
                  onOpen={() => openEngagementRecord(row.engagementId)}
                  onRemind={() => handleRemindCreator(row)}
                  onVisitDone={() => handleVisitDone(row.engagementId)}
                />
              ))}
            </DashboardModule>

            <DashboardModule
              icon={IconDeliverables}
              iconTint="bg-violet-50 text-violet-600"
              title="Pending deliverables"
              count={dashboard.pendingDeliverables.length}
              viewAllHref="/campaigns"
              emptyLabel="No pending deliverables"
            >
              {dashboard.pendingDeliverables.slice(0, MODULE_ROW_LIMIT).map((row) => (
                <DeliverableRow
                  key={row.id}
                  row={row}
                  onOpen={() => openEngagementRecord(row.engagementId)}
                  onLog={() => handleLogDeliverableClick(row.engagementId)}
                />
              ))}
            </DashboardModule>

            <DashboardModule
              icon={IconAtRisk}
              iconTint="bg-amber-50 text-amber-600"
              title="At risk"
              count={dashboard.atRisk.length}
              viewAllHref="/campaigns"
              emptyLabel="Nothing flagged"
            >
              {dashboard.atRisk.slice(0, MODULE_ROW_LIMIT).map((row) => (
                <AtRiskRow
                  key={row.id}
                  row={row}
                  engagement={workspace?.engagements?.find((e) => e.id === row.engagementId)}
                  contactLoggingOpen={contactLoggingEngagementId === row.engagementId}
                  onOpen={() => openEngagementRecord(row.engagementId)}
                  onLogContact={() => handleOpenContactLogging(row.engagementId)}
                  onVisitDone={() => handleVisitDone(row.engagementId)}
                  onCloseContactLog={handleCloseContactLogging}
                  onApplyContactLog={(patch, message, snapshotKeys) =>
                    applyEngagementLogging(row.engagementId, patch, message, snapshotKeys)
                  }
                  onScheduleRequest={(engagement) => {
                    handleCloseContactLogging();
                    navigate(`/campaigns/${engagement.campaign_id}`, {
                      state: { scheduleEngagementId: engagement.id, scheduleLogContact: true },
                    });
                  }}
                  onContactLogError={(message) => showActionToast(message ?? 'Could not save', null)}
                />
              ))}
            </DashboardModule>
          </div>
        )}

        <CampaignTargetsSection campaigns={dashboard.campaignTargets} />
      </div>

      <LogDeliverableDrawer
        deliverable={loggingDeliverable}
        open={Boolean(loggingDeliverable)}
        onClose={() => setLoggingDeliverable(null)}
        onConfirm={handleDeliverableConfirm}
      />

      {toast && <Toast message={toast.message ?? toast} onClose={() => setToast(null)} />}
    </>
  );
}

export function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0ebf8] via-[#e9edf4] to-[#e4f3ee]" />
      <div className="absolute -left-16 -top-32 h-[520px] w-[520px] rounded-full bg-violet-300/60 blur-[100px]" />
      <div className="absolute -right-8 top-[15%] h-[460px] w-[460px] rounded-full bg-orange-200/60 blur-[100px]" />
      <div className="absolute bottom-[-10%] left-[25%] h-[440px] w-[440px] rounded-full bg-teal-200/55 blur-[100px]" />
      <div className="absolute left-[52%] top-[5%] h-[300px] w-[300px] rounded-full bg-violet-200/45 blur-[80px]" />
    </div>
  );
}

function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-[22px] border border-white bg-white/[0.95] shadow-[0_16px_48px_rgba(26,29,38,0.11),0_6px_16px_rgba(26,29,38,0.07),0_0_0_1px_rgba(255,255,255,0.8)_inset] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

const ATTENTION_HEADLINE_TOOLTIP =
  'Unique engagements across Today\'s tasks, Pending deliverables, and At risk. An engagement in multiple modules counts once. Visits are reminders only and excluded.';

const ATTENTION_BREAKDOWN_TOOLTIP =
  'Open work by type — an engagement may appear in more than one module (e.g. at-risk and follow-up task). Pill counts are rows per module; headline is unique engagements.';

const VISITS_REMINDER_TOOLTIP =
  'Scheduled visits today — reminders only, not counted in engagements needing attention.';

function DashboardHero({ greeting, dateLabel, actionCount, glance }) {
  return (
    <GlassCard className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-medium text-ink sm:text-2xl">{greeting}</h1>
        <p
          className="mt-1 text-sm text-ink-secondary"
          title={ATTENTION_HEADLINE_TOOLTIP}
        >
          {dateLabel}
          <span className="text-ink-tertiary"> · </span>
          <span className="font-medium text-ink">{actionCount}</span>
          {' '}
          {actionCount === 1 ? 'engagement needs' : 'engagements need'}
          {' '}
          attention
        </p>
      </div>
      <div className="w-full md:w-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
          <div title={ATTENTION_BREAKDOWN_TOOLTIP} className="min-w-0">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
              By type
            </p>
            <div className="flex flex-wrap gap-2">
              <GlancePill label="Tasks" value={glance.tasks} tone="default" />
              <GlancePill label="Deliverables" value={glance.deliverables} tone="warning" />
              <GlancePill label="At risk" value={glance.atRisk} tone="danger" />
            </div>
          </div>
          <div
            title={VISITS_REMINDER_TOOLTIP}
            className="flex shrink-0 items-end self-stretch border-t border-line/60 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0"
          >
            <GlancePill label="Visits today" value={glance.visits} tone="info" />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function GlancePill({ label, value, tone }) {
  const valueColors = {
    danger: 'text-health-red',
    warning: 'text-health-amber',
    info: 'text-brand',
    default: 'text-ink',
  };
  return (
    <div className="flex min-w-[calc(50%-0.25rem)] flex-1 items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/90 px-3.5 py-2 shadow-sm sm:min-w-[88px] sm:flex-none">
      <span className="text-2xs text-ink-secondary">{label}</span>
      <span className={`text-lg font-medium tabular-nums ${valueColors[tone] ?? 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}

function DashboardModule({
  icon: Icon,
  iconTint,
  title,
  count,
  viewAllHref,
  emptyLabel,
  children,
}) {
  const rows = Array.isArray(children) ? children : [children].filter(Boolean);
  const hasRows = rows.length > 0;
  return (
    <GlassCard className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-line/50 px-4 py-3.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconTint}`}>
          <Icon />
        </span>
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        <span className="text-sm tabular-nums text-ink-tertiary">{count}</span>
        {count > 0 && viewAllHref && (
          <Link to={viewAllHref} className="ml-auto text-2xs font-medium text-brand hover:underline">
            View all
          </Link>
        )}
      </div>
      <ul className="divide-y divide-line/40">
        {hasRows ? (
          children
        ) : (
          <li className="px-4 py-8 text-center text-2xs text-ink-tertiary">{emptyLabel}</li>
        )}
      </ul>
    </GlassCard>
  );
}

function Avatar({ initials: label }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xs font-medium text-brand">
      {label}
    </span>
  );
}

function engagementRecordPath(engagementId) {
  if (engagementId == null || engagementId === '' || engagementId === 'undefined') return null;
  return `/engagements/${engagementId}`;
}

function DashboardListRow({ engagementId, onOpen, children, actions }) {
  const canOpen = Boolean(engagementRecordPath(engagementId));

  return (
    <li className="flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center">
      <button
        type="button"
        className={`flex min-w-0 w-full items-center gap-3 rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 sm:flex-1 sm:w-auto ${
          canOpen
            ? 'cursor-pointer hover:bg-black/[0.04] active:bg-black/[0.07]'
            : 'cursor-default'
        }`}
        onClick={() => {
          if (canOpen) onOpen?.();
        }}
        disabled={!canOpen}
        aria-label={canOpen ? 'Open engagement record' : undefined}
      >
        {children}
      </button>
      {actions ? (
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-end">
          {actions}
        </div>
      ) : null}
    </li>
  );
}

function DashboardRowIdentity({ row, subtitle }) {
  return (
    <>
      <Avatar initials={row.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{row.fullName}</div>
        <div className="truncate text-2xs text-ink-tertiary">{subtitle}</div>
      </div>
    </>
  );
}

function urgencyTextClass(urgency) {
  if (urgency === 'danger') return 'text-health-red';
  if (urgency === 'warning') return 'text-health-amber';
  return 'text-ink-tertiary';
}

function situationTextClass(situation, urgency) {
  if (situation === 'overdue' || (typeof situation === 'string' && situation.startsWith('overdue'))) {
    return 'text-health-red';
  }
  return urgencyTextClass(urgency);
}

function ActionButton({ label, onClick, variant = 'outline' }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`min-h-[44px] w-full shrink-0 rounded-lg px-3 py-2.5 text-2xs font-medium transition-colors sm:w-auto sm:min-h-0 sm:px-2.5 sm:py-1.5 ${
        variant === 'primary'
          ? 'bg-brand text-white hover:bg-brand-hover'
          : variant === 'success'
            ? 'bg-health-green text-white hover:opacity-90'
            : 'border border-line bg-white/90 text-ink-secondary hover:border-zinc-300 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function TaskRow({
  row,
  engagement,
  contactLoggingOpen,
  onOpen,
  onLogContact,
  onVisitDone,
  onLogDeliverable,
  onCloseContactLog,
  onApplyContactLog,
  onScheduleRequest,
  onContactLogError,
}) {
  const action =
    row.action === 'visit_done' ? (
      <ActionButton label="Visit done" onClick={onVisitDone} />
    ) : row.action === 'log_deliverable' ? (
      <ActionButton label="Log deliverable" onClick={onLogDeliverable} />
    ) : (
      <ActionButton label="Log contact" onClick={onLogContact} />
    );

  return (
    <>
      <DashboardListRow engagementId={row.engagementId} onOpen={onOpen} actions={action}>
        <DashboardRowIdentity
          row={row}
          subtitle={(
            <>
              {row.campaignName}
              <span className="text-ink-tertiary/60"> · </span>
              <span className={situationTextClass(row.situation, row.urgency)}>{row.situation}</span>
            </>
          )}
        />
      </DashboardListRow>
      {contactLoggingOpen && engagement && (
        <li className="border-t border-line/30 px-4 py-3">
          <InConversationCardLogging
            engagement={engagement}
            alwaysShowActions
            embedded
            onApply={onApplyContactLog}
            onError={onContactLogError}
            onScheduleRequest={() => onScheduleRequest?.(engagement)}
            onComplete={onCloseContactLog}
          />
        </li>
      )}
    </>
  );
}

function VisitRow({ row, onOpen, onRemind, onVisitDone }) {
  const timeVenue = row.visitTime
    ? `${row.visitTime} · ${row.venue}`
    : row.venue;

  return (
    <DashboardListRow
      engagementId={row.engagementId}
      onOpen={onOpen}
      actions={(
        <>
          <ActionButton label="Remind creator" onClick={onRemind} variant="success" />
          <ActionButton label="Visit done" onClick={onVisitDone} />
        </>
      )}
    >
      <DashboardRowIdentity row={row} subtitle={timeVenue} />
    </DashboardListRow>
  );
}

function DeliverableRow({ row, onOpen, onLog }) {
  return (
    <DashboardListRow
      engagementId={row.engagementId}
      onOpen={onOpen}
      actions={<ActionButton label="Log deliverable" onClick={onLog} />}
    >
      <DashboardRowIdentity
        row={row}
        subtitle={(
          <>
            <span className="capitalize">{row.deliverableType}</span>
            <span className="text-ink-tertiary/60"> · </span>
            <span className={situationTextClass(row.situation, row.urgency)}>{row.situation}</span>
          </>
        )}
      />
    </DashboardListRow>
  );
}

function AtRiskRow({
  row,
  engagement,
  contactLoggingOpen,
  onOpen,
  onLogContact,
  onVisitDone,
  onCloseContactLog,
  onApplyContactLog,
  onScheduleRequest,
  onContactLogError,
}) {
  const flagText = row.flagDetail ? `${row.flag} · ${row.flagDetail}` : row.flag;
  const action =
    row.action === 'visit_done' ? (
      <ActionButton label="Visit done" onClick={onVisitDone} />
    ) : (
      <ActionButton label="Log contact" onClick={onLogContact} />
    );

  return (
    <>
      <DashboardListRow engagementId={row.engagementId} onOpen={onOpen} actions={action}>
        <DashboardRowIdentity
          row={row}
          subtitle={(
            <>
              {row.campaignName}
              <span className="text-ink-tertiary/60"> · </span>
              <span className="text-health-amber">{flagText}</span>
            </>
          )}
        />
      </DashboardListRow>
      {contactLoggingOpen && engagement && (
        <li className="border-t border-line/30 px-4 py-3">
          <InConversationCardLogging
            engagement={engagement}
            alwaysShowActions
            embedded
            onApply={onApplyContactLog}
            onError={onContactLogError}
            onScheduleRequest={() => onScheduleRequest?.(engagement)}
            onComplete={onCloseContactLog}
          />
        </li>
      )}
    </>
  );
}

function CampaignTargetsSection({ campaigns }) {
  if (!campaigns.length) return null;

  return (
    <GlassCard className="px-4 py-4 sm:px-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-health-green">
          <IconTarget />
        </span>
        <h2 className="text-sm font-medium text-ink">Campaign targets</h2>
        <span className="text-2xs text-ink-tertiary">where you stand</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((c) => (
          <CampaignTargetColumn key={c.id} campaign={c} />
        ))}
      </div>
    </GlassCard>
  );
}

function CampaignTargetColumn({ campaign }) {
  const barColor =
    campaign.health === 'green'
      ? 'from-teal-400 to-health-green'
      : campaign.health === 'amber'
        ? 'from-amber-300 to-health-amber'
        : campaign.health === 'red'
          ? 'from-red-300 to-health-red'
          : 'from-zinc-200 to-zinc-300';

  const healthTextClass =
    campaign.health === 'green'
      ? 'text-health-green'
      : campaign.health === 'amber'
        ? 'text-health-amber'
        : campaign.health === 'red'
          ? 'text-health-red'
          : 'text-ink-tertiary';

  return (
    <Link
      to={`/campaigns/${campaign.id}`}
      className="group rounded-xl border border-line/40 bg-white/50 px-3 py-3 transition-colors hover:border-brand/20 hover:bg-white/80"
    >
      <div className="truncate text-sm font-medium text-ink group-hover:text-brand">
        {campaign.campaignName}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline text-2xs">
        <span className="text-base font-medium tabular-nums text-ink">{campaign.pct}%</span>
        <span className="px-1.5 text-ink-tertiary">·</span>
        <span className="tabular-nums text-ink-tertiary">
          {campaign.completed}/{campaign.target ?? '—'}
        </span>
        <span className="px-1.5 text-ink-tertiary">·</span>
        <span className={`font-medium ${healthTextClass}`}>{healthLabel(campaign.health)}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-[width]`}
          style={{ width: `${Math.min(100, Math.max(0, campaign.pct))}%` }}
        />
      </div>
      <span className={`mt-1 inline-flex items-center gap-1 text-[10px] ${healthTextClass}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${healthDotClass(campaign.health)}`} />
        {healthLabel(campaign.health)}
      </span>
    </Link>
  );
}

function iconClass() {
  return 'h-4 w-4';
}

function IconTasks() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function IconVisits() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

function IconDeliverables() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function IconAtRisk() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg className={iconClass()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
