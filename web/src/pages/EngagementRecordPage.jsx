import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Card,
  EmptyState,
  Modal,
  Toast,
} from '../components/ui/Primitives.jsx';
import { RatingStars, StatusButton } from '../components/ui/DataKit.jsx';
import { DeliverableRow } from '../components/deliverables/DeliverableProofSection.jsx';
import { DeliverableTypeButtons, deliverableTypeLabel } from '../components/deliverables/DeliverableTypeButtons.jsx';
import { FeedbackModal } from '../components/feedback/FeedbackModal.jsx';
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
  patchEngagement,
  syncDeliverables,
  fetchDeliverables,
  fetchFeedback,
  fetchEngagementTimeline,
} from '../lib/persistence.js';
import { updateEngagementDeliverables } from '../lib/deliverablesCache.js';
import { getCachedContact, mergeContactsCache } from '../lib/contactsCache.js';
import { isContactBlacklisted } from '../lib/contactsHelpers.js';
import { contactsApi } from '../lib/api.js';
import { getContactProfileExtras } from '../lib/contactProfile.js';
import {
  agreedFeeRules,
  canSetDeliverableStatus,
  deliverableStatusBlockReason,
  deliverableStatusOptionsForEngagement,
  deliverablesRules,
  canRemoveDeliverable,
  feedbackRules,
  followUpRules,
  followUpSuggestionForStatus,
  getStatusOptions,
  interestRules,
  isComplete,
  notesRules,
  sideEffectsOnStatusChange,
  terminalBanner,
  visitRules,
} from '../lib/engagementRules.js';
import { formatCollaborationReason } from '../lib/collaborationReasons.js';

const interestOptions = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

import { buildNewDeliverable } from '../lib/deliverableTypes.js';

