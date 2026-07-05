import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable, RatingStars } from '../components/ui/DataKit.jsx';
import { EmptyState, Toast, GlassTile } from '../components/ui/Primitives.jsx';
import { Pill, formatDate, formatFee, formatStatus, statusTone } from '../lib/format.jsx';
import { MODULES, CONTACT_PROFILE_TABS } from '../lib/modules.js';
import { contactsApi, lookupApi } from '../lib/api.js';
import { patchContact, fetchFeedback } from '../lib/persistence.js';
import { mergeContactsCache } from '../lib/contactsCache.js';
import {
  getActiveEngagementsForContact,
  getCollaborationHistory,
  getContactProfileExtras,
  getFeedbackHistoryForContact,
} from '../lib/contactProfile.js';
import { formatCollaborationReason } from '../lib/collaborationReasons.js';
import { formatClassification } from '../lib/classifications.js';
import {
  buildDraftFromContact,
  buildPatchFromDraft,
  isDraftSaveable,
  getDraftValidationError,
  tagNamesFromContact,
  e164FromDraft,
} from '../lib/contactDraft.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { ContactEditOverview } from '../components/contacts/ContactEditOverview.jsx';

export function ContactProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [feedbackByEngagement, setFeedbackByEngagement] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(CONTACT_PROFILE_TABS[0]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [duplicate, setDuplicate] = useState(null);
  const [tagOptions, setTagOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setActiveTab(CONTACT_PROFILE_TABS[0]);
    setEditing(false);
    setDuplicate(null);

    Promise.all([
      contactsApi.get(id),
      contactsApi.engagements(id),
      lookupApi.tags().catch(() => []),
      lookupApi.categories().catch(() => []),
      lookupApi.cities().catch(() => []),
    ])
      .then(async ([row, engs, tags, categories, cities]) => {
        setContact(row);
        mergeContactsCache([row]);
        setTagOptions(Array.isArray(tags) ? tags : []);
        setCategoryOptions(Array.isArray(categories) ? categories : []);
        setCityOptions(Array.isArray(cities) ? cities : []);
        const engagementList = Array.isArray(engs) ? engs : [];
        setEngagements(engagementList);
        const feedbackMap = {};
        await Promise.all(
          engagementList.map(async (e) => {
            const fb = await fetchFeedback(e.id).catch(() => null);
            if (fb) feedbackMap[e.id] = fb;
          }),
        );
        setFeedbackByEngagement(feedbackMap);
      })
      .catch(() => setContact(null))
      .finally(() => setLoading(false));
  }, [id]);

  const extras = useMemo(
    () => (contact ? getContactProfileExtras(contact) : {}),
    [contact],
  );

  const history = useMemo(
    () => getCollaborationHistory(engagements, { feedbackByEngagement }),
    [engagements, feedbackByEngagement],
  );
  const activeEngagements = useMemo(
    () => getActiveEngagementsForContact(engagements),
    [engagements],
  );
  const feedbackHistory = useMemo(
    () => getFeedbackHistoryForContact(engagements, feedbackByEngagement),
    [engagements, feedbackByEngagement],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center text-sm text-ink-secondary">
        Loading profile…
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState title="Contact not found" description="This profile may have been archived or removed." />
        <button type="button" className="btn-secondary mt-4" onClick={() => navigate('/contacts')}>
          Back to contacts
        </button>
      </div>
    );
  }

  function startEdit() {
    setDraft(buildDraftFromContact(contact, { cities: cityOptions }));
    setDuplicate(null);
    setEditing(true);
  }

  async function checkDuplicateMobile() {
    const e164 = e164FromDraft(draft);
    if (!e164) {
      setDuplicate(null);
      return;
    }
    try {
      const match = await contactsApi.lookupMobile(e164, draft.mobile_country_code);
      setDuplicate(match ?? null);
    } catch {
      setDuplicate(null);
    }
  }

  async function saveEdit() {
    if (saving) return;
    const validationError = getDraftValidationError(draft, {
      duplicateId: duplicate?.id,
      contactId: contact.id,
    });
    if (validationError) {
      setToast(validationError);
      return;
    }

    setSaving(true);
    try {
      const updated = await patchContact(contact.id, buildPatchFromDraft(draft));
      setContact(updated);
      mergeContactsCache([updated]);
      setEditing(false);
      setDuplicate(null);
      setToast('Profile updated');
    } catch (err) {
      if (err.status === 409) {
        setToast('This mobile number belongs to another contact');
      } else {
        setToast(err.message ?? 'Could not save profile');
      }
    } finally {
      setSaving(false);
    }
  }

  const tagLabels = tagNamesFromContact(contact);
  const classification = formatClassification(contact.classification);
  const canSave = isDraftSaveable(draft, { duplicateId: duplicate?.id, contactId: contact.id });

  return (
    <div className="relative -mx-4 min-h-[calc(100vh-8rem)] px-4 pb-6">
      <ContactAuroraBackground />
      <div className="relative z-10 mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={contact.full_name}
        subtitle={`${MODULES.contactProfile.pageTitle} · ${MODULES.contactProfile.subtitle}`}
        actions={
          <>
            <Link to="/contacts" className="btn-secondary">← Contacts</Link>
            {!editing ? (
              <button type="button" className="btn-secondary" onClick={startEdit}>Edit</button>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={() => { setEditing(false); setDuplicate(null); }}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" disabled={!canSave || saving} onClick={saveEdit}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </>
        }
      />

      <GlassTile className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">{contact.full_name}</h2>
            <p className="mt-1 text-2xs text-ink-secondary">
              {classification} · {contact.city ?? '—'}
              {tagLabels.length > 0 && ` · ${tagLabels.join(', ')}`}
            </p>
            {contact.is_blacklisted && (
              <p className="mt-2 text-2xs font-medium text-red-700">
                Blacklisted — excluded from campaign population
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {tagLabels.map((t) => (
              <Pill key={t} tone="info">{t}</Pill>
            ))}
            <Pill tone={statusTone(contact.status)}>{contact.status}</Pill>
          </div>
        </div>
        <p className="mt-3 text-2xs text-ink-tertiary">
          Total: {extras.total_collaborations ?? contact.total_collaborations ?? '—'} collabs
          {extras.last_collaboration_date && ` · Last: ${formatDate(extras.last_collaboration_date)}`}
          {extras.avg_rating != null && ` · ★${extras.avg_rating.toFixed(1)}`}
          {extras.would_work_again_pct != null && ` · Would work again ${extras.would_work_again_pct}%`}
        </p>
      </GlassTile>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {CONTACT_PROFILE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 border-b-2 px-3 py-2 text-2xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' && (
        <ContactEditOverview
          contact={contact}
          extras={extras}
          editing={editing}
          draft={draft}
          onDraftChange={setDraft}
          tagOptions={tagOptions}
          categoryOptions={categoryOptions}
          cityOptions={cityOptions}
          duplicate={duplicate}
          onCheckMobile={checkDuplicateMobile}
          contactId={contact.id}
        />
      )}

      {activeTab === 'Collaboration History' && (
        <DataTable
          columns={[
            { key: 'campaign_name', label: 'Campaign', render: (r) => <span className="font-medium">{r.campaign_name}</span> },
            { key: 'brand_name', label: 'Brand' },
            { key: 'last_contact_date', label: 'Date', render: (r) => formatDate(r.last_contact_date) },
            { key: 'owner_name', label: 'Manager' },
            {
              key: 'primary_collaboration_reason',
              label: 'Primary reason',
              render: (r) => formatCollaborationReason(r.primary_collaboration_reason),
            },
            { key: 'agreed_fee', label: 'Fee', render: (r) => formatFee(r.agreed_fee) },
            { key: 'deliverables_completed', label: 'Deliverables' },
            {
              key: 'avg_rating',
              label: 'Rating',
              render: (r) => (r.avg_rating != null ? `★${r.avg_rating.toFixed(1)}` : '—'),
            },
            {
              key: 'would_work_again',
              label: 'WWA',
              render: (r) => (r.would_work_again == null ? '—' : r.would_work_again ? 'Yes' : 'No'),
            },
          ]}
          rows={history}
          onRowClick={(row) => navigate(`/engagements/${row.id}`)}
        />
      )}

      {activeTab === 'Active Engagements' && (
        activeEngagements.length === 0 ? (
          <EmptyState title="No active engagements" description="Add this creator to a campaign to start outreach." />
        ) : (
          <DataTable
            columns={[
              { key: 'campaign_name', label: 'Campaign' },
              { key: 'brand_name', label: 'Brand' },
              {
                key: 'conversation_status',
                label: 'Status',
                render: (r) => (
                  <Pill tone={statusTone(r.conversation_status)}>{formatStatus(r.conversation_status)}</Pill>
                ),
              },
              { key: 'next_follow_up_date', label: 'Next follow-up', render: (r) => formatDate(r.next_follow_up_date) },
              { key: 'owner_name', label: 'Owner' },
            ]}
            rows={activeEngagements}
            onRowClick={(row) => navigate(`/engagements/${row.id}`)}
          />
        )
      )}

      {activeTab === 'Feedback History' && (
        feedbackHistory.length === 0 ? (
          <EmptyState title="No feedback yet" description="Feedback appears after completed collaborations." />
        ) : (
          <div className="space-y-3">
            {feedbackHistory.map((fb) => (
              <div key={fb.engagement_id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-ink">{fb.campaign_name}</div>
                    <div className="text-2xs text-ink-tertiary">{fb.brand_name} · {formatDate(fb.saved_at)}</div>
                  </div>
                  <Link to={`/engagements/${fb.engagement_id}`} className="text-2xs font-medium text-brand hover:underline">
                    View engagement
                  </Link>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 text-2xs">
                  <div>Content: <RatingStars value={fb.content_quality} /></div>
                  <div>Professionalism: <RatingStars value={fb.professionalism} /></div>
                  <div>Timeliness: <RatingStars value={fb.timeliness} /></div>
                </div>
                {fb.internal_notes && (
                  <p className="mt-2 text-2xs text-ink-secondary">{fb.internal_notes}</p>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'Notes' && (
        <div className="panel p-5">
          {editing ? (
            <textarea
              className="input-field min-h-[120px] w-full"
              value={draft.notes ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Team notes about this creator…"
            />
          ) : (
            <p className="text-sm leading-relaxed text-ink-secondary">
              {extras.notes ?? 'No notes yet — tap Edit to add relationship context.'}
            </p>
          )}
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </div>
    </div>
  );
}

function ContactAuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#f7f5fa]/90 via-[#f3f5f8]/85 to-[#f0f6f4]/90" />
      <div className="absolute -left-20 -top-24 h-[420px] w-[420px] rounded-full bg-violet-200/30 blur-[120px]" />
      <div className="absolute -right-12 top-[8%] h-[360px] w-[360px] rounded-full bg-orange-100/25 blur-[120px]" />
      <div className="absolute bottom-[-8%] left-[20%] h-[340px] w-[340px] rounded-full bg-teal-100/22 blur-[120px]" />
    </div>
  );
}
