import { Card } from '../ui/Primitives.jsx';
import { Pill, healthTone, formatDate } from '../../lib/format.js';
import { MOCK_DASHBOARD } from '../../data/mock.js';

export function DashboardPage() {
  const { follow_ups_due, overdue_deliverables, active_campaigns } = MOCK_DASHBOARD;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">What needs action today</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Follow-ups due</h2>
          <ul className="mt-3 space-y-2">
            {follow_ups_due.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{item.full_name}</div>
                  <div className="text-xs text-slate-500">{item.campaign_name}</div>
                </div>
                <Pill tone="warning">{formatDate(item.next_follow_up_date)}</Pill>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Overdue deliverables</h2>
          <ul className="mt-3 space-y-2">
            {overdue_deliverables.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{item.full_name}</div>
                  <div className="text-xs text-slate-500">{item.deliverable_type} · {item.campaign_name}</div>
                </div>
                <Pill tone="danger">Overdue</Pill>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Active campaigns</h2>
          <ul className="mt-3 space-y-2">
            {active_campaigns.map((c) => (
              <li key={c.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.campaign_name}</span>
                  <Pill tone={healthTone(c.campaign_health)}>{c.achievement_pct ?? 0}%</Pill>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {c.completed_collaborations}/{c.target_collaborations} complete
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
