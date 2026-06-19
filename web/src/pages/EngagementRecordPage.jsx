import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Card,
  EmptyState,
  Modal,
  Toast,
} from '../components/ui/Primitives.jsx';
import { ExpandableSection, RatingStars, StatusButton } from '../components/ui/DataKit.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import {
  Pill,
  formatDate,
  formatFee,
  formatStatus,
  statusTone,
} from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { addDaysIso, toDateInputValue } from '../lib/dates.js';
import { engagementsApi } from '../lib/api.js';
import {
  getDemoDeliverables,
  getDemoEngagement,
  getDemoTimeline,
  pickList,
  pickRecord,
  saveDeliverablesOverride,
  saveEngagementOverride,
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

const DELIVERABLE_TYPES = [
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'post', label: 'Post' },
  { value: 'video', label: 'Video' },
];

const FOLLOW_UP_SUGGESTIONS = {
  in_conversation: { days: 3, label: '3 days from today' },
  no_response: { days: 7, label: '7 days from today' },
};

export function EngagementRecordPage() {
  const { id } = useParams();
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [demo, setDemo] = useState(true);
  const [followUpSuggestion, setFollowUpSuggestion] = useState(null);
  const [addDeliverableType, setAddDeliverableType] = useState('reel');
  const [engagement, setEngagement] = useState(() => getDemoEngagement(id));
  const [deliverables, setDeliverables] = useState(() => getDemoDeliverables(id));
  const [timeline, setTimeline] = useState(() => getDemoTimeline(id));
  const [saving, setSaving] = useState(false);

  const persistEngagement = async (patch, { silent = false } = {}) => {
    let next;
    setEngagement((prev) => {
      next = { ...prev, ...patch };
      return next;
    });

    if (demo) {
      saveEngagementOverride(id, next);
      if (!silent) setToast('Saved');
      return;
    }

    setSaving(true);
    try {
      const saved = await engagementsApi.update(id, patch);
      setEngagement((prev) => ({
        ...prev,
        ...saved,
        contact_name: prev.contact_name,
        campaign_name: prev.campaign_name,
        brand_name: prev.brand_name,
        owner_name: prev.owner_name,
        campaign_id: prev.campaign_id,
      }));
      if (!silent) setToast('Saved');
    } catch {
      setToast('Could not save — please try again');
    } finally {
      setSaving(false);
    }
  };

  const persistDeliverables = (list) => {
    setDeliverables(list);
    if (demo) saveDeliverablesOverride(id, list);
  };

  useEffect(() => {
    if (!id) return;
    setEngagement(getDemoEngagement(id));
    setDeliverables(getDemoDeliverables(id));
    setTimeline(getDemoTimeline(id));
    setDemo(true);
    setFollowUpSuggestion(null);

    Promise.all([
      engagementsApi.get(id).catch(() => null),
      engagementsApi.deliverables(id).catch(() => []),
    ]).then(([eng, dels]) => {
      const engEmpty = !eng?.contact_name;
      const delsEmpty = !Array.isArray(dels) || dels.length === 0;
      const usingDemo = engEmpty || delsEmpty;
      setDemo(usingDemo);
      setEngagement(
        usingDemo ? getDemoEngagement(id) : mergeEngagementFromApi(eng, id),
      );
      setDeliverables(
        usingDemo ? getDemoDeliverables(id) : pickList(dels, getDemoDeliverables(id)),
      );
      setTimeline(getDemoTimeline(id));
    });
  }, [id]);

  function mergeEngagementFromApi(apiRow, engagementId) {
    const base = pickRecord(apiRow, getDemoEngagement(engagementId));
    return { ...base, ...apiRow, contact_name: apiRow.contact_name ?? base.contact_name };
  }

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

    const patch = { conversation_status: next };
    const rule = FOLLOW_UP_SUGGESTIONS[next];
    if (rule) {
      setFollowUpSuggestion({
        date: addDaysIso(rule.days),
        label: rule.label,
      });
    } else if (next === 'collaboration_complete' || next.startsWith('dropped_')) {
      setFollowUpSuggestion(null);
      patch.next_follow_up_date = null;
    }

    persistEngagement(patch);
  };

  const handleFollowUpChange = (date) => {
    if (date === followUpSuggestion?.date) setFollowUpSuggestion(null);
    persistEngagement({ next_follow_up_date: date || null });
  };

  const acceptFollowUpSuggestion = () => {
    if (!followUpSuggestion) return;
    const { date } = followUpSuggestion;
    setFollowUpSuggestion(null);
    persistEngagement({ next_follow_up_date: date }, { silent: true });
    setToast(`Follow-up set to ${formatDate(date)}`);
  };

  const openAddDeliverable = (type = 'reel') => {
    setAddDeliverableType(type);
    setModal('add-deliverable');
  };

  const handleAddDeliverable = ({ type, quantity, dueDate }) => {
    const newItem = {
      id: `d-${Date.now()}`,
      deliverable_type: type,
      quantity: Number(quantity) || 1,
      due_date: dueDate || addDaysIso(7),
      status: 'pending',
      is_overdue: false,
    };
    persistDeliverables([...deliverables, newItem]);
    setModal(null);
    setToast(`Added ${type} ×${newItem.quantity}`);
  };

  const postedCount = deliverables.filter((d) => d.status === 'posted').length;
  const overdueCount = deliverables.filter((d) => d.is_overdue).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={engagement.contact_name}
        subtitle={`${MODULES.engagementRecord.pageTitle} · ${engagement.campaign_name} · ${engagement.brand_name}`}
        actions={
          <Link
            to={`/campaigns/${engagement.campaign_id ?? 'c1'}`}
            className="btn-secondary"
          >
            ← Campaign
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={statusTone(engagement.conversation_status)}>
          {formatStatus(engagement.conversation_status)}
        </Pill>
        <span className="text-2xs text-ink-tertiary">{MODULES.engagementRecord.subtitle}</span>
      </div>

      <DemoBanner show={demo} />
      {saving && (
        <p className="text-2xs text-ink-tertiary">Saving…</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard title="Feedback" subtitle="Rate this collaboration" onClick={() => setModal('feedback')} />
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
          <Card elevated className="!p-5">
            <h2 className="text-sm font-semibold text-ink">Advance outreach</h2>
            <p className="mt-0.5 text-2xs text-ink-secondary">Update status and interest</p>
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
                  onChange={(v) => persistEngagement({ interest_level: v })}
                />
              </div>
            </div>
          </Card>

          <Card elevated className="!p-5">
            <h2 className="text-sm font-semibold text-ink">Details</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Owner" value={engagement.owner_name} />
              <DetailItem label="Last contact" value={formatDate(engagement.last_contact_date)} />
              <FollowUpField
                value={engagement.next_follow_up_date}
                suggestion={followUpSuggestion}
                onChange={handleFollowUpChange}
                onAccept={acceptFollowUpSuggestion}
                onDismiss={() => setFollowUpSuggestion(null)}
              />
              <DetailItem label="Agreed fee" value={formatFee(engagement.agreed_fee)} />
              <DetailItem
                label="Reason"
                value={engagement.primary_collaboration_reason ?? '—'}
                className="sm:col-span-2"
              />
            </dl>
          </Card>

          <Card elevated className="!p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Deliverables</h2>
                <p className="mt-0.5 text-2xs text-ink-secondary">
                  What content did you agree on with this creator?
                </p>
              </div>
              <Pill tone={deliverables.length ? 'info' : 'muted'}>
                {postedCount}/{deliverables.length} posted
              </Pill>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-2xs font-medium text-ink-tertiary">Add content type</p>
              <div className="flex flex-wrap gap-2">
                {DELIVERABLE_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className="btn-secondary"
                    onClick={() => openAddDeliverable(value)}
                  >
                    + {label}
                  </button>
                ))}
                <button type="button" className="btn-ghost" onClick={() => setModal('deliverables')}>
                  View all
                </button>
              </div>
            </div>

            {deliverables.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-line bg-canvas px-4 py-6 text-center">
                <p className="text-sm text-ink-secondary">No deliverables yet</p>
                <p className="mt-1 text-2xs text-ink-tertiary">
                  Tap <strong>+ Reel</strong>, <strong>+ Story</strong>, or <strong>+ Post</strong> above to add what you agreed on.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {deliverables.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5"
                  >
                    <div>
                      <span className="text-sm font-medium capitalize text-ink">
                        {d.deliverable_type} ×{d.quantity}
                      </span>
                      <span className="ml-2 text-2xs text-ink-tertiary">
                        Due {formatDate(d.due_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.is_overdue && <Pill tone="danger">Overdue</Pill>}
                      <Pill tone={d.status === 'posted' ? 'success' : 'default'}>{d.status}</Pill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

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
        onAdd={() => openAddDeliverable('reel')}
        onStatusChange={(delId, status) => {
          persistDeliverables(
            deliverables.map((d) => (d.id === delId ? { ...d, status } : d)),
          );
        }}
      />

      <AddDeliverableModal
        open={modal === 'add-deliverable'}
        initialType={addDeliverableType}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        onAdd={handleAddDeliverable}
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
        onSave={(visitDate) => {
          persistEngagement({
            conversation_status: 'scheduled',
            visit_date: visitDate,
            next_follow_up_date: visitDate,
          });
          setFollowUpSuggestion(null);
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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
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

function FollowUpField({ value, suggestion, onChange, onAccept, onDismiss }) {
  const inputValue = toDateInputValue(value);
  const showSuggestion =
    suggestion && toDateInputValue(suggestion.date) !== inputValue;

  return (
    <div className="sm:col-span-2">
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
        Next follow-up
      </dt>
      <dd className="mt-1.5">
        <input
          type="date"
          className="input-field max-w-[220px]"
          value={inputValue}
          onChange={(e) => onChange(e.target.value || null)}
          aria-label="Next follow-up date"
        />
        {!inputValue && !showSuggestion && (
          <p className="mt-1.5 text-2xs text-ink-tertiary">Pick a date, or use a suggestion after changing status.</p>
        )}
      </dd>
      {showSuggestion && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-2xs text-amber-900">
            <span className="font-medium">Suggested:</span>{' '}
            {formatDate(suggestion.date)} ({suggestion.label}) — you choose whether to use it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={onAccept}>
              Use {formatDate(suggestion.date)}
            </button>
            <button type="button" className="btn-secondary" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverablesModal({ open, onClose, contactName, deliverables, onAdd, onStatusChange }) {
  return (
    <Modal
      open={open}
      title={`All deliverables · ${contactName}`}
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
          description="Use + Reel, + Story, or + Post on the engagement page."
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
                    onChange={(status) => onStatusChange?.(d.id, status)}
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

function AddDeliverableModal({ open, initialType, onClose, contactName, onAdd }) {
  const [type, setType] = useState(initialType);
  const [quantity, setQuantity] = useState(1);
  const [dueDate, setDueDate] = useState(() => addDaysIso(7));

  useEffect(() => {
    if (open) {
      setType(initialType);
      setQuantity(1);
      setDueDate(addDaysIso(7));
    }
  }, [open, initialType]);

  const submit = () => {
    onAdd({ type, quantity, dueDate });
  };

  return (
    <Modal
      open={open}
      title={`Add deliverable · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit}>Add to engagement</button>
        </div>
      }
    >
      <p className="mb-4 text-2xs text-ink-secondary">
        Choose the content type you agreed on with this creator.
      </p>
      <div className="grid gap-3">
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Type</label>
          <select className="input-field" value={type} onChange={(e) => setType(e.target.value)}>
            {DELIVERABLE_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
            <option value="carousel">Carousel</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Quantity</label>
          <input
            type="number"
            className="input-field"
            value={quantity}
            min={1}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Due date</label>
          <input
            type="date"
            className="input-field"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
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
  const [visitDate, setVisitDate] = useState('');

  useEffect(() => {
    if (open) setVisitDate('');
  }, [open]);

  return (
    <Modal
      open={open}
      title={`Visit · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!visitDate}
            onClick={() => onSave(visitDate)}
          >
            Save visit
          </button>
        </div>
      }
    >
      <p className="mb-4 text-2xs text-ink-secondary">
        Required when status is Scheduled. Follow-up will be set to the visit date you pick.
      </p>
      <div className="grid gap-3">
        <div>
          <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Visit date *</label>
          <input
            type="date"
            className="input-field"
            required
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
          />
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
