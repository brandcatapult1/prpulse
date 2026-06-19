import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Primitives.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill, healthTone, formatDate } from '../lib/format.jsx';
import { MODULES, DASHBOARD_WIDGETS } from '../lib/modules.js';
import { dashboardApi } from '../lib/api.js';
import { MOCK_DASHBOARD } from '../data/mock.js';
import { mergeDashboard } from '../lib/demo.js';

export function DashboardPage() {
  const [data, setData] = useState(MOCK_DASHBOARD);
  const [demo, setDemo] = useState(true);
  const [activeWidget, setActiveWidget] = useState('followUps');

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
            <ActionRow key={item.id} name={item.full_name} meta={item.campaign_name} badge={formatDate(item.next_follow_up_date)} tone="warning" href={`/engagements/${item.id}`} />
          ))}
          {activeWidget === 'overdue' && overdue_deliverables.map((item) => (
            <ActionRow key={item.id} name={item.full_name} meta={`${item.deliverable_type} · ${item.campaign_name}`} badge="Overdue" tone="danger" />
          ))}
          {activeWidget === 'due' && deliverables_due.map((item) => (
            <ActionRow key={item.id} name={item.full_name} meta={`${item.deliverable_type} · ${item.campaign_name}`} badge={formatDate(item.due_date)} tone="info" />
          ))}
          {activeWidget === 'visits' && upcoming_visits.map((item) => (
            <ActionRow key={item.id} name={item.full_name} meta={`${item.visit_outlet ?? 'Visit'} · ${item.campaign_name}`} badge={formatDate(item.visit_date)} tone="info" href={`/engagements/${item.id}`} />
          ))}
          {activeWidget === 'stalled' && stalled_engagements.map((item) => (
            <ActionRow key={item.id} name={item.full_name} meta={`${item.campaign_name} · ${item.days_stalled}d no change`} badge="Stalled" tone="warning" href={`/engagements/${item.id}`} />
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
              <Pill tone={healthTone(c.campaign_health)}>
                {c.campaign_health === 'not_set' ? 'No target set' : c.campaign_health}
              </Pill>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ActionRow({ name, meta, badge, tone, href }) {
  const inner = (
    <>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">{name}</div>
        <div className="truncate text-2xs text-ink-tertiary">{meta}</div>
      </div>
      <div className="flex items-center gap-2">
        <Pill tone={tone}>{badge}</Pill>
        {href && <span className="text-2xs font-medium text-brand">Open</span>}
      </div>
    </>
  );
  return (
    <li className="py-2.5">
      {href ? (
        <Link to={href} className="flex items-center justify-between gap-3 hover:opacity-80">{inner}</Link>
      ) : (
        <div className="flex items-center justify-between gap-3">{inner}</div>
      )}
    </li>
  );
}
