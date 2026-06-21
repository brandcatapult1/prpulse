import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Toast } from '../components/ui/Primitives.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';
import { LogDeliverablePanel } from '../components/campaign/LogDeliverablePanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { logRepliedContact } from '../lib/contactLogging.js';
import {
  buildVisitDoneTransition,
  buildVisitReminderUrl,
  visitDoneToastMessage,
} from '../lib/visitLogging.js';
import { STAGE, transitionStage } from '../lib/engagementTransitions.js';
import { markDeliverablePostedToastMessage } from '../lib/deliverableLogging.js';
import {
  buildDashboardFromEngagements,
  dashboardDateLabel,
  dashboardGreeting,
  firstPendingDeliverable,
  MODULE_ROW_LIMIT,
} from '../lib/dashboardData.js';
import { healthDotClass, healthLabel } from '../lib/format.jsx';
import {
  patchEngagement,
  syncDeliverables,
  fetchDeliverables,
  fetchDashboardWorkspace,
  logVisitReminder,
} from '../lib/persistence.js';
import { setDeliverablesCache, getDeliverablesForEngagement, updateEngagementDeliverables } from '../lib/deliverablesCache.js';
import { getCachedContact, setContactsCache } from '../lib/contactsCache.js';
import {
  getDemoContacts,
  getDemoDeliverables,
  getDemoEngagement,
  mergeDashboardWorkspace,
} from '../lib/demo.js';
import {
  getEngagementOverride,
  saveDeliverablesOverride,
  saveEngagementOverride,
} from '../lib/demoStore.js';

