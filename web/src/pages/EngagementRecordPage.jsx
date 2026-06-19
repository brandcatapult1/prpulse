import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Card,
  EmptyState,
  Modal,
  Toast,
} from '../components/ui/Primitives.jsx';
import { ExpandableSection, RatingStars, StatusButton } from '../components/ui/DataKit.jsx';
import {
  Pill,
  formatDate,
  formatFee,
  formatStatus,
  statusTone,
} from '../lib/format.jsx';
import { engagementsApi } from '../lib/api.js';
import {
  getDemoDeliverables,
  getDemoEngagement,
  getDemoTimeline,
  pickList,
  pickRecord,
} from '../lib/demo.js';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';

const statusOptions = [
  'not_contacted',
  'in_conversation',
  'scheduled',
  'no_response',
  'awaiting_final_deliverables',
  'collaboration_complete',
].map((v) => ({ value: v, label: formatStatus(v) }));

const interestOptions = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const deliverableStatusOptions = [
  'pending',
  'received',
  'approved',
  'posted',
].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

export function EngagementRecordPage() {
  const { id } = useParams();
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [demo, setDemo] = useState(true);
  const [engagement, setEngagement] = useState(() => getDemoEngagement(id));
  const [deliverables, setDeliverables] = useState(() => getDemoDeliverables(id));
  const [timeline, setTimeline] = useState(() => getDemoTimeline(id));

  useEffect(() => {
    if (!id) return;
    setEngagement(getDemoEngagement(id));
    setDeliverables(getDemoDeliverables(id));
    setTimeline(getDemoTimeline(id));
    setDemo(true);

    Promise.all([
      engagementsApi.get(id).catch(() => null),
      engagementsApi.deliverables(id).catch(() => []),
    ]).then(([eng, dels]) => {
      const engEmpty = !eng?.contact_name;
      const delsEmpty = !Array.isArray(dels) || dels.length === 0;
      setEngagement(pickRecord(eng, getDemoEngagement(id)));
      setDeliverables(pickList(dels, getDemoDeliverables(id)));
      setTimeline(getDemoTimeline(id));
      setDemo(engEmpty || delsEmpty);
    });
  }, [id]);

  const canComplete =
    deliverables.length > 0 && deliverables.every((d) => d.status === 'posted');

  const statusChoices = canComplete
    ? statusOptions
    : statusOptions.filter((o) => o.value !== 'collaboration_complete');

  const handleStatusChange = (next) => {
    if (next === 'scheduled') {
      setModal('visit');
      return;
    }
    setEngagement((e) => ({ ...e, conversation_status: next }));
    if (next === 'in_conversation') {
      setToast('Follow-up suggested: 3 days from today');
    }
    if (next === 'no_response') {
      setToast('Follow-up suggested: 7 days from today');
    }
  };

  const postedCount = deliverables.filter((d) => d.status === 'posted').length;
  const overdueCount = deliverables.filter((d) => d.is_overdue).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/campaigns/${engagement.campaign_id ?? 'c1'}`}
            className="text-2xs font-medium text-brand hover:underline"
          >
            ← Back to campaign
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            {engagement.contact_name}
          </h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {engagement.campaign_name} · {engagement.brand_name}
          </p>
        </div>
        <Pill tone={statusTone(engagement.conversation_status)}>
          {formatStatus(engagement.conversation_status)}
        </Pill>
      </div>

      <DemoBanner show={demo} />

      {/* Primary action cards — tap to open modals */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ActionCard
          title="Deliverables"
          subtitle={`${postedCount}/${deliverables.length} posted`}
          badge={overdueCount > 0 ? `${overdueCount} overdue` : null}
          badgeTone="danger"
          onClick={() => setModal('deliverables')}
        />
        <ActionCard
          title="Feedback"
          subtitle="Rate this collaboration"
          onClick={() => setModal('feedback')}
        />
        <ActionCard
          title="Visit"
          subtitle={engagement.visit_date ? formatDate(engagement.visit_date) : 'Schedule a visit'}
          onClick={() => setModal('visit')}
        />
        <ActionCard
          title="Timeline"
          subtitle={`${timeline.length} events`}
          onClick={() => setModal('timeline')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {/* Status & interest — card controls, not a flat form */}
          <Card elevated className="!p-5">
            <h2 className="text-sm font-semibold text-ink">Advance outreach</h2>
            <p className="mt-0.5 text-2xs text-ink-secondary">
              Update status and interest with one tap
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Status
                </label>
                <StatusButton
                  value={engagement.conversation_status}
                  options={statusChoices}
                  onChange={handleStatusChange}
                  hint={
                    !canComplete
                      ? 'Complete unlocks when all deliverables are Posted'
                      : undefined
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Interest
                </label>
                <ChipGroup
                  options={interestOptions}
                  value={engagement.interest_level}
                  onChange={(v) => setEngagement((e) => ({ ...e, interest_level: v }))}
                />
              </div>
            </div>
          </Card>

          {/* Details grid */}
          <Card elevated className="!p-5">
            <h2 className="text-sm font-semibold text-ink">Details</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Owner" value={engagement.owner_name} />
              <DetailItem label="Last contact" value={formatDate(engagement.last_contact_date)} />
              <DetailItem label="Next follow-up" value={formatDate(engagement.next_follow_up_date)} highlight />
              <DetailItem label="Agreed fee" value={formatFee(engagement.agreed_fee)} />
              <DetailItem
                label="Reason"
                value={engagement.primary_collaboration_reason ?? '—'}
                className="sm:col-span-2"
              />
            </dl>
          </Card>

          {/* Notes */}
          <Card elevated className="!p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Notes</h2>
              <button type="button" className="btn-ghost text-2xs">Edit</button>
            </div>
            <p className="mt-3 rounded-lg bg-canvas px-3 py-3 text-sm leading-relaxed text-ink-secondary">
              {engagement.notes || 'No notes yet — tap Edit to add context for the team.'}
            </p>
          </Card>
        </div>

        {/* Relationship context card */}
        <Card elevated className="h-fit !p-5">
          <h2 className="text-sm font-semibold text-ink">Relationship</h2>
          <p className="mt-0.5 text-2xs text-ink-secondary">From contact history</p>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-2xs text-ink-tertiary">Previous brands</dt>
              <dd className="mt-1 text-sm font-medium text-ink">BrandY, BrandZ</dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-tertiary">Avg rating</dt>
              <dd className="mt-1 flex items-center gap-2">
                <RatingStars value={4.3} />
                <span className="text-sm font-medium text-ink">4.3</span>
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-tertiary">Would work again</dt>
              <dd className="mt-1 text-sm font-medium text-ink">83%</dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-tertiary">Past collabs</dt>
              <dd className="mt-1 text-sm font-medium text-ink">6 total</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <Pill tone="success">Not blacklisted</Pill>
          </div>
        </Card>
      </div>

      <DeliverablesModal
        open={modal === 'deliverables'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        deliverables={deliverables}
        onAdd={() => setModal('add-deliverable')}
      />

      <AddDeliverableModal
        open={modal === 'add-deliverable'}
        onClose={() => setModal('deliverables')}
        contactName={engagement.contact_name}
      />

      <FeedbackModal
        open={modal === 'feedback'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
      />

      <VisitModal
        open={modal === 'visit'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        onSave={() => {
          setEngagement((e) => ({ ...e, conversation_status: 'scheduled' }));
          setModal(null);
          setToast('Visit saved — follow-up set to visit date');
        }}
      />

      <TimelineModal
        open={modal === 'timeline'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        entries={timeline}
      />

      {toast && (
        <Toast message={toast} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

function ActionCard({ title, subtitle, badge, badgeTone = 'default', onClick }) {
  return (
    <Card elevated interactive onClick={onClick} className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="mt-0.5 text-2xs text-ink-secondary">{subtitle}</div>
        </div>
        <span className="text-lg text-ink-tertiary" aria-hidden>→</span>
      </div>
      {badge && (
        <div className="mt-3">
          <Pill tone={badgeTone}>{badge}</Pill>
        </div>
      )}
    </Card>
  );
}

function ChipGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg border px-3 py-2 text-2xs font-medium transition-colors ${
            value === opt.value
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DetailItem({ label, value, highlight, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</dt>
      <dd className={`mt-1 text-sm font-medium ${highlight ? 'text-brand' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}

function DeliverablesModal({ open, onClose, contactName, deliverables, onAdd }) {
  return (
    <Modal
      open={open}
      title={`Deliverables · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-between">
          <button type="button" className="btn-secondary" onClick={onAdd}>
            + Add deliverable
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      {deliverables.length === 0 ? (
        <EmptyState
          title="No deliverables yet"
          description="Add reels, stories, or posts to track content delivery."
          action={
            <button type="button" className="btn-primary" onClick={onAdd}>
              Add first deliverable
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {deliverables.map((d) => (
            <Card key={d.id} elevated className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold capitalize text-ink">
                    {d.deliverable_type} ×{d.quantity}
                  </div>
                  <div className="mt-0.5 text-2xs text-ink-tertiary">
                    Due {formatDate(d.due_date)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {d.is_overdue && <Pill tone="danger">Overdue</Pill>}
                  <StatusButton
                    value={d.status}
                    options={deliverableStatusOptions}
                  />
                </div>
              </div>
              <div className="mt-3">
                <ExpandableSection title="Proof & details">
                <div className="space-y-2">
                  <button type="button" className="btn-secondary w-full justify-center">
                    Upload screenshots
                  </button>
                  <button type="button" className="btn-secondary w-full justify-center">
                    Add content link
                  </button>
                </div>
                </ExpandableSection>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AddDeliverableModal({ open, onClose, contactName }) {
  return (
    <Modal
      open={open}
      title={`Add deliverable · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onClose}>Add</button>
        </div>
      }
    >
      <div className="grid gap-3">
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Type</label>
          <select className="input-field">
            <option>Reel</option>
            <option>Story</option>
            <option>Post</option>
            <option>Video</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Quantity</label>
          <input type="number" className="input-field" defaultValue={1} min={1} />
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Due date</label>
          <input type="date" className="input-field" />
        </div>
      </div>
    </Modal>
  );
}

