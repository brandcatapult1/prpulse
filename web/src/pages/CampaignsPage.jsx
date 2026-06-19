import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable } from '../components/ui/DataKit.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill, healthTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { campaignsApi } from '../lib/api.js';
import { getDemoCampaigns, pickList } from '../lib/demo.js';
import { canBulkImport } from '../lib/csvImport.js';
import { useAuth } from '../context/AuthContext.jsx';

export function CampaignsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = canBulkImport(user?.role);
  const [rows, setRows] = useState(() => getDemoCampaigns());
  const [demo, setDemo] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    campaignsApi
      .list()
      .then((data) => {
        const resolved = pickList(data, getDemoCampaigns());
        setRows(resolved);
        setDemo(!data?.length);
      })
      .catch(() => {
        setRows(getDemoCampaigns());
        setDemo(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    {
      key: 'campaign_name',
      label: 'Campaign',
      render: (r) => (
        <Link to={`/campaigns/${r.id}`} className="font-medium text-ink hover:text-brand" onClick={(e) => e.stopPropagation()}>
          {r.campaign_name}
        </Link>
      ),
    },
    { key: 'brand_name', label: 'Brand' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <Pill tone={r.status === 'active' ? 'success' : 'default'}>{r.status}</Pill>,
    },
    {
      key: 'progress',
      label: 'Progress',
      render: (r) => (
        <span className="tabular-nums text-ink-secondary">
          {r.completed_collaborations}/{r.target_collaborations ?? '—'}
        </span>
      ),
    },
    {
      key: 'health',
      label: 'Health',
      render: (r) => (
        <Pill tone={healthTone(r.campaign_health)}>
          {r.campaign_health === 'not_set' ? 'No target set' : r.campaign_health}
        </Pill>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={MODULES.campaigns.pageTitle}
        subtitle={MODULES.campaigns.subtitle}
        actions={
          <>
            {canImport && (
              <Link to="/import" className="btn-secondary">Bulk Import</Link>
            )}
            <button type="button" className="btn-primary">+ Campaign</button>
          </>
        }
      />

      <DemoBanner show={demo} />

      {loading ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-tertiary">Loading…</div>
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={(r) => navigate(`/campaigns/${r.id}`)} />
      )}
    </div>
  );
}
