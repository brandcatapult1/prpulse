import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable } from '../components/ui/DataKit.jsx';
import { Pill, healthTone } from '../lib/format.jsx';
import { campaignsApi } from '../lib/api.js';

export function CampaignsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    campaignsApi
      .list()
      .then(setRows)
      .catch(() => setRows([]))
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
          {r.campaign_health === 'not_set' ? 'Not set' : r.campaign_health}
        </Pill>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="page-title">Campaigns</h1>
        <p className="page-sub mt-0.5">Run outreach and track progress</p>
      </header>
      {loading ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-tertiary">Loading…</div>
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={(r) => navigate(`/campaigns/${r.id}`)} />
      )}
    </div>
  );
}
