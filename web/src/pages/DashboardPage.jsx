import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Primitives.jsx';
import { Pill, healthTone, formatDate } from '../lib/format.jsx';
import { dashboardApi } from '../lib/api.js';
import { MOCK_DASHBOARD } from '../data/mock.js';

export function DashboardPage() {
  const [data, setData] = useState(MOCK_DASHBOARD);
  const [live, setLive] = useState(false);

  useEffect(() => {
    dashboardApi
      .get()
      .then((d) => {
        setData({
          follow_ups_due: d.follow_ups_due.map((r) => ({
            ...r,
            full_name: r.full_name ?? r.contact_name,
          })),
          overdue_deliverables: d.overdue_deliverables,
          active_campaigns: d.active_campaigns,
        });
        setLive(true);
      })
      .catch(() => setLive(false));
  }, []);

  const { follow_ups_due, overdue_deliverables, active_campaigns } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub mt-0.5">
          What needs action today{live ? '' : ' · showing sample data until your database has records'}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActionCard title="Follow-ups due" count={follow_ups_due.length} empty="No follow-ups due">
          {follow_ups_due.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{item.full_name}</div>
                <div className="truncate text-2xs text-ink-tertiary">{item.campaign_name}</div>
              </div>
              <Pill tone="warning">{formatDate(item.next_follow_up_date)}</Pill>
            </li>
          ))}
        </ActionCard>

        <ActionCard title="Overdue deliverables" count={overdue_deliverables.length} empty="Nothing overdue">
          {overdue_deliverables.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{item.full_name}</div>
                <div className="truncate text-2xs text-ink-tertiary">
                  {item.deliverable_type} · {item.campaign_name}
                </div>
              </div>
              <Pill tone="danger">Overdue</Pill>
            </li>
          ))}
        </ActionCard>

        <ActionCard title="Active campaigns" count={active_campaigns.length} empty="No active campaigns">
          {active_campaigns.map((c) => (
            <li key={c.id} className="py-2.5">
              <Link to={`/campaigns/${c.id}`} className="flex items-center justify-between gap-3 hover:opacity-80">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{c.campaign_name}</div>
                  <div className="text-2xs text-ink-tertiary">
                    {c.completed_collaborations}/{c.target_collaborations ?? '—'} complete
                  </div>
                </div>
                <Pill tone={healthTone(c.campaign_health)}>
                  {c.campaign_health === 'not_set' ? 'Not set' : `${c.achievement_pct ?? 0}%`}
                </Pill>
              </Link>
            </li>
          ))}
        </ActionCard>
      </div>
    </div>
  );
}

function ActionCard({ title, count, empty, children }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        <span className="text-2xs tabular-nums text-ink-tertiary">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-2xs text-ink-tertiary">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </Card>
  );
}
