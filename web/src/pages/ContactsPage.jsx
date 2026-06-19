import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar, DataTable } from '../components/ui/DataKit.jsx';
import { Modal } from '../components/ui/Primitives.jsx';
import { Pill, statusTone } from '../lib/format.jsx';
import { MOCK_CONTACTS } from '../data/mock.js';

export function ContactsPage({ onQuickAdd }) {
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);

  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'city', label: 'City' },
    { key: 'classification', label: 'Class', render: (r) => r.classification?.toUpperCase() },
    {
      key: 'tags',
      label: 'Tags',
      render: (r) => (
        <div className="flex gap-1">
          {(r.tags ?? []).map((t) => <Pill key={t}>{t}</Pill>)}
        </div>
      ),
    },
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-slate-500">Find creators and act fast</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setQuickOpen(true)}>Quick Add</button>
      </div>

      <FilterBar filters={['Name', 'City', 'Category', 'Tags', 'Classification', 'Paid', 'Barter', 'Status']} />

      <DataTable
        columns={columns}
        rows={MOCK_CONTACTS}
        onRowClick={(row) => navigate(`/contacts/${row.id}`)}
      />

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
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onClose}>Save</button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="text-sm">
          Full Name
          <input className="input-field mt-1" placeholder="Creator name" />
        </label>
        <label className="text-sm">
          Mobile Number
          <input className="input-field mt-1" placeholder="+91…" />
        </label>
        <label className="text-sm">
          Instagram URL
          <input className="input-field mt-1" placeholder="https://instagram.com/…" />
        </label>
        <label className="text-sm">
          City
          <input className="input-field mt-1" placeholder="Delhi" />
        </label>
      </div>
    </Modal>
  );
}

export function ContactProfilePage() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-surface-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Aisha K.</h1>
            <p className="text-sm text-slate-500">Micro · Delhi · Luxury · UGC</p>
            <p className="mt-2 text-sm text-slate-600">Total: 6 collabs · Last: Apr 2026 · ★4.3 · WWA 83%</p>
          </div>
          <button type="button" className="btn-ghost">Edit</button>
        </div>
      </div>
      <div className="flex gap-2 border-b border-surface-border text-sm">
        {['Overview', 'Collaboration History', 'Active Engagements', 'Feedback', 'Notes'].map((tab) => (
          <button key={tab} type="button" className="border-b-2 border-accent px-3 py-2 font-medium text-accent first:pl-0">
            {tab}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-surface-border bg-white p-5 text-sm text-slate-600">
        Read-first profile with stored metrics. Engagement editing remains campaign-scoped.
      </div>
    </div>
  );
}
