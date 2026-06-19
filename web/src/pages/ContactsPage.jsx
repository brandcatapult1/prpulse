import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilterBar, DataTable } from '../components/ui/DataKit.jsx';
import { Modal } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill, statusTone } from '../lib/format.jsx';
import { MODULES, CONTACT_PROFILE_TABS } from '../lib/modules.js';
import { contactsApi } from '../lib/api.js';
import { getDemoContacts, mergeContacts } from '../lib/demo.js';
import { canBulkImport } from '../lib/csvImport.js';
import { useAuth } from '../context/AuthContext.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';

export function ContactsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = canBulkImport(user?.role);
  const [rows, setRows] = useState(() => getDemoContacts());
  const [demo, setDemo] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    contactsApi
      .list()
      .then((data) => {
        const { rows: resolved, _demo } = mergeContacts(data);
        setRows(resolved);
        setDemo(_demo);
      })
      .catch(() => {
        setRows(getDemoContacts());
        setDemo(true);
      });
  }, []);

  const columns = [
    { key: 'full_name', label: 'Name', render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: 'city', label: 'City' },
    { key: 'classification', label: 'Class', render: (r) => r.classification?.replace('_', ' ') ?? '—' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <div className="flex gap-1">
          <Pill tone={statusTone(r.status)}>{r.status}</Pill>
          {r.is_blacklisted && <Pill tone="danger">Blacklisted</Pill>}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={MODULES.contactDatabase.pageTitle}
        subtitle={MODULES.contactDatabase.subtitle}
        actions={
          <>
            {canImport && (
              <Link to="/import" className="btn-secondary">Bulk Import</Link>
            )}
            <button type="button" className="btn-secondary" onClick={() => setQuickOpen(true)}>Quick Add</button>
            <button type="button" className="btn-primary">+ Contact</button>
          </>
        }
      />

      <DemoBanner show={demo} />

      <FilterBar filters={['Name', 'Mobile', 'City', 'Category', 'Tags', 'Open to Paid', 'Open to Barter', 'Classification', 'Status']} />

      <DataTable columns={columns} rows={rows} onRowClick={(row) => navigate(`/contacts/${row.id}`)} />

      <QuickAddModal open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

function QuickAddModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      title="Quick Add"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-secondary">Save & Add to Campaign…</button>
          <button type="button" className="btn-primary" onClick={onClose}>Save</button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="block text-2xs text-ink-secondary">
          Full name
          <input className="input-field mt-1" placeholder="Creator name" />
        </label>
        <label className="block text-2xs text-ink-secondary">
          Mobile number
          <input className="input-field mt-1" placeholder="+91…" />
        </label>
        <label className="block text-2xs text-ink-secondary">
          Instagram URL
          <input className="input-field mt-1" placeholder="https://instagram.com/…" />
        </label>
        <label className="block text-2xs text-ink-secondary">
          City
          <input className="input-field mt-1" placeholder="Delhi" />
        </label>
      </div>
    </Modal>
  );
}

export function ContactProfilePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={MODULES.contactProfile.pageTitle}
        subtitle={MODULES.contactProfile.subtitle}
        actions={<button type="button" className="btn-secondary">Edit</button>}
      />

      <div className="panel p-5">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Aisha K.</h2>
        <p className="text-2xs text-ink-secondary">Micro · Delhi · Luxury · UGC</p>
        <p className="mt-2 text-2xs text-ink-tertiary">
          Total: 6 collabs · Last: Apr 2026 · ★4.3 · Would work again 83%
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {CONTACT_PROFILE_TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            className={`shrink-0 border-b-2 px-3 py-2 text-2xs font-medium ${
              i === 0 ? 'border-brand text-brand' : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="panel p-5 text-2xs text-ink-secondary">
        Read-first profile with stored metrics. Engagement editing stays campaign-scoped.
      </div>
    </div>
  );
}
