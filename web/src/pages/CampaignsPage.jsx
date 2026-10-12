import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable, ListPagination } from '../components/ui/DataKit.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { HealthBadge } from '../components/ui/HealthBadge.jsx';
import { AddCampaignModal } from '../components/campaign/AddCampaignModal.jsx';
import { Pill } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { campaignsApi } from '../lib/api.js';
import { canBulkImport } from '../lib/csvImport.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All statuses' },
];

const DEFAULT_STATUS = 'active';
const PAGE_SIZE = 25;

export function CampaignsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = canBulkImport(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS);
  const [page, setPage] = useState(1);

  const loadCampaigns = useCallback(() => {
    setLoading(true);
    campaignsApi
      .list({ includeArchived: true })
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

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const brandOptions = useMemo(
    () => [...new Set(rows.map((r) => r.brand_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (brandFilter && r.brand_name !== brandFilter) return false;
      if (q && !`${r.campaign_name ?? ''} ${r.brand_name ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, brandFilter, statusFilter]);

  const filtersActive = Boolean(search.trim() || brandFilter || statusFilter !== DEFAULT_STATUS);

  // Back to page 1 whenever the filters change.
  useEffect(() => {
    setPage(1);
  }, [search, brandFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
              + Campaign
            </button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{error}</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="input-field min-w-[200px] flex-1 sm:max-w-xs"
            placeholder="Search campaign or brand…"
            aria-label="Search campaigns"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input-field w-auto"
            aria-label="Filter by brand"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
          >
            <option value="">All brands</option>
            {brandOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            className="input-field w-auto"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setSearch(''); setBrandFilter(''); setStatusFilter(DEFAULT_STATUS); }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-tertiary">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-tertiary">
          No campaigns yet.{' '}
          <button type="button" className="text-brand hover:underline" onClick={() => setAddOpen(true)}>
            Create one
          </button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-tertiary">
          No campaigns match your filters.
        </div>
      ) : (
        <>
          <DataTable columns={columns} rows={pageRows} responsive onRowClick={(r) => navigate(`/campaigns/${r.id}`)} />
          <ListPagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={filteredRows.length}
            onPageChange={setPage}
          />
        </>
      )}

      <AddCampaignModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(campaign) => {
          loadCampaigns();
          if (campaign?.id) navigate(`/campaigns/${campaign.id}`);
        }}
      />
    </div>
  );
}
