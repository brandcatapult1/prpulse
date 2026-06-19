import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilterBar, DataTable, MetricStrip } from '../components/ui/DataKit.jsx';
import { Drawer } from '../components/ui/Primitives.jsx';
import { Pill, healthTone, formatStatus, formatDate, formatFee, statusTone } from '../lib/format.jsx';
import { campaignsApi, engagementsApi } from '../lib/api.js';
import { MOCK_CAMPAIGN, MOCK_ENGAGEMENTS, MOCK_CONTACTS } from '../data/mock.js';

export function CampaignViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(MOCK_CAMPAIGN);
  const [engagements, setEngagements] = useState(MOCK_ENGAGEMENTS);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    campaignsApi.get(id).then(setCampaign).catch(() => {});
    engagementsApi.byCampaign(id).then((rows) => {
      if (rows.length) setEngagements(rows);
    }).catch(() => {});
  }, [id]);

  const columns = [
    {
      key: 'contact_name',
      label: 'Creator',
      render: (r) => <span className="font-medium">{r.contact_name}</span>,
    },
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
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-ink">{campaign.campaign_name}</h1>
              <Pill tone="success">{campaign.status}</Pill>
            </div>
            <p className="text-2xs text-ink-secondary">{campaign.brand_name}</p>
            <MetricStrip
              items={[
                { label: 'Target', value: campaign.target_collaborations ?? '—' },
                { label: 'Completed', value: campaign.completed_collaborations, tone: 'accent' },
                { label: 'Remaining', value: campaign.remaining_collaborations ?? '—' },
                {
                  label: 'Health',
                  value: campaign.campaign_health === 'not_set' ? 'Not set' : `${campaign.achievement_pct ?? 0}% ${campaign.campaign_health}`,
                  tone: 'accent',
                },
              ]}
            />
          </div>
          <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>Add creators</button>
        </div>
        {campaign.campaign_health && campaign.campaign_health !== 'not_set' && (
          <div className="mt-4">
            <Pill tone={healthTone(campaign.campaign_health)}>{campaign.campaign_health}</Pill>
          </div>
        )}
      </div>

      <FilterBar filters={['Status', 'Owner', 'Interest', 'Follow-up due']} />

      <DataTable
        columns={columns}
        rows={engagements}
        onRowClick={(row) => navigate(`/engagements/${row.id}`)}
      />

      <AddCreatorsDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function AddCreatorsDrawer({ open, onClose }) {
  const [selected, setSelected] = useState([]);
  const toggle = (rowId) => setSelected((s) => (s.includes(rowId) ? s.filter((x) => x !== rowId) : [...s, rowId]));

  return (
    <Drawer
      open={open}
      title="Add creators"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-2xs text-ink-tertiary">{selected.length} selected · blacklisted hidden</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary">Quick Add</button>
            <button type="button" className="btn-primary">Add to campaign</button>
          </div>
        </div>
      }
    >
      <FilterBar filters={['Category', 'City', 'Classification', 'Tags', 'Saved list']} />
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
