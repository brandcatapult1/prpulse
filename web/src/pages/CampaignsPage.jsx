import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable } from '../components/ui/DataKit.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { HealthBadge } from '../components/ui/HealthBadge.jsx';
import { Pill } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { campaignsApi } from '../lib/api.js';
import { canBulkImport } from '../lib/csvImport.js';
import { useAuth } from '../context/AuthContext.jsx';

export function CampaignsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = canBulkImport(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    campaignsApi
      .list()
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => {
        setRows([]);
        setError(err.message ?? 'Could not load campaigns');
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
      render: (r) => <HealthBadge health={r.campaign_health} />,
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
            {canImport && (
              <button type="button" className="btn-primary" onClick={() => navigate('/import')}>
                + Campaign
              </button>
            )}
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-tertiary">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-tertiary">No campaigns yet.</div>
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={(r) => navigate(`/campaigns/${r.id}`)} />
      )}
    </div>
  );
}
