import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilterBar, DataTable, MetricStrip } from '../components/ui/DataKit.jsx';
import { Drawer } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill, healthTone, formatStatus, formatDate, formatFee, statusTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { campaignsApi, engagementsApi } from '../lib/api.js';
import { MOCK_CONTACTS } from '../data/mock.js';
import {
  getDemoCampaign,
  getDemoEngagementsForCampaign,
  pickList,
  pickRecord,
} from '../lib/demo.js';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';

export function CampaignViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(() => getDemoCampaign(id));
  const [engagements, setEngagements] = useState(() => getDemoEngagementsForCampaign(id));
  const [demo, setDemo] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setCampaign(getDemoCampaign(id));
    setEngagements(getDemoEngagementsForCampaign(id));
    setDemo(true);

    Promise.all([
      campaignsApi.get(id).catch(() => null),
      engagementsApi.byCampaign(id).catch(() => []),
    ]).then(([camp, engs]) => {
      const campEmpty = !camp?.campaign_name;
      const engsEmpty = !Array.isArray(engs) || engs.length === 0;
      setCampaign(pickRecord(camp, getDemoCampaign(id)));
      setEngagements(pickList(engs, getDemoEngagementsForCampaign(id)));
      setDemo(campEmpty || engsEmpty);
    });
  }, [id]);

  const columns = [
    {
      key: 'contact_name',
      label: 'Creator',
      render: (r) => (
        <span className="font-medium text-brand">{r.contact_name}</span>
      ),
    },
    { key: 'owner_name', label: 'Owner' },
    {
      key: 'conversation_status',
      label: 'Status',
      render: (r) => <Pill tone={statusTone(r.conversation_status)}>{formatStatus(r.conversation_status)}</Pill>,
    },
    { key: 'next_follow_up_date', label: 'Next FU', render: (r) => formatDate(r.next_follow_up_date) },
    { key: 'agreed_fee', label: 'Fee', render: (r) => formatFee(r.agreed_fee) },
    {
      key: 'open',
      label: '',
      render: () => <span className="text-2xs font-medium text-brand">Open →</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={campaign.campaign_name}
        subtitle={`${MODULES.campaignView.pageTitle} · ${campaign.brand_name}`}
        actions={<button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>Add Creators</button>}
      />

      <DemoBanner show={demo} />

      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MetricStrip
            items={[
              { label: 'Target', value: campaign.target_collaborations ?? '—' },
              { label: 'Completed', value: campaign.completed_collaborations, tone: 'accent' },
              { label: 'Remaining', value: campaign.remaining_collaborations ?? '—' },
              {
                label: 'Health',
                value: campaign.campaign_health === 'not_set'
                  ? 'No target set'
                  : `${campaign.achievement_pct ?? 0}%`,
                tone: 'accent',
              },
            ]}
          />
          <Pill tone={healthTone(campaign.campaign_health)}>
            {campaign.campaign_health === 'not_set' ? 'Not set' : campaign.campaign_health}
          </Pill>
        </div>
      </div>

      <p className="text-2xs text-ink-tertiary">
        Click any creator row to open their <span className="font-medium text-ink-secondary">Engagement Record</span>
      </p>

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
