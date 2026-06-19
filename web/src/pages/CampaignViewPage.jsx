import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar, DataTable } from '../components/ui/DataKit.jsx';
import { Drawer } from '../components/ui/Primitives.jsx';
import { Pill, healthTone, formatStatus, formatDate, formatFee, statusTone } from '../lib/format.jsx';
import { MOCK_CAMPAIGN, MOCK_ENGAGEMENTS, MOCK_CONTACTS } from '../data/mock.js';

export function CampaignViewPage() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const c = MOCK_CAMPAIGN;

  const columns = [
    { key: 'contact_name', label: 'Creator' },
    { key: 'owner_name', label: 'Owner' },
    {
      key: 'conversation_status',
      label: 'Status',
      render: (r) => <Pill tone={statusTone(r.conversation_status)}>{formatStatus(r.conversation_status)}</Pill>,
    },
    { key: 'next_follow_up_date', label: 'Next FU', render: (r) => formatDate(r.next_follow_up_date) },
    { key: 'agreed_fee', label: 'Fee', render: (r) => formatFee(r.agreed_fee) },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-surface-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{c.campaign_name}</h1>
            <p className="text-sm text-slate-500">{c.brand_name} · Active</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span>Target {c.target_collaborations}</span>
              <span>Completed {c.completed_collaborations}</span>
              <span>Remaining {c.remaining_collaborations}</span>
              <span>{c.achievement_pct}%</span>
              <Pill tone={healthTone(c.campaign_health)}>{c.campaign_health === 'not_set' ? 'No target set' : c.campaign_health}</Pill>
            </div>
          </div>
          <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>Add Creators</button>
        </div>
      </div>

      <FilterBar filters={['Status', 'Owner', 'Interest', 'Follow-up due']} />

      <DataTable
        columns={columns}
        rows={MOCK_ENGAGEMENTS}
        onRowClick={(row) => navigate(`/engagements/${row.id}`)}
      />

      <AddCreatorsDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function AddCreatorsDrawer({ open, onClose }) {
  const [selected, setSelected] = useState([]);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Drawer
      open={open}
      title="Add Creators"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Blacklisted hidden · {selected.length} selected</span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost">Quick Add new</button>
            <button type="button" className="btn-primary">Add {selected.length} to campaign</button>
          </div>
        </div>
      }
    >
      <FilterBar filters={['Category', 'City', 'Platform', 'Classification', 'Paid/Barter', 'Tags', 'Saved List']} />
      <div className="mt-4">
        <DataTable
          selectable
          selected={selected}
          onSelect={toggle}
          columns={[
            { key: 'full_name', label: 'Name' },
            { key: 'city', label: 'City' },
            { key: 'classification', label: 'Class' },
          ]}
          rows={MOCK_CONTACTS.filter((c) => !c.is_blacklisted)}
        />
      </div>
    </Drawer>
  );
}
