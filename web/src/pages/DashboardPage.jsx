import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Toast } from '../components/ui/Primitives.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { HealthBadge } from '../components/ui/HealthBadge.jsx';
import { Pill, formatDate } from '../lib/format.jsx';
import { MODULES, DASHBOARD_WIDGETS } from '../lib/modules.js';
import { dashboardApi } from '../lib/api.js';
import { MOCK_DASHBOARD } from '../data/mock.js';
import { mergeDashboard } from '../lib/demo.js';
import { addDaysIso, todayIso } from '../lib/dates.js';
import { saveEngagementOverride } from '../lib/demoStore.js';

export function DashboardPage() {
  const [data, setData] = useState(MOCK_DASHBOARD);
  const [demo, setDemo] = useState(true);
  const [activeWidget, setActiveWidget] = useState('followUps');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    dashboardApi
      .get()
      .then((d) => {
        const merged = mergeDashboard({
          ...d,
          deliverables_due: d.deliverables_due ?? [],
          upcoming_visits: d.upcoming_visits ?? [],
          stalled_engagements: d.stalled_engagements ?? [],
        });
        setData(merged);
        setDemo(merged._demo);
      })
      .catch(() => {
        setData({ ...MOCK_DASHBOARD, _demo: true });
        setDemo(true);
      });
  }, []);

  const logContact = useCallback((engagementId) => {
    saveEngagementOverride(engagementId, { last_contact_date: todayIso() });
    setData((prev) => ({
      ...prev,
      follow_ups_due: prev.follow_ups_due.map((item) =>
        item.id === engagementId ? { ...item, last_contact_date: todayIso() } : item,
      ),
    }));
    setToast('Contact logged for today');
  }, []);

  const snoozeFollowUp = useCallback((engagementId, currentDate) => {
    const base = currentDate || todayIso();
    const next = addDaysIsoFrom(base, 3);
    saveEngagementOverride(engagementId, { next_follow_up_date: next });
    setData((prev) => ({
      ...prev,
      follow_ups_due: prev.follow_ups_due
        .map((item) =>
          item.id === engagementId ? { ...item, next_follow_up_date: next } : item,
        )
        .filter((item) => item.next_follow_up_date <= todayIso() || item.id !== engagementId),
    }));
    setToast(`Follow-up snoozed to ${formatDate(next)}`);
  }, []);

  const {
    follow_ups_due,
    overdue_deliverables,
    deliverables_due,
    upcoming_visits,
    stalled_engagements,
    active_campaigns,
  } = data;

  const widgets = [
    { id: 'followUps', label: DASHBOARD_WIDGETS.followUpsDueToday, count: follow_ups_due.length },
    { id: 'overdue', label: DASHBOARD_WIDGETS.overdueDeliverables, count: overdue_deliverables.length },
    { id: 'due', label: DASHBOARD_WIDGETS.deliverablesDue, count: deliverables_due.length },
    { id: 'visits', label: DASHBOARD_WIDGETS.upcomingVisits, count: upcoming_visits.length },
    { id: 'stalled', label: DASHBOARD_WIDGETS.stalled, count: stalled_engagements.length },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={MODULES.dashboard.pageTitle} subtitle={MODULES.dashboard.subtitle} />

      <DemoBanner show={demo} />

      <div className="flex flex-wrap gap-2">
        {widgets.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setActiveWidget(w.id)}
            className={`rounded-md border px-3 py-2 text-left transition-colors ${
              activeWidget === w.id
                ? 'border-brand/30 bg-brand-soft'
                : 'border-line bg-white hover:border-zinc-300'
            }`}
          >
            <div className="text-2xs text-ink-tertiary">{w.label}</div>
            <div className="text-lg font-semibold tabular-nums text-ink">{w.count}</div>
          </button>
        ))}
      </div>

      <Card>
        <h2 className="text-sm font-medium text-ink">Action list</h2>
        <ul className="mt-3 divide-y divide-line">
          {activeWidget === 'followUps' && follow_ups_due.map((item) => (
            <ActionRow
              key={item.id}
              name={item.full_name}
              meta={`${item.campaign_name} · ${formatStatusLabel(item.conversation_status)} · due ${formatDate(item.next_follow_up_date)}`}
              badge={formatDate(item.next_follow_up_date)}
              tone="warning"
              href={`/engagements/${item.id}`}
              actions={
                <>
                  <button type="button" className="btn-ghost !px-2 !py-1 text-2xs" onClick={() => logContact(item.id)}>
                    Log contact
                  </button>
                  <button type="button" className="btn-ghost !px-2 !py-1 text-2xs" onClick={() => snoozeFollowUp(item.id, item.next_follow_up_date)}>
                    Snooze +3d
                  </button>
                </>
              }
            />
          ))}
          {activeWidget === 'overdue' && overdue_deliverables.map((item) => (
            <ActionRow
              key={item.id}
              name={item.full_name}
              meta={`${item.deliverable_type} · ${item.campaign_name}`}
              badge="Overdue"
              tone="danger"
              href={`/engagements/${item.engagement_id}`}
            />
          ))}
          {activeWidget === 'due' && deliverables_due.map((item) => (
            <ActionRow
              key={item.id}
              name={item.full_name}
              meta={`${item.deliverable_type} · ${item.campaign_name}`}
              badge={formatDate(item.due_date)}
              tone="info"
              href={`/engagements/${item.engagement_id}`}
            />
          ))}
          {activeWidget === 'visits' && upcoming_visits.map((item) => (
            <ActionRow
              key={item.id}
              name={item.full_name}
              meta={`${item.visit_outlet ?? 'Visit'} · ${item.campaign_name}`}
              badge={formatDate(item.visit_date)}
              tone="info"
              href={`/engagements/${item.id}`}
            />
          ))}
          {activeWidget === 'stalled' && stalled_engagements.map((item) => (
            <ActionRow
              key={item.id}
              name={item.full_name}
              meta={`${item.campaign_name} · ${item.days_stalled}d no change`}
              badge="Stalled"
              tone="warning"
              href={`/engagements/${item.id}`}
            />
          ))}
          {widgets.find((w) => w.id === activeWidget)?.count === 0 && (
            <li className="py-6 text-center text-2xs text-ink-tertiary">No items in this widget</li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-ink">{DASHBOARD_WIDGETS.campaignTargetTracker}</h2>
        <ul className="mt-3 divide-y divide-line">
          {active_campaigns.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link to={`/campaigns/${c.id}`} className="min-w-0 hover:text-brand">
                <div className="truncate text-sm font-medium text-ink">{c.campaign_name}</div>
                <div className="text-2xs text-ink-tertiary">
                  {c.completed_collaborations}/{c.target_collaborations ?? '—'} · {c.achievement_pct ?? 0}%
                </div>
              </Link>
              <HealthBadge health={c.campaign_health} />
            </li>
          ))}
        </ul>
      </Card>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function ActionRow({ name, meta, badge, tone, href, actions }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {href ? (
          <Link to={href} className="min-w-0 flex-1 hover:text-brand">
            <div className="truncate text-sm font-medium text-ink">{name}</div>
            <div className="truncate text-2xs text-ink-tertiary">{meta}</div>
          </Link>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{name}</div>
            <div className="truncate text-2xs text-ink-tertiary">{meta}</div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions}
          <Pill tone={tone}>{badge}</Pill>
          {href && (
            <Link to={href} className="text-2xs font-medium text-brand hover:underline">
              Open
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function formatStatusLabel(status) {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function addDaysIsoFrom(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