export function EngagementRecordPage() {
  const { id } = useParams();
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [followUpSuggestion, setFollowUpSuggestion] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [deliverables, setDeliverables] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [feedbackRecord, setFeedbackRecord] = useState(null);
  const [contactEngagements, setContactEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const persistEngagement = async (patch, { silent = false } = {}) => {
    setSaving(true);
    try {
      const saved = await patchEngagement(id, patch);
      setEngagement((prev) => ({
        ...prev,
        ...saved,
        contact_name: prev?.contact_name ?? saved.contact_name,
        campaign_name: prev?.campaign_name ?? saved.campaign_name,
        brand_name: prev?.brand_name ?? saved.brand_name,
        owner_name: prev?.owner_name ?? saved.owner_name,
        campaign_id: prev?.campaign_id ?? saved.campaign_id,
      }));
      if (!silent) setToast('Saved');
    } catch {
      setToast('Could not save — please try again');
    } finally {
      setSaving(false);
    }
  };

  const persistDeliverables = async (list) => {
    try {
      const beforeList = await fetchDeliverables(id);
      const saved = await syncDeliverables(id, beforeList, list);
      setDeliverables(saved);
      updateEngagementDeliverables(id, saved);
    } catch {
      setToast('Could not save deliverables');
    }
  };

  const updateDeliverable = (delId, patch) => {
    const engagementStatus = engagement.conversation_status;
    if (patch.status && !canSetDeliverableStatus(engagementStatus, patch.status)) {
      setToast(
        deliverableStatusBlockReason(engagementStatus, patch.status)
          ?? 'This status is not available at the current stage',
      );
      return;
    }
    persistDeliverables(
      deliverables.map((d) => (d.id === delId ? { ...d, ...patch } : d)),
    );
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setFollowUpSuggestion(null);

    Promise.all([
      engagementsApi.get(id),
      fetchDeliverables(id),
      fetchEngagementTimeline(id),
      fetchFeedback(id),
    ])
      .then(async ([eng, dels, tl, fb]) => {
        setEngagement(eng);
        setDeliverables(dels ?? []);
        updateEngagementDeliverables(id, dels ?? []);
        setTimeline(Array.isArray(tl) ? tl : []);
        setFeedbackRecord(fb);
        if (eng?.contact_id) {
          mergeContactsCache([{ id: eng.contact_id }]);
          const contact = await contactsApi.get(eng.contact_id).catch(() => null);
          if (contact) mergeContactsCache([contact]);
          const engs = await contactsApi.engagements(eng.contact_id).catch(() => []);
          setContactEngagements(Array.isArray(engs) ? engs : []);
        }
      })
      .catch(() => {
        setEngagement(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center text-sm text-ink-secondary">
        Loading engagement…
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState title="Engagement not found" description="This record may have been removed." />
      </div>
    );
  }

  const canComplete =
    deliverables.length > 0 && deliverables.every((d) => d.status === 'posted');

  const status = engagement.conversation_status;
  const followUp = followUpRules(status);
  const visit = visitRules(status);
  const deliverablesRule = deliverablesRules(status);
  const deliverableStatusOptions = deliverableStatusOptionsForEngagement(status);
  const feedback = feedbackRules(status);
  const feeRule = agreedFeeRules(status);
  const interestRule = interestRules(status);
  const notesRule = notesRules(status);
  const closedBanner = terminalBanner(status);

  const statusChoices = getStatusOptions({
    current: status,
    canComplete,
    formatStatus,
  });

  const handleStatusChange = (next) => {
    if (next === 'scheduled') {
      setModal('visit');
      return;
    }

    const patch = { conversation_status: next, ...sideEffectsOnStatusChange(next) };

    const rule = followUpSuggestionForStatus(next);
    if (rule && followUpRules(next).editable) {
      setFollowUpSuggestion({
        date: addDaysIso(rule.days),
        label: rule.label,
      });
    } else {
      setFollowUpSuggestion(null);
    }

    persistEngagement(patch);
  };

  const handleFollowUpChange = (date) => {
    if (!followUp.editable) return;
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

  const addDeliverable = (type) => {
    if (!deliverablesRule.canAdd) return;
    const newItem = buildNewDeliverable({ type, engagementStatus: status });
    persistDeliverables([...deliverables, newItem]);
    setToast(`Added ${deliverableTypeLabel(type)} ×${newItem.quantity}`);
  };

  const removeDeliverable = (delId) => {
    const item = deliverables.find((d) => d.id === delId);
    if (!item || !canRemoveDeliverable(status, item)) return;
    persistDeliverables(deliverables.filter((d) => d.id !== delId));
    setToast(`Removed ${deliverableTypeLabel(item.deliverable_type)} ×${item.quantity}`);
  };

  const postedCount = deliverables.filter((d) => d.status === 'posted').length;

  const blacklisted = engagement.contact_id && isContactBlacklisted(engagement.contact_id);
  const contactRecord = engagement.contact_id ? getCachedContact(engagement.contact_id) : null;
  const contactExtras = getContactProfileExtras(contactRecord);
  const previousBrands = contactEngagements.length
    ? [...new Set(contactEngagements.map((e) => e.brand_name).filter(Boolean))].join(', ')
    : '—';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={engagement.contact_name}
        subtitle={`${MODULES.engagementRecord.pageTitle} · ${engagement.campaign_name} · ${engagement.brand_name}`}
        actions={
          <>
            {engagement.contact_id && (
              <Link to={`/contacts/${engagement.contact_id}`} className="btn-secondary">
                View profile
              </Link>
            )}
            <Link
              to={`/campaigns/${engagement.campaign_id ?? 'c1'}`}
              className="btn-secondary"
            >
              ← Campaign
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={statusTone(engagement.conversation_status)}>
          {formatStatus(engagement.conversation_status)}
        </Pill>
        <span className="text-2xs text-ink-tertiary">{MODULES.engagementRecord.subtitle}</span>
      </div>

      {blacklisted && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-900">
          <span className="font-semibold">Blacklisted creator.</span> This contact is excluded from new campaign population.
        </div>
      )}
      {closedBanner && (
        <TerminalStateBanner {...closedBanner} />
      )}
      {saving && (
        <p className="text-2xs text-ink-tertiary">Saving…</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard
          title="Feedback"
          subtitle={
            feedbackRecord
              ? 'Feedback saved — tap to edit'
              : feedback.available
                ? 'Rate this collaboration'
                : feedback.lockedReason
          }
          badge={feedbackRecord ? 'Saved' : undefined}
          badgeTone="success"
          disabled={!feedback.available}
          onClick={() => feedback.available && setModal('feedback')}
        />
        <ActionCard
          title="Visit"
          subtitle={
            visit.available && engagement.visit_date
              ? formatDate(engagement.visit_date)
              : visit.lockedReason
          }
          disabled={!visit.available}
          onClick={() => visit.available && setModal('visit')}
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
                    isComplete(status)
                      ? 'Change status to reopen and edit fee or deliverables'
                      : !canComplete
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
                  disabled={!interestRule.editable}
                  onChange={(v) => interestRule.editable && persistEngagement({ interest_level: v })}
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
                editable={followUp.editable}
                lockedHint={followUp.hint}
                onChange={handleFollowUpChange}
                onAccept={acceptFollowUpSuggestion}
                onDismiss={() => setFollowUpSuggestion(null)}
              />
              <DetailItem
                label="Agreed fee"
                value={formatFee(engagement.agreed_fee)}
                locked={feeRule.frozen}
                hint={feeRule.frozenReason}
              />
              <DetailItem
                label="Reason"
                value={formatCollaborationReason(engagement.primary_collaboration_reason)}
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

            {deliverablesRule.lockedReason && (
              <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-2xs text-ink-secondary">
                {deliverablesRule.lockedReason}
              </p>
            )}
            {deliverablesRule.hint && (
              <p className="mt-3 text-2xs text-ink-tertiary">{deliverablesRule.hint}</p>
            )}

            {deliverablesRule.canAdd && (
              <div className="mt-4">
                <p className="mb-2 text-2xs font-medium text-ink-tertiary">Add content type</p>
                <DeliverableTypeButtons onAdd={addDeliverable} className="[&_button]:text-2xs [&_button]:!py-1.5" />
                {deliverables.length > 0 && (
                  <button type="button" className="btn-ghost mt-2" onClick={() => setModal('deliverables')}>
                    Manage all
                  </button>
                )}
              </div>
            )}

            {!deliverablesRule.canAdd && deliverables.length > 0 && (
              <div className="mt-4">
                <button type="button" className="btn-ghost" onClick={() => setModal('deliverables')}>
                  View deliverables
                </button>
              </div>
            )}

            {deliverables.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-line bg-canvas px-4 py-6 text-center">
                <p className="text-sm text-ink-secondary">No deliverables yet</p>
                <p className="mt-1 text-2xs text-ink-tertiary">
                  {deliverablesRule.canAdd
                    ? 'Tap a content type above once commercials are agreed.'
                    : deliverablesRule.lockedReason}
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {deliverables.map((d) => (
                  <DeliverableRow
                    key={d.id}
                    deliverable={d}
                    canEditStatus={deliverablesRule.canEditStatus}
                    canEditProof={deliverablesRule.canEditStatus}
                    canRemove={canRemoveDeliverable(status, d)}
                    deliverableStatusOptions={deliverableStatusOptions}
                    onStatusChange={(delId, status) => updateDeliverable(delId, { status })}
                    onUpdate={updateDeliverable}
                    onRemove={removeDeliverable}
                    onSaved={() => setToast('Proof saved')}
                    compact
                  />
                ))}
              </div>
            )}
          </Card>

          <Card elevated className="!p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Notes</h2>
              {notesRule.editable && !notesEditing && (
                <button
                  type="button"
                  className="btn-ghost text-2xs"
                  onClick={() => {
                    setNotesDraft(engagement.notes ?? '');
                    setNotesEditing(true);
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            {notesEditing ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input-field min-h-[100px] w-full text-sm"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Context for the team…"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-2xs" onClick={() => setNotesEditing(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary text-2xs"
                    onClick={() => {
                      persistEngagement({ notes: notesDraft.trim() || null });
                      setNotesEditing(false);
                      setToast('Notes saved');
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-canvas px-3 py-3 text-sm leading-relaxed text-ink-secondary">
                {engagement.notes || (notesRule.editable
                  ? 'No notes yet — tap Edit to add context for the team.'
                  : '—')}
              </p>
            )}
          </Card>
        </div>

        <Card elevated className="h-fit !p-5">
          <h2 className="text-sm font-semibold text-ink">Relationship</h2>
          <p className="mt-0.5 text-2xs text-ink-secondary">From contact history</p>
          {engagement.contact_id && (
            <Link to={`/contacts/${engagement.contact_id}`} className="mt-2 inline-block text-2xs font-medium text-brand hover:underline">
              Open full profile →
            </Link>
          )}
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-2xs text-ink-tertiary">Previous brands</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{previousBrands || '—'}</dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-tertiary">Avg rating</dt>
              <dd className="mt-1 flex items-center gap-2">
                {contactExtras.avg_rating != null ? (
                  <>
                    <RatingStars value={contactExtras.avg_rating} />
                    <span className="text-sm font-medium text-ink">{contactExtras.avg_rating.toFixed(1)}</span>
                  </>
                ) : (
                  <span className="text-sm text-ink-secondary">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-tertiary">Would work again</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {contactExtras.would_work_again_pct != null ? `${contactExtras.would_work_again_pct}%` : '—'}
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <Pill tone={blacklisted ? 'danger' : 'success'}>{blacklisted ? 'Blacklisted' : 'Not blacklisted'}</Pill>
          </div>
        </Card>
      </div>

      <DeliverablesModal
        open={modal === 'deliverables'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        deliverables={deliverables}
        canAdd={deliverablesRule.canAdd}
        canEditStatus={deliverablesRule.canEditStatus}
        deliverableStatusOptions={deliverableStatusOptions}
        onAddType={addDeliverable}
        onRemove={removeDeliverable}
        engagementStatus={status}
        onStatusChange={(delId, nextStatus) => updateDeliverable(delId, { status: nextStatus })}
        onUpdate={updateDeliverable}
        onSaved={() => setToast('Proof saved')}
      />

      <FeedbackModal
        open={modal === 'feedback'}
        onClose={() => setModal(null)}
        contactName={engagement.contact_name}
        engagementId={id}
        contactId={engagement.contact_id}
        initial={feedbackRecord}
        onSaved={(record) => {
          setFeedbackRecord(record);
          setModal(null);
          setToast('Feedback saved');
        }}
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

function TerminalStateBanner({ tone, title, body }) {
  const styles =
    tone === 'success'
      ? 'border-teal-200 bg-teal-50 text-teal-900'
      : 'border-line bg-canvas text-ink-secondary';
  return (
    <div className={`rounded-lg border px-4 py-3 text-2xs ${styles}`}>
      <span className="font-semibold text-ink">{title}.</span> {body}
    </div>
  );
}

function ActionCard({ title, subtitle, badge, badgeTone = 'default', disabled = false, onClick }) {
  return (
    <Card
      elevated
      interactive={!disabled}
      onClick={disabled ? undefined : onClick}
      className={`!p-4 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className={`mt-0.5 text-2xs ${disabled ? 'text-ink-tertiary' : 'text-ink-secondary'}`}>
            {subtitle}
          </div>
        </div>
        {!disabled && <span className="text-lg text-ink-tertiary" aria-hidden>→</span>}
        {disabled && <span className="text-2xs font-medium text-ink-tertiary" aria-hidden>Locked</span>}
      </div>
      {badge && (
        <div className="mt-3">
          <Pill tone={badgeTone}>{badge}</Pill>
        </div>
      )}
    </Card>
  );
}

function ChipGroup({ options, value, onChange, disabled = false }) {
  return (
    <div className={`flex flex-wrap gap-2 ${disabled ? 'opacity-60' : ''}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
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

function DetailItem({ label, value, highlight, locked, hint, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
        {label}
        {locked && <span className="ml-1 normal-case text-ink-tertiary">(locked)</span>}
      </dt>
      <dd className={`mt-1 text-sm font-medium ${highlight ? 'text-brand' : 'text-ink'}`}>
        {value}
      </dd>
      {hint && <p className="mt-1 text-2xs text-ink-tertiary">{hint}</p>}
    </div>
  );
}

function FollowUpField({ value, suggestion, editable, lockedHint, onChange, onAccept, onDismiss }) {
  if (!editable) {
    return (
      <div className="sm:col-span-2">
        <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
          Next follow-up
        </dt>
        <dd className="mt-1 text-sm font-medium text-ink">—</dd>
        {lockedHint && <p className="mt-1.5 text-2xs text-ink-tertiary">{lockedHint}</p>}
      </div>
    );
  }

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
          <p className="mt-1.5 text-2xs text-ink-tertiary">
            Pick a date, or use a suggestion after changing status.
          </p>
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

function DeliverablesModal({
  open,
  onClose,
  contactName,
  deliverables,
  canAdd,
  canEditStatus,
  deliverableStatusOptions,
  onAddType,
  onRemove,
  engagementStatus,
  onStatusChange,
  onUpdate,
  onSaved,
}) {
  return (
    <Modal
      open={open}
      title={`All deliverables · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canAdd ? (
            <DeliverableTypeButtons onAdd={onAddType} className="[&_button]:text-2xs" />
          ) : (
            <span className="text-2xs text-ink-tertiary">Read-only</span>
          )}
          <button type="button" className="btn-primary ml-auto" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      {deliverables.length === 0 ? (
        <EmptyState
          title="No deliverables yet"
          description="Tap a content type below once commercials are agreed."
          action={
            canAdd ? (
              <DeliverableTypeButtons onAdd={onAddType} className="justify-center [&_button]:text-2xs" />
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {deliverables.map((d) => (
            <DeliverableRow
              key={d.id}
              deliverable={d}
              canEditStatus={canEditStatus}
              canEditProof={canEditStatus}
              canRemove={canRemoveDeliverable(engagementStatus, d)}
              deliverableStatusOptions={deliverableStatusOptions}
              onStatusChange={onStatusChange}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </Modal>
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
