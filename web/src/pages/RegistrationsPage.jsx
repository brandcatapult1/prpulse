import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/ui/DataKit.jsx';
import { Drawer, EmptyState, Toast } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill, formatDate } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { contactsApi, registrationsApi } from '../lib/api.js';
import { findContactByMobile } from '../lib/phone.js';
import { formatPrimaryCategory } from '../lib/creatorCategories.js';
import { todayIso } from '../lib/dates.js';

const PENDING_STATUSES = new Set(['new', 'pending_review']);

const FILTERS = [
  { id: 'pending', label: 'Pending review' },
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'duplicate', label: 'Duplicate' },
];

export function RegistrationsPage() {
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [approveChoice, setApproveChoice] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      registrationsApi.list(),
      contactsApi.list().catch(() => []),
    ])
      .then(([regs, contactRows]) => {
        setRows(Array.isArray(regs) ? regs : []);
        setContacts(Array.isArray(contactRows) ? contactRows : []);
        setLoadError(null);
      })
      .catch((err) => {
        setRows([]);
        setLoadError(err.message ?? 'Could not load registrations');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'pending') return rows.filter((r) => PENDING_STATUSES.has(r.status));
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const columns = [
    {
      key: 'full_name',
      label: 'Name',
      render: (r) => (
        <div>
          <span className="font-medium text-ink">{r.full_name}</span>
          {findContactByMobile(r.mobile_number, contacts) && PENDING_STATUSES.has(r.status) && (
            <span className="ml-2 text-2xs text-health-amber">Possible duplicate</span>
          )}
        </div>
      ),
    },
    { key: 'city', label: 'City', render: (r) => r.city ?? '—' },
    { key: 'category', label: 'Category', render: (r) => formatPrimaryCategory(r) },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <Pill tone={statusTone(r.status)}>{formatStatus(r.status)}</Pill>,
    },
    {
      key: 'created_at',
      label: 'Submitted',
      render: (r) => formatDate(r.created_at),
    },
  ];

  const applyAction = async (id, patch, message) => {
    try {
      const updated = await registrationsApi.update(id, patch);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      if (updated.status === 'duplicate' && patch.status === 'approved') {
        setToast('Marked as duplicate — linked to existing contact');
      } else {
        setToast(message);
      }
      setSelected(null);
      setApproveChoice(null);
    } catch (err) {
      setToast(err.message ?? 'Action failed');
    }
  };

  const handleApprove = (registration, linkToContactId = null) => {
    applyAction(
      registration.id,
      {
        status: 'approved',
        linked_contact_id: linkToContactId,
        reviewed_at: todayIso(),
      },
      linkToContactId
        ? `Approved and linked to existing contact`
        : 'Approved — contact added to database',
    );
  };

  const handleReject = (registration) => {
    applyAction(
      registration.id,
      { status: 'rejected', reviewed_at: todayIso() },
      'Registration rejected',
    );
  };

  const handleMarkDuplicate = (registration, contactId) => {
    applyAction(
      registration.id,
      { status: 'duplicate', linked_contact_id: contactId, reviewed_at: todayIso() },
      'Marked as duplicate and linked',
    );
  };

  const onApproveClick = (registration) => {
    const match = findContactByMobile(registration.mobile_number, contacts);
    if (match) {
      setApproveChoice({ registration, match });
    } else {
      handleApprove(registration);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={MODULES.registration.pageTitle}
        subtitle={MODULES.registration.subtitle}
        actions={
          <a href="/signup" target="_blank" rel="noreferrer" className="btn-secondary">
            Public form ↗
          </a>
        }
      />

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{loadError}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-md border px-3 py-1.5 text-2xs font-medium transition-colors ${
              filter === f.id
                ? 'border-brand/30 bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
            }`}
          >
            {f.label}
            {f.id === 'pending' && (
              <span className="ml-1 tabular-nums">
                ({rows.filter((r) => PENDING_STATUSES.has(r.status)).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? 'Queue is clear 🎉' : 'No registrations'}
          description={
            filter === 'pending'
              ? 'New creator submissions will appear here for review.'
              : 'Try a different filter.'
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          onRowClick={(row) => setSelected(row)}
        />
      )}

      <ReviewDrawer
        registration={selected}
        contacts={contacts}
        onClose={() => setSelected(null)}
        onApprove={() => selected && onApproveClick(selected)}
        onReject={() => selected && handleReject(selected)}
        onMarkDuplicate={(contactId) => selected && handleMarkDuplicate(selected, contactId)}
      />

      <Drawer
        open={Boolean(approveChoice)}
        title="Mobile number already exists"
        onClose={() => setApproveChoice(null)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setApproveChoice(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => approveChoice && handleApprove(approveChoice.registration)}
            >
              Create new contact
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                approveChoice && handleApprove(approveChoice.registration, approveChoice.match.id)
              }
            >
              Link to {approveChoice?.match.full_name}
            </button>
          </div>
        }
      >
        {approveChoice && (
          <p className="text-2xs text-ink-secondary">
            <span className="font-medium text-ink">{approveChoice.registration.full_name}</span>
            {' '}submitted with the same mobile as{' '}
            <span className="font-medium text-ink">{approveChoice.match.full_name}</span>
            {' '}({approveChoice.match.mobile_number}). Choose how to proceed.
          </p>
        )}
      </Drawer>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function ReviewDrawer({ registration, contacts, onClose, onApprove, onReject, onMarkDuplicate }) {
  if (!registration) return null;

  const duplicate = findContactByMobile(registration.mobile_number, contacts);
  const isPending = PENDING_STATUSES.has(registration.status);

  return (
    <Drawer
      open={Boolean(registration)}
      title={`Review · ${registration.full_name}`}
      onClose={onClose}
      footer={
        isPending ? (
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className="btn-secondary text-red-600" onClick={onReject}>
              Reject
            </button>
            <div className="flex flex-wrap gap-2">
              {duplicate && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onMarkDuplicate(duplicate.id)}
                >
                  Mark duplicate
                </button>
              )}
              <button type="button" className="btn-primary" onClick={onApprove}>
                Approve
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-primary ml-auto" onClick={onClose}>Close</button>
        )
      }
    >
      {duplicate && isPending && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-2xs text-amber-900">
          <span className="font-semibold">Dedup match:</span>{' '}
          {duplicate.full_name} · {duplicate.mobile_number} · {duplicate.city}
        </div>
      )}

      <dl className="space-y-3 text-sm">
        <Detail label="Mobile" value={registration.mobile_number} />
        <Detail label="Email" value={registration.email ?? '—'} />
        <Detail label="City" value={registration.city ?? '—'} />
        <Detail label="Instagram" value={registration.instagram_link ?? '—'} link />
        <Detail label="YouTube" value={registration.youtube_link ?? '—'} link />
        <Detail label="Primary category" value={formatPrimaryCategory(registration)} />
        <Detail
          label="Preferences"
          value={[
            registration.barter_preference && 'Barter',
            registration.paid_preference && 'Paid',
          ].filter(Boolean).join(' · ') || '—'}
        />
        <Detail label="Reel rate" value={registration.reel_rate != null ? `₹${registration.reel_rate}` : '—'} />
        <Detail label="Story rate" value={registration.story_rate != null ? `₹${registration.story_rate}` : '—'} />
        {registration.portfolio_links?.length > 0 && (
          <div>
            <dt className="text-2xs font-medium text-ink-tertiary">Portfolio</dt>
            <dd className="mt-1 space-y-1">
              {registration.portfolio_links.map((link) => (
                <a key={link} href={link} target="_blank" rel="noreferrer" className="block truncate text-brand hover:underline">
                  {link}
                </a>
              ))}
            </dd>
          </div>
        )}
        {registration.notes && <Detail label="Notes" value={registration.notes} />}
        <Detail label="Status" value={formatStatus(registration.status)} />
        <Detail label="Submitted" value={formatDate(registration.created_at)} />
        {registration.reviewed_at && (
          <Detail label="Reviewed" value={formatDate(registration.reviewed_at)} />
        )}
      </dl>
    </Drawer>
  );
}

function Detail({ label, value, link }) {
  return (
    <div>
      <dt className="text-2xs font-medium text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">
        {link && value !== '—' ? (
          <a href={value} target="_blank" rel="noreferrer" className="text-brand hover:underline">{value}</a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function formatStatus(status) {
  return status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '—';
}

function statusTone(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'duplicate') return 'warning';
  if (status === 'pending_review') return 'info';
  return 'default';
}