export function DashboardPage() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [loggingDeliverable, setLoggingDeliverable] = useState(null);
  const [revision, setRevision] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardWorkspace();
      const merged = mergeDashboardWorkspace(data);
      if (merged._demo) {
        setContactsCache(getDemoContacts());
      }
      setDeliverablesCache(merged.deliverablesByEngagement ?? {});
      setWorkspace(merged);
      setRevision((r) => r + 1);
    } catch {
      const merged = mergeDashboardWorkspace(null);
      setContactsCache(getDemoContacts());
      setDeliverablesCache(merged.deliverablesByEngagement ?? {});
      setWorkspace(merged);
      setRevision((r) => r + 1);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDemoWorkspace = useCallback(() => {
    const merged = mergeDashboardWorkspace({ engagements: [] });
    setDeliverablesCache(merged.deliverablesByEngagement ?? {});
    setWorkspace(merged);
    setRevision((r) => r + 1);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const dashboard = useMemo(() => {
    if (!workspace || !user?.id) {
      return buildDashboardFromEngagements({
        userId: user?.id ?? '',
        engagements: [],
        campaigns: [],
        getDeliverables: getDeliverablesForEngagement,
      });
    }
    void revision;
    const managerId = workspace._demo ? workspace.previewManagerId : user.id;
    return buildDashboardFromEngagements({
      userId: managerId,
      engagements: workspace.engagements,
      campaigns: workspace.campaigns,
      getDeliverables: getDeliverablesForEngagement,
    });
  }, [workspace, user?.id, revision]);

  const firstName = user?.full_name?.split(/\s+/)[0] ?? 'there';

  const showActionToast = useCallback((message, onUndo) => {
    setToast({ message, onUndo });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 8000);
  }, []);

  const applyEngagementLogging = useCallback(
    async (engagementId, patch, message, snapshotKeys) => {
      if (workspace?._demo) {
        const base = {
          ...getDemoEngagement(engagementId),
          ...getEngagementOverride(engagementId),
        };
        const snapshot = {};
        for (const key of snapshotKeys) snapshot[key] = base[key];
        saveEngagementOverride(engagementId, patch);
        refreshDemoWorkspace();
        showActionToast(message, () => {
          saveEngagementOverride(engagementId, snapshot);
          refreshDemoWorkspace();
          setToast(null);
        });
        return;
      }

      const base = workspace?.engagements?.find((e) => e.id === engagementId);
      const snapshot = {};
      for (const key of snapshotKeys) snapshot[key] = base?.[key];
      try {
        await patchEngagement(engagementId, patch);
        await reload();
        showActionToast(message, async () => {
          await patchEngagement(engagementId, snapshot);
          await reload();
          setToast(null);
        });
      } catch (err) {
        showActionToast(err.message ?? 'Save failed', null);
      }
    },
    [workspace, reload, refreshDemoWorkspace, showActionToast],
  );

  const applyDeliverablesLogging = useCallback(
    async (engagementId, nextList, message) => {
      if (workspace?._demo) {
        const snapshot = getDemoDeliverables(engagementId).map((d) => ({ ...d }));
        saveDeliverablesOverride(engagementId, nextList);
        updateEngagementDeliverables(engagementId, nextList);
        refreshDemoWorkspace();
        showActionToast(message, () => {
          saveDeliverablesOverride(engagementId, snapshot);
          updateEngagementDeliverables(engagementId, snapshot);
          refreshDemoWorkspace();
          setToast(null);
        });
        return;
      }

      const beforeList = await fetchDeliverables(engagementId);
      try {
        const saved = await syncDeliverables(engagementId, beforeList, nextList);
        updateEngagementDeliverables(engagementId, saved);
        await reload();
        showActionToast(message, async () => {
          await syncDeliverables(engagementId, saved, beforeList);
          updateEngagementDeliverables(engagementId, beforeList);
          await reload();
          setToast(null);
        });
      } catch (err) {
        showActionToast(err.message ?? 'Save failed', null);
      }
    },
    [workspace, reload, refreshDemoWorkspace, showActionToast],
  );

  const handleLogContact = useCallback(
    (engagementId) => {
      const { patch, toastMessage } = logRepliedContact();
      applyEngagementLogging(engagementId, patch, toastMessage, Object.keys(patch));
    },
    [applyEngagementLogging],
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
      const deliverables = getDeliverablesForEngagement(engagementId);
      const nextList = deliverables.map((d) =>
        d.id === nextDeliverable.id ? nextDeliverable : d,
      );
      applyDeliverablesLogging(
        engagementId,
        nextList,
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

  if (loading && !workspace) {
    return (
      <div className="relative -m-4 flex min-h-[calc(100vh-3rem)] items-center justify-center md:-m-5">
        <p className="text-sm text-ink-secondary">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="relative -m-4 min-h-[calc(100vh-3rem)] overflow-hidden md:-m-5">
      <AuroraBackground />

      <div className="relative mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 md:px-5 md:py-6">
        <DemoBanner show={workspace?._demo} />

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
                  onLogContact={() => handleLogContact(row.engagementId)}
                  onVisitDone={() => handleVisitDone(row.engagementId)}
                  onLogDeliverable={() => handleLogDeliverableClick(row.engagementId)}
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
                  onLogContact={() => handleLogContact(row.engagementId)}
                  onVisitDone={() => handleVisitDone(row.engagementId)}
                  onLogDeliverable={() => handleLogDeliverableClick(row.engagementId)}
                />
              ))}
            </DashboardModule>
          </div>
        )}

        <CampaignTargetsSection campaigns={dashboard.campaignTargets} />
      </div>

      <LogDeliverablePanel
        deliverable={loggingDeliverable}
        open={Boolean(loggingDeliverable)}
        onClose={() => setLoggingDeliverable(null)}
        onConfirm={handleDeliverableConfirm}
      />

      {toast && <Toast message={toast.message ?? toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#f8f7fc] via-[#f4f5f8] to-[#f2f8f6]" />
      <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-violet-200/35 blur-3xl" />
      <div className="absolute -right-16 top-1/4 h-[360px] w-[360px] rounded-full bg-orange-200/30 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-[320px] w-[320px] rounded-full bg-teal-200/25 blur-3xl" />
    </div>
  );
}

function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-[22px] border border-white/70 bg-white/88 shadow-[0_4px_24px_rgba(26,29,38,0.06),0_1px_3px_rgba(26,29,38,0.04)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function DashboardHero({ greeting, dateLabel, actionCount, glance }) {
  return (
    <GlassCard className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-medium text-ink sm:text-2xl">{greeting}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {dateLabel}
          <span className="text-ink-tertiary"> · </span>
          <span className="font-medium text-ink">{actionCount}</span>
          {' '}
          {actionCount === 1 ? 'action' : 'actions'}
          {' '}
          to clear
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <GlancePill label="Overdue" value={glance.overdue} tone="danger" />
        <GlancePill label="Visit" value={glance.visits} tone="info" />
        <GlancePill label="Pending" value={glance.pending} tone="warning" />
      </div>
    </GlassCard>
  );
}

function GlancePill({ label, value, tone }) {
  const valueColors = {
    danger: 'text-health-red',
    warning: 'text-health-amber',
    info: 'text-brand',
  };
  return (
    <div className="flex min-w-[88px] items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/90 px-3.5 py-2 shadow-sm">
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

function urgencyTextClass(urgency) {
  if (urgency === 'danger') return 'text-health-red';
  if (urgency === 'warning') return 'text-health-amber';
  return 'text-ink-tertiary';
}

function ActionButton({ label, onClick, variant = 'outline' }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors ${
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

function TaskRow({ row, onLogContact, onVisitDone, onLogDeliverable }) {
  const action =
    row.action === 'visit_done' ? (
      <ActionButton label="Visit done" onClick={onVisitDone} variant="primary" />
    ) : row.action === 'log_deliverable' ? (
      <ActionButton label="Log deliverable" onClick={onLogDeliverable} />
    ) : (
      <ActionButton
        label="Log contact"
        onClick={onLogContact}
        variant={row.isOverdue ? 'primary' : 'outline'}
      />
    );

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        row.isOverdue ? 'bg-red-50/60' : ''
      }`}
    >
      <Avatar initials={row.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{row.fullName}</div>
        <div className="truncate text-2xs text-ink-tertiary">
          {row.campaignName}
          <span className="text-ink-tertiary/60"> · </span>
          <span className={urgencyTextClass(row.urgency)}>{row.situation}</span>
        </div>
      </div>
      {action}
    </li>
  );
}

function VisitRow({ row, onRemind, onVisitDone }) {
  const timeVenue = row.visitTime
    ? `${row.visitTime} · ${row.venue}`
    : row.venue;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar initials={row.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{row.fullName}</div>
        <div className="truncate text-2xs text-ink-tertiary">{timeVenue}</div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <ActionButton label="Remind creator" onClick={onRemind} variant="success" />
        <ActionButton label="Visit done" onClick={onVisitDone} />
      </div>
    </li>
  );
}

function DeliverableRow({ row, onLog }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar initials={row.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{row.fullName}</div>
        <div className="truncate text-2xs text-ink-tertiary">
          <span className="capitalize">{row.deliverableType}</span>
          <span className="text-ink-tertiary/60"> · </span>
          <span className={urgencyTextClass(row.urgency)}>{row.situation}</span>
        </div>
      </div>
      <ActionButton label="Log" onClick={onLog} />
    </li>
  );
}

function AtRiskRow({ row, onLogContact, onVisitDone, onLogDeliverable }) {
  const flagText = row.flagDetail ? `${row.flag} · ${row.flagDetail}` : row.flag;
  const action =
    row.action === 'visit_done' ? (
      <ActionButton label="Visit done" onClick={onVisitDone} />
    ) : row.action === 'log_deliverable' ? (
      <ActionButton label="Log deliverable" onClick={onLogDeliverable} />
    ) : (
      <ActionButton label="Log contact" onClick={onLogContact} />
    );

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar initials={row.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{row.fullName}</div>
        <div className="truncate text-2xs text-ink-tertiary">
          {row.campaignName}
          <span className="text-ink-tertiary/60"> · </span>
          <span className="text-health-amber">{flagText}</span>
        </div>
      </div>
      {action}
    </li>
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
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-2xs">
        <span className="text-base font-medium tabular-nums text-ink">{campaign.pct}%</span>
        <span className="text-ink-tertiary">
          ·
          {campaign.completed}
          /
          {campaign.target ?? '—'}
        </span>
        <span className={`font-medium ${healthTextClass}`}>· {healthLabel(campaign.health)}</span>
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
