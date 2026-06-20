import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable, FilterBar, RatingStars } from '../components/ui/DataKit.jsx';
import { EmptyState, Toast } from '../components/ui/Primitives.jsx';
import { Pill, formatDate, formatFee, formatStatus, statusTone } from '../lib/format.jsx';
import { MODULES, CONTACT_PROFILE_TABS } from '../lib/modules.js';
import { contactsApi } from '../lib/api.js';
import { getDemoContact, pickRecord } from '../lib/demo.js';
import { saveContactProfileOverride } from '../lib/demoStore.js';
import {
  getActiveEngagementsForContact,
  getCollaborationHistory,
  getContactProfileExtras,
  getFeedbackHistoryForContact,
} from '../lib/contactProfile.js';
import { formatCollaborationReason } from '../lib/collaborationReasons.js';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';

export function ContactProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState(() => getDemoContact(id));
  const [demo, setDemo] = useState(true);
  const [activeTab, setActiveTab] = useState(CONTACT_PROFILE_TABS[0]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!id) return;
    setContact(getDemoContact(id));
    setDemo(true);
    setActiveTab(CONTACT_PROFILE_TABS[0]);
    setEditing(false);

    contactsApi
      .get(id)
      .then((row) => {
        setContact(pickRecord(row, getDemoContact(id)));
        setDemo(!row?.full_name);
      })
      .catch(() => {
        setContact(getDemoContact(id));
        setDemo(true);
      });
  }, [id]);

  const extras = useMemo(
    () => (contact ? getContactProfileExtras(contact.id) : {}),
    [contact, editing],
  );

  const history = useMemo(
    () => (contact ? getCollaborationHistory(contact) : []),
    [contact],
  );
  const activeEngagements = useMemo(
    () => (contact ? getActiveEngagementsForContact(contact) : []),
    [contact],
  );
  const feedbackHistory = useMemo(
    () => (contact ? getFeedbackHistoryForContact(contact) : []),
    [contact],
  );

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
    setDraft({
      city: contact.city ?? '',
      instagram_url: extras.instagram_url ?? '',
      notes: extras.notes ?? '',
    });
    setEditing(true);
  }

  function saveEdit() {
    saveContactProfileOverride(contact.id, {
      city: draft.city.trim() || contact.city,
      instagram_url: draft.instagram_url.trim() || null,
      notes: draft.notes.trim() || null,
    });
    if (draft.city.trim()) {
      setContact((c) => ({ ...c, city: draft.city.trim() }));
    }
    setEditing(false);
    setToast('Profile updated');
  }

  const tags = contact.tags ?? [];
  const classification = contact.classification?.replace('_', ' ') ?? '—';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
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
                <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={saveEdit}>Save</button>
              </>
            )}
          </>
        }
      />

      <DemoBanner show={demo} />

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">{contact.full_name}</h2>
            <p className="mt-1 text-2xs text-ink-secondary">
              {classification} · {contact.city ?? '—'}
              {tags.length > 0 && ` · ${tags.join(', ')}`}
            </p>
            {contact.is_blacklisted && (
              <p className="mt-2 text-2xs font-medium text-red-700">
                Blacklisted — excluded from campaign population
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Pill key={t} tone="info">{t}</Pill>
            ))}
            <Pill tone={statusTone(contact.status)}>{contact.status}</Pill>
          </div>
        </div>
        <p className="mt-3 text-2xs text-ink-tertiary">
          Total: {extras.total_collaborations ?? '—'} collabs
          {extras.last_collaboration_date && ` · Last: ${formatDate(extras.last_collaboration_date)}`}
          {extras.avg_rating != null && ` · ★${extras.avg_rating.toFixed(1)}`}
          {extras.would_work_again_pct != null && ` · Would work again ${extras.would_work_again_pct}%`}
        </p>
      </div>

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
        <OverviewTab
          contact={contact}
          extras={extras}
          editing={editing}
          draft={draft}
          onDraftChange={setDraft}
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
              value={draft.notes ?? extras.notes ?? ''}
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
  );
}

function OverviewTab({ contact, extras, editing, draft, onDraftChange }) {
  return (
    <div className="panel p-5 space-y-4 text-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile" value={contact.mobile_number ?? '—'} />
        <Field
          label="City"
          value={editing ? (
            <input
              className="input-field mt-1 w-full"
              value={draft.city ?? contact.city ?? ''}
              onChange={(e) => onDraftChange((d) => ({ ...d, city: e.target.value }))}
            />
          ) : (contact.city ?? '—')}
        />
        <Field
          label="Instagram"
          value={editing ? (
            <input
              className="input-field mt-1 w-full"
              value={draft.instagram_url ?? extras.instagram_url ?? ''}
              onChange={(e) => onDraftChange((d) => ({ ...d, instagram_url: e.target.value }))}
            />
          ) : extras.instagram_url ? (
            <a href={extras.instagram_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {extras.instagram_url.replace(/^https?:\/\//, '')}
            </a>
          ) : '—'}
        />
        <Field label="Classification" value={contact.classification?.replace('_', ' ') ?? '—'} />
        <Field label="Open to paid" value={extras.open_to_paid == null ? '—' : extras.open_to_paid ? 'Yes' : 'No'} />
        <Field label="Open to barter" value={extras.open_to_barter == null ? '—' : extras.open_to_barter ? 'Yes' : 'No'} />
      </dl>

      {(extras.reel_rate != null || extras.story_rate != null) && (
        <div className="border-t border-line pt-4">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
            Current indicative rates — not historical
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
            {extras.reel_rate != null && <Field label="Reel" value={formatFee(extras.reel_rate)} />}
            {extras.story_rate != null && <Field label="Story" value={formatFee(extras.story_rate)} />}
          </dl>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
