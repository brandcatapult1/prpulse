import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Drawer } from '../components/ui/Primitives.jsx';
import { StatusButton, QuickAction } from '../components/ui/DataKit.jsx';
import { Pill, formatDate, formatFee, formatStatus } from '../lib/format.jsx';
import { engagementsApi } from '../lib/api.js';
import { MOCK_ENGAGEMENT, MOCK_DELIVERABLES } from '../data/mock.js';

const statusOptions = [
  'not_contacted', 'in_conversation', 'scheduled', 'no_response',
  'awaiting_final_deliverables', 'collaboration_complete',
].map((v) => ({ value: v, label: formatStatus(v) }));

export function EngagementRecordPage() {
  const { id } = useParams();
  const [drawer, setDrawer] = useState(null);
  const [engagement, setEngagement] = useState(MOCK_ENGAGEMENT);
  const [deliverables, setDeliverables] = useState(MOCK_DELIVERABLES);

  useEffect(() => {
    if (!id) return;
    engagementsApi.get(id).then(setEngagement).catch(() => {});
    engagementsApi.deliverables(id).then((d) => { if (d.length) setDeliverables(d); }).catch(() => {});
  }, [id]);

  const canComplete =
    deliverables.length > 0 && deliverables.every((d) => d.status === 'posted');

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_260px]">
      <div className="panel p-5">
        <div className="mb-5 border-b border-line pb-4">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {engagement.contact_name}
          </h1>
          <p className="text-2xs text-ink-secondary">
            {engagement.campaign_name} · {engagement.brand_name}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <StatusButton
              value={engagement.conversation_status}
              options={statusOptions}
              disabled={!canComplete && engagement.conversation_status !== 'collaboration_complete'}
              hint={!canComplete ? 'All deliverables must be Posted before completing' : undefined}
            />
          </Field>
          <Field label="Interest">
            <StatusButton
              value={engagement.interest_level}
              options={[
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
            />
          </Field>
          <Field label="Owner">{engagement.owner_name}</Field>
          <Field label="Last contact">{formatDate(engagement.last_contact_date)}</Field>
          <Field label="Next follow-up">{formatDate(engagement.next_follow_up_date)}</Field>
          <Field label="Agreed fee">{formatFee(engagement.agreed_fee)}</Field>
        </div>

        {engagement.notes && (
          <div className="mt-4 rounded-md bg-canvas px-3 py-2.5">
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Notes</div>
            <p className="mt-1 text-sm text-ink-secondary">{engagement.notes}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <QuickAction label={`Deliverables ${deliverables.length}`} onClick={() => setDrawer('deliverables')} active={drawer === 'deliverables'} />
          <QuickAction label="Feedback" onClick={() => setDrawer('feedback')} />
          <QuickAction label="Visit" onClick={() => setDrawer('visit')} />
          <QuickAction label="Timeline" onClick={() => setDrawer('timeline')} />
        </div>
      </div>

      <aside className="panel h-fit p-4">
        <h2 className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Relationship</h2>
        <dl className="mt-3 space-y-3 text-2xs">
          <div>
            <dt className="text-ink-tertiary">Previous brands</dt>
            <dd className="mt-0.5 font-medium text-ink">BrandY, BrandZ</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Avg rating</dt>
            <dd className="mt-0.5 font-medium text-ink">4.3</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Would work again</dt>
            <dd className="mt-0.5 font-medium text-ink">83%</dd>
          </div>
          <Pill tone="success">Not blacklisted</Pill>
        </dl>
      </aside>

      <DeliverablesDrawer
        open={drawer === 'deliverables'}
        onClose={() => setDrawer(null)}
        contactName={engagement.contact_name}
        deliverables={deliverables}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1.5 text-sm text-ink">{children}</div>
    </div>
  );
}

function DeliverablesDrawer({ open, onClose, contactName, deliverables }) {
  return (
    <Drawer open={open} title={`Deliverables · ${contactName}`} onClose={onClose} footer={<QuickAction label="+ Add deliverable" />}>
      <div className="space-y-2">
        {deliverables.map((d) => (
          <Card key={d.id} className="!p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium capitalize text-ink">{d.deliverable_type} ×{d.quantity}</div>
                <div className="text-2xs text-ink-tertiary">Due {formatDate(d.due_date)}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {d.is_overdue && <Pill tone="danger">Overdue</Pill>}
                <Pill tone={d.status === 'posted' ? 'success' : 'default'}>{d.status}</Pill>
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
    <div className="mx-auto max-w-lg">
      <div className="panel px-6 py-12 text-center">
        <h1 className="text-sm font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-2xs text-ink-secondary">{description}</p>
      </div>
    </div>
  );
}
