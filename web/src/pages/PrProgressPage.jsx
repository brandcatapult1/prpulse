import { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { MODULES } from '../lib/modules.js';
import { prProgressApi } from '../lib/api.js';

const STAGE_LABELS = {
  not_contacted: 'Not contacted',
  in_conversation: 'In conversation',
  scheduled: 'Scheduled',
  no_response: 'No response',
  awaiting_final_deliverables: 'Awaiting deliverables',
  collaboration_complete: 'Completed',
};
const TYPE_LABELS = { reel: 'Reel', story: 'Story', static_carousel_post: 'Post / Carousel', other: 'Other' };
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

  return (
    <tr>
      <td colSpan={colSpan} className="border border-line bg-zinc-50 p-3">
        {error ? (
          <p className="text-2xs text-red-700">{error}</p>
        ) : !rows ? (
          <p className="text-2xs text-ink-secondary">Loading creators…</p>
        ) : rows.length === 0 ? (
          <p className="text-2xs text-ink-secondary">No creators {managerId ? 'for this account manager ' : ''}in this campaign yet.</p>
        ) : (
          <table className="w-full border-collapse text-2xs">
            <thead>
              <tr className="text-left text-ink-tertiary">
                <th className="border-b border-line px-2 py-1.5 font-medium">Creator</th>
                <th className="border-b border-line px-2 py-1.5 font-medium">Account manager</th>
                <th className="border-b border-line px-2 py-1.5 font-medium">Stage</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-medium">Posted</th>
                <th className="border-b border-line px-2 py-1.5 font-medium">Deliverables</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const total = c.deliverables.length;
                const posted = c.deliverables.filter((d) => d.status === 'posted').length;
                return (
                  <tr key={c.engagement_id} className="align-top">
                    <td className="border-b border-line px-2 py-1.5 font-medium text-ink">{c.full_name}</td>
                    <td className="border-b border-line px-2 py-1.5">{c.manager_name ?? '—'}</td>
                    <td className="border-b border-line px-2 py-1.5">{stageLabel(c.stage)}</td>
                    <td className="border-b border-line px-2 py-1.5 text-center tabular-nums">{posted}/{total}</td>
                    <td className="border-b border-line px-2 py-1.5">
                      {c.deliverables.filter((d) => !d.carried).length === 0 ? '—' : (
                        <ul className="space-y-0.5">
                          {c.deliverables.filter((d) => !d.carried).map((d, i) => (
                            <li key={i}>
                              {TYPE_LABELS[d.type] ?? d.type}
                              {d.quantity > 1 ? ` ×${d.quantity}` : ''} ·{' '}
                              <span className={d.status === 'posted' ? 'text-green-700' : 'text-ink-secondary'}>
                                {d.status === 'posted'
                                  ? `Posted${d.published_date ? ` ${dateLabel(d.published_date)}` : ''}`
                                  : `${d.status[0].toUpperCase()}${d.status.slice(1)}${d.due_date ? ` · due ${dateLabel(d.due_date)}` : ''}`}
                              </span>
                              {d.content_link && (
                                <a href={d.content_link} target="_blank" rel="noreferrer" className="ml-1 text-brand hover:underline">
                                  link
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {carried.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1.5 text-2xs font-semibold text-amber-800">
              Balance from previous cycles ({carried.length})
            </h3>
            <table className="w-full border-collapse text-2xs">
              <thead>
                <tr className="bg-amber-50 text-left text-ink-tertiary">
                  <th className="border-b border-line px-2 py-1.5 font-medium">Creator</th>
                  <th className="border-b border-line px-2 py-1.5 font-medium">Account manager</th>
                  <th className="border-b border-line px-2 py-1.5 font-medium">Deliverable</th>
                  <th className="border-b border-line px-2 py-1.5 font-medium">Was due</th>
                  <th className="border-b border-line px-2 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {carried.map((item, i) => (
                  <tr key={i}>
                    <td className="border-b border-line px-2 py-1.5 font-medium text-ink">{item.creator}</td>
                    <td className="border-b border-line px-2 py-1.5">{item.manager ?? '—'}</td>
                    <td className="border-b border-line px-2 py-1.5">
                      {TYPE_LABELS[item.d.type] ?? item.d.type}{item.d.quantity > 1 ? ` ×${item.d.quantity}` : ''}
                    </td>
                    <td className="border-b border-line px-2 py-1.5">{dateLabel(item.d.due_date)}</td>
                    <td className="border-b border-line px-2 py-1.5 capitalize">{item.d.status}</td>
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

const COLUMNS = [
  { key: 'campaign_name', label: 'Campaign', align: 'left' },
  { key: 'managers', label: 'Account manager', align: 'left' },
  { key: 'total', label: 'Target collaboration' },
  { key: 'creators', label: 'Creator name', align: 'left' },
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
  const [creatorInput, setCreatorInput] = useState('');
  const [creator, setCreator] = useState('');
  const [cycle, setCycle] = useState('');
  const [currentCycle, setCurrentCycle] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'campaign_name', dir: 'asc' });

  useEffect(() => {
    if (!allowed) return;
    prProgressApi.campaigns().then((rows) => setCampaigns(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, [allowed]);

  useEffect(() => {
    const t = setTimeout(() => setCreator(creatorInput.trim()), 350);
    return () => clearTimeout(t);
  }, [creatorInput]);

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
    [data, sort],
  );

  if (!allowed) return <Navigate to="/" replace />;

  const toggleOpen = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

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
          <span className="mb-1.5 block text-2xs font-medium text-ink-secondary">Creator name</span>
          <input
            className="input-field w-56"
            type="search"
            value={creatorInput}
            onChange={(e) => setCreatorInput(e.target.value)}
            placeholder="Search creator"
          />
        </label>
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

      <div className="panel overflow-hidden p-0">
        <div className="border-b border-line px-4 py-3 text-center text-base font-semibold text-ink">
          PR Progress Report - As of {data?.as_of ?? '…'}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-100">
                {COLUMNS.map((col) => {
                  const active = sort.key === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="border border-line p-0"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`flex w-full items-center gap-1 px-3 py-2 text-2xs font-semibold text-ink hover:bg-zinc-200 ${
                          col.align === 'left' ? 'justify-start text-left' : 'justify-center text-center'
                        }`}
                      >
                        {col.label}
                        <span className={active ? 'text-brand' : 'text-ink-tertiary'} aria-hidden>
                          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-2xs text-ink-secondary">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-2xs text-ink-secondary">No campaigns have this cycle.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className={row.manager_count > 1 ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-zinc-50'}
                    title={row.manager_count > 1 ? `${row.manager_count} account managers on this campaign` : undefined}>
                    {COLUMNS.map((col, i) => (
                      <td
                        key={col.key}
                        className={`border border-line px-3 py-2 ${col.align === 'left' ? 'text-left' : 'text-center tabular-nums'}`}
                      >
                        {i === 0 ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleOpen(row.id)}
                              aria-expanded={openIds.has(row.id)}
                              aria-label={openIds.has(row.id) ? 'Hide creators' : 'Show creators'}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand/90"
                            >
                              <svg
                                className={`h-3.5 w-3.5 transition-transform ${openIds.has(row.id) ? 'rotate-90' : ''}`}
                                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                              >
                                <path d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <span>{row[col.key]}</span>
                          </div>
                        ) : (
                          row[col.key] === '' || row[col.key] == null ? '—' : row[col.key]
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
