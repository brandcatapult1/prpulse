import { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { MODULES } from '../lib/modules.js';
import { prProgressApi } from '../lib/api.js';
import { Pill } from '../lib/format.jsx';

const STAGE_LABELS = {
  not_contacted: 'Not contacted',
  in_conversation: 'In conversation',
  scheduled: 'Scheduled',
  no_response: 'No response',
  awaiting_final_deliverables: 'Awaiting deliverables',
  collaboration_complete: 'Completed',
};
const TYPE_LABELS = { reel: 'Reel', story: 'Story', static_carousel_post: 'Post / Carousel', other: 'Other' };
const stageTone = (s) => {
  if (s === 'collaboration_complete') return 'success';
  if (s === 'awaiting_final_deliverables') return 'warning';
  if (s === 'in_conversation' || s === 'scheduled') return 'info';
  if (s?.startsWith('dropped')) return 'danger';
  return 'muted';
};
const stageLabel = (s) => STAGE_LABELS[s] ?? (s?.startsWith('dropped') ? 'Dropped' : s);
const dateLabel = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

/** Expanded row: every creator on the campaign with their deliverables. */
function CreatorDeliverables({ campaignId, managerId, creator, before, prev, colSpan }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    prProgressApi.creators(campaignId, managerId, creator, before, prev)
      .then((d) => { if (!cancelled) setRows(Array.isArray(d) ? d : []); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load creators'); });
    return () => { cancelled = true; };
  }, [campaignId, managerId, creator, before, prev]);

  const carried = (rows ?? []).flatMap((c) =>
    c.deliverables.filter((d) => d.carried).map((d) => ({ creator: c.full_name, manager: c.manager_name, d })));

  const TH = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary';
  const TD = 'border-t border-line/60 px-3 py-3 align-top';

  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-line bg-zinc-50/70 px-4 py-4 sm:px-8">
        {error ? (
          <p className="text-2xs text-red-700">{error}</p>
        ) : !rows ? (
          <p className="text-2xs text-ink-secondary">Loading creators…</p>
        ) : rows.length === 0 ? (
          <p className="text-2xs text-ink-secondary">No creators {managerId ? 'for this account manager ' : ''}in this campaign yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            <table className="w-full border-collapse text-2xs">
              <thead className="bg-zinc-50">
                <tr>
                  <th className={TH}>Creator</th>
                  <th className={TH}>Account manager</th>
                  <th className={TH}>Stage</th>
                  <th className={`${TH} text-center`}>Posted</th>
                  <th className={TH}>Deliverables</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const total = c.deliverables.length;
                  const posted = c.deliverables.filter((d) => d.status === 'posted').length;
                  const current = c.deliverables.filter((d) => !d.carried);
                  return (
                    <tr key={c.engagement_id} className="transition-colors hover:bg-brand-soft/30">
                      <td className={`${TD} text-sm font-medium text-ink`}>{c.full_name}</td>
                      <td className={`${TD} text-ink-secondary`}>{c.manager_name ?? '—'}</td>
                      <td className={TD}><Pill tone={stageTone(c.stage)}>{stageLabel(c.stage)}</Pill></td>
                      <td className={`${TD} text-center`}>
                        <span className={`inline-block min-w-[2.5rem] rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                          total > 0 && posted === total ? 'bg-teal-50 text-teal-700' : 'bg-zinc-100 text-ink-secondary'
                        }`}>
                          {posted}/{total}
                        </span>
                      </td>
                      <td className={TD}>
                        {current.length === 0 ? <span className="text-ink-tertiary">—</span> : (
                          <div className="flex flex-wrap gap-1.5">
                            {current.map((d, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 ${
                                  d.status === 'posted'
                                    ? 'bg-teal-50 text-teal-800 ring-teal-100'
                                    : 'bg-white text-ink-secondary ring-line'
                                }`}
                              >
                                <span className="font-medium">
                                  {TYPE_LABELS[d.type] ?? d.type}{d.quantity > 1 ? ` ×${d.quantity}` : ''}
                                </span>
                                <span className="opacity-60">·</span>
                                <span>
                                  {d.status === 'posted'
                                    ? `Posted${d.published_date ? ` ${dateLabel(d.published_date)}` : ''}`
                                    : `${d.status[0].toUpperCase()}${d.status.slice(1)}${d.due_date ? ` · due ${dateLabel(d.due_date)}` : ''}`}
                                </span>
                                {d.content_link && (
                                  <a href={d.content_link} target="_blank" rel="noreferrer" className="ml-0.5 font-medium text-brand hover:underline">
                                    link
                                  </a>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {carried.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
            <h3 className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-2xs font-semibold text-amber-800">
              Balance from previous cycles
              <span className="rounded-full bg-white px-2 py-0.5 tabular-nums ring-1 ring-amber-200">{carried.length}</span>
            </h3>
            <table className="w-full border-collapse text-2xs">
              <thead>
                <tr>
                  <th className={TH}>Creator</th>
                  <th className={TH}>Account manager</th>
                  <th className={TH}>Deliverable</th>
                  <th className={TH}>Was due</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {carried.map((item, i) => (
                  <tr key={i} className="transition-colors hover:bg-amber-50/50">
                    <td className={`${TD} font-medium text-ink`}>{item.creator}</td>
                    <td className={`${TD} text-ink-secondary`}>{item.manager ?? '—'}</td>
                    <td className={TD}>
                      {TYPE_LABELS[item.d.type] ?? item.d.type}{item.d.quantity > 1 ? ` ×${item.d.quantity}` : ''}
                    </td>
                    <td className={TD}>{dateLabel(item.d.due_date)}</td>
                    <td className={TD}><Pill tone="warning"><span className="capitalize">{item.d.status}</span></Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

const STATUS_TONE = { Ongoing: 'success', Completed: 'info', Paused: 'warning', Draft: 'muted' };

/** One table cell: zeros are quiet, key numbers get a soft pill. */
function CellValue({ colKey, row }) {
  const v = row[colKey];
  if (colKey === 'status') return <Pill tone={STATUS_TONE[v] ?? 'default'}>{v}</Pill>;
  if (colKey === 'managers') return <span className="text-ink-secondary">{v || '—'}</span>;
  if (v === '' || v == null) return <span className="text-ink-tertiary">—</span>;
  if (typeof v !== 'number') return v;
  if (v === 0) return <span className="text-ink-tertiary">0</span>;
  if (colKey === 'completed') {
    return <span className="inline-block min-w-[2rem] rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-700">{v}</span>;
  }
  if (colKey === 'balance_prev') {
    return <span className="inline-block min-w-[2rem] rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">{v}</span>;
  }
  if (colKey === 'remaining') return <span className="font-semibold text-ink">{v}</span>;
  return <span className="font-medium text-ink">{v}</span>;
}

const COLUMNS = [
  { key: 'campaign_name', label: 'Campaign', align: 'left' },
  { key: 'managers', label: 'Account manager', align: 'left' },
  { key: 'total', label: 'Target collaboration' },
  { key: 'in_conversation', label: 'In Conversation' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'awaiting', label: 'Awaiting Deliverables' },
  { key: 'completed', label: 'Completed' },
  { key: 'balance_prev', label: 'Balance from last month' },
  { key: 'status', label: 'Status' },
  { key: 'remaining', label: 'Remaining to complete' },
];

function sortRows(rows, key, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const cmp = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x ?? '').localeCompare(String(y ?? ''), undefined, { sensitivity: 'base', numeric: true });
    return cmp * sign || a.campaign_name.localeCompare(b.campaign_name);
  });
}

export function PrProgressPage() {
  const { user } = useAuth();
  const allowed = user?.role === 'admin' || user?.role === 'senior_manager';
  const canFilterManagers = user?.role === 'admin' || user?.role === 'senior_manager';

  const [cycles, setCycles] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [managers, setManagers] = useState([]);
  const [managerId, setManagerId] = useState('');
  const creator = ''; // the creator-name filter was removed from this page
  const [cycle, setCycle] = useState('');
  const [currentCycle, setCurrentCycle] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [openIds, setOpenIds] = useState(() => new Set());
  const sort = { key: 'campaign_name', dir: 'asc' }; // rows are always listed A–Z by campaign

  useEffect(() => {
    if (!allowed) return;
    prProgressApi.campaigns().then((rows) => setCampaigns(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, [allowed]);

  useEffect(() => {
    if (!canFilterManagers) return;
    prProgressApi.managers(campaignId)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setManagers(list);
        setManagerId((cur) => (cur && campaignId && !list.some((m) => m.id === cur && m.in_campaign) ? '' : cur));
      })
      .catch(() => {});
  }, [canFilterManagers, campaignId]);

  useEffect(() => {
    if (!allowed) return;
    setCycle('');
    prProgressApi.cycles(campaignId)
      .then((p) => {
        setCycles(p.cycles ?? []);
        setCurrentCycle(p.current != null ? String(p.current) : '');
        setCycle(p.current != null ? String(p.current) : '');
      })
      .catch((err) => setError(err.message ?? 'Could not load cycles'));
  }, [allowed, campaignId]);

  useEffect(() => {
    if (!cycle) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    prProgressApi.report(cycle, campaignId, managerId, creator)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load PR progress'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cycle, campaignId, managerId, creator]);

  const rows = useMemo(
    () => (data ? sortRows(data.rows, sort.key, sort.dir) : []),
    [data],
  );

  if (!allowed) return <Navigate to="/" replace />;

  const toggleOpen = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function exportPdf() {
    if (!cycle || exporting) return;
    setExporting(true);
    try {
      const { blob, contentDisposition } = await prProgressApi.pdf(cycle, sort.key, sort.dir, campaignId, managerId, creator, [...openIds]);
      const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] ?? 'pr-progress.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message ?? 'Could not export PDF');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={MODULES.prProgress.pageTitle}
        subtitle={user?.role === 'campaign_manager' ? 'Progress of your campaigns for a cycle' : MODULES.prProgress.subtitle}
        actions={
          <button type="button" className="btn-primary" disabled={!cycle || loading || exporting} onClick={exportPdf}>
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-2xs font-medium text-ink-secondary">Campaign</span>
          <select className="input-field w-64" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.campaign_name}</option>
            ))}
          </select>
        </label>
        {canFilterManagers && (
        <label className="block">
          <span className="mb-1.5 block text-2xs font-medium text-ink-secondary">Account manager</span>
          <select className="input-field w-56" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">All account managers</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id} disabled={Boolean(campaignId) && !m.in_campaign}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-2xs font-medium text-ink-secondary">Cycle</span>
          <select className="input-field w-80" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {cycles.length === 0 && <option value="">No cycles</option>}
            {cycles.map((c) => (
              <option key={c.number} value={c.number}>
                {c.label ?? `Cycle ${c.number}`}{c.range ? ` (${c.range})` : ''}
              </option>
            ))}
          </select>
          {campaignId && cycle && cycle === currentCycle && (
            <span className="mt-1 block text-2xs text-ink-tertiary">Current cycle</span>
          )}
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-gradient-to-r from-brand-soft/70 to-white px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight text-ink">PR Progress Report</h2>
          <span className="rounded-full bg-white px-3 py-1 text-2xs font-medium text-ink-secondary ring-1 ring-line">
            As of {data?.as_of ?? '…'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`border-b border-line bg-zinc-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary ${
                      col.align === 'left' ? 'text-left' : 'text-center'
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-2xs text-ink-secondary">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-2xs text-ink-secondary">No campaigns have this cycle.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="group transition-colors hover:bg-brand-soft/40">
                    {COLUMNS.map((col, i) => (
                      <td
                        key={col.key}
                        className={`border-b border-line/60 px-4 py-3.5 ${col.align === 'left' ? 'text-left' : 'text-center tabular-nums'}`}
                      >
                        {i === 0 ? (
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleOpen(row.id)}
                              aria-expanded={openIds.has(row.id)}
                              aria-label={openIds.has(row.id) ? 'Hide creators' : 'Show creators'}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:bg-zinc-100 hover:text-ink"
                            >
                              <span className={`transition-transform ${openIds.has(row.id) ? 'rotate-90' : ''}`} aria-hidden>▸</span>
                            </button>
                            <span className="font-medium text-ink">{row[col.key]}</span>
                          </div>
                        ) : (
                          <CellValue colKey={col.key} row={row} />
                        )}
                      </td>
                    ))}
                  </tr>
                  {openIds.has(row.id) && <CreatorDeliverables campaignId={row.id} managerId={managerId} creator={creator} before={row.cycle_start} prev={row.prev_start} colSpan={COLUMNS.length} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
