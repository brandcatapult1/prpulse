import { useState } from 'react';
import { Card, Drawer } from '../components/ui/Primitives.jsx';
import { StatusButton, QuickAction } from '../components/ui/DataKit.jsx';
import { Pill, formatDate, formatFee, formatStatus } from '../lib/format.js';
import { MOCK_ENGAGEMENT, MOCK_DELIVERABLES } from '../data/mock.js';

const statusOptions = [
  'not_contacted', 'in_conversation', 'scheduled', 'no_response',
  'awaiting_final_deliverables', 'collaboration_complete',
].map((v) => ({ value: v, label: formatStatus(v) }));

export function EngagementRecordPage() {
  const [drawer, setDrawer] = useState(null);
  const e = MOCK_ENGAGEMENT;
  const canComplete = MOCK_DELIVERABLES.every((d) => d.status === 'posted') && MOCK_DELIVERABLES.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div className="rounded-lg border border-surface-border bg-white p-5">
          <h1 className="text-lg font-semibold">{e.contact_name} · {e.campaign_name}</h1>
          <p className="text-sm text-slate-500">{e.brand_name}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <StatusButton
                value={e.conversation_status}
                options={statusOptions}
                disabled={!canComplete && false}
                hint={!canComplete ? 'Complete disabled until all deliverables are Posted' : undefined}
              />
            </Field>
            <Field label="Interest">
              <StatusButton value={e.interest_level} options={[
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]} />
            </Field>
            <Field label="Owner">{e.owner_name}</Field>
            <Field label="Last contact">{formatDate(e.last_contact_date)}</Field>
            <Field label="Next follow-up">{formatDate(e.next_follow_up_date)}</Field>
            <Field label="Agreed fee">{formatFee(e.agreed_fee)}</Field>
          </div>

          <div className="mt-4">
            <Field label="Notes">{e.notes}</Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <QuickAction label={`Deliverables ${MOCK_DELIVERABLES.length}`} onClick={() => setDrawer('deliverables')} />
            <QuickAction label="Feedback" onClick={() => setDrawer('feedback')} />
            <QuickAction label="Visit" onClick={() => setDrawer('visit')} />
            <QuickAction label="Timeline" onClick={() => setDrawer('timeline')} />
          </div>
        </div>
      </div>

      <aside className="rounded-lg border border-surface-border bg-white p-4 h-fit">
        <h2 className="text-sm font-semibold">Relationship context</h2>
        <dl className="mt-3 space-y-2 text-sm text-slate-600">
          <div><dt className="text-xs uppercase text-slate-400">Prev brands</dt><dd>BrandY, BrandZ</dd></div>
          <div><dt className="text-xs uppercase text-slate-400">Avg rating</dt><dd>4.3</dd></div>
          <div><dt className="text-xs uppercase text-slate-400">Would work again</dt><dd>83%</dd></div>
          <div><Pill tone="success">Not blacklisted</Pill></div>
        </dl>
      </aside>

      <DeliverablesDrawer open={drawer === 'deliverables'} onClose={() => setDrawer(null)} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{children}</div>
    </div>
  );
}

function DeliverablesDrawer({ open, onClose }) {
  return (
    <Drawer open={open} title="Deliverables (Aisha K.)" onClose={onClose} footer={<QuickAction label="+ Add deliverable" />}>
      <div className="space-y-3">
        {MOCK_DELIVERABLES.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium capitalize">{d.deliverable_type} ×{d.quantity}</div>
                <div className="text-xs text-slate-500">Due {formatDate(d.due_date)}</div>
              </div>
              <div className="flex items-center gap-2">
                {d.is_overdue && <Pill tone="danger">Overdue</Pill>}
                <Pill>{d.status}</Pill>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Drawer>
  );
}

export function PlaceholderPage({ title, description }) {
  return (
    <div className="rounded-lg border border-dashed border-surface-border bg-white p-10 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}
