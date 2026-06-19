import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar, DataTable } from '../components/ui/DataKit.jsx';
import { Modal } from '../components/ui/Primitives.jsx';
import { Pill, statusTone } from '../lib/format.jsx';
import { contactsApi } from '../lib/api.js';
import { MOCK_CONTACTS } from '../data/mock.js';

export function ContactsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(MOCK_CONTACTS);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    contactsApi
      .list()
      .then((data) => {
        if (data.length) setRows(data);
      })
      .catch(() => {});
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
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-sub mt-0.5">Find creators and act fast</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setQuickOpen(true)}>Quick Add</button>
      </header>

      <FilterBar filters={['Name', 'City', 'Category', 'Tags', 'Classification', 'Paid', 'Status']} />

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
          Mobile
          <input className="input-field mt-1" placeholder="+91…" />
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
      <CardHeader name="Aisha K." meta="Micro · Delhi" stats="6 collabs · Last Apr 2026 · ★4.3" />
      <div className="flex gap-1 border-b border-line">
        {['Overview', 'History', 'Engagements', 'Feedback', 'Notes'].map((tab, i) => (
          <button
            key={tab}
            type="button"
            className={`border-b-2 px-3 py-2 text-2xs font-medium ${
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

function CardHeader({ name, meta, stats }) {
  return (
    <div className="panel flex items-start justify-between gap-4 p-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">{name}</h1>
        <p className="text-2xs text-ink-secondary">{meta}</p>
        <p className="mt-2 text-2xs text-ink-tertiary">{stats}</p>
      </div>
      <button type="button" className="btn-secondary">Edit</button>
    </div>
  );
}