function FeedbackModal({ open, onClose, contactName }) {
  return (
    <Modal
      open={open}
      title={`Feedback · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onClose}>Save feedback</button>
        </div>
      }
    >
      <div className="space-y-4">
        {[
          ['Content quality', 4],
          ['Professionalism', 5],
          ['Timeliness', 4],
        ].map(([label, stars]) => (
          <div key={label} className="flex items-center justify-between rounded-lg border border-line bg-canvas px-4 py-3">
            <span className="text-sm text-ink">{label}</span>
            <RatingStars value={stars} />
          </div>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleCard label="Adherence to terms" />
          <ToggleCard label="Would work again" defaultYes />
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Internal notes</label>
          <textarea
            className="input-field min-h-[80px] py-2"
            placeholder="Optional notes for the team…"
          />
        </div>
      </div>
    </Modal>
  );
}

function ToggleCard({ label, defaultYes = false }) {
  const [yes, setYes] = useState(defaultYes);
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <div className="text-2xs font-medium text-ink-secondary">{label}</div>
      <div className="mt-2 flex gap-2">
        {['Yes', 'No'].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setYes(opt === 'Yes')}
            className={`flex-1 rounded-md border py-2 text-2xs font-medium transition-colors ${
              (opt === 'Yes') === yes
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function VisitModal({ open, onClose, contactName, onSave }) {
  return (
    <Modal
      open={open}
      title={`Visit · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onSave}>Save visit</button>
        </div>
      }
    >
      <p className="mb-4 text-2xs text-ink-secondary">
        Required when status is Scheduled. Follow-up will be set to the visit date.
      </p>
      <div className="grid gap-3">
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Visit date *</label>
          <input type="date" className="input-field" required />
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Time</label>
          <input type="time" className="input-field" />
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Outlet / location</label>
          <input className="input-field" placeholder="e.g. Connaught Place outlet" />
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Notes</label>
          <textarea className="input-field min-h-[72px] py-2" placeholder="What to cover at the visit…" />
        </div>
      </div>
    </Modal>
  );
}

function TimelineModal({ open, onClose, contactName, entries }) {
  return (
    <Modal
      open={open}
      title={`Timeline · ${contactName}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn-primary ml-auto" onClick={onClose}>Close</button>
      }
    >
      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id} elevated className="!p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-ink">{entry.action}</div>
                <div className="mt-0.5 text-2xs text-ink-tertiary">
                  {entry.user_name} · {formatDate(entry.occurred_at)}
                </div>
              </div>
              {entry.status_change && (
                <Pill tone="info">{entry.status_change}</Pill>
              )}
            </div>
            {entry.notes && (
              <p className="mt-2 text-2xs text-ink-secondary">{entry.notes}</p>
            )}
          </Card>
        ))}
      </div>
    </Modal>
  );
}

export function PlaceholderPage({ title, description }) {
  return (
    <div className="mx-auto max-w-lg">
      <Card elevated className="px-6 py-12 text-center">
        <h1 className="text-sm font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-2xs text-ink-secondary">{description}</p>
      </Card>
    </div>
  );
}
