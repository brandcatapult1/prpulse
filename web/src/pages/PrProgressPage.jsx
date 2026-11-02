import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { MODULES } from '../lib/modules.js';
import { prProgressApi } from '../lib/api.js';

const COLUMNS = [
  { key: 'campaign_name', label: 'Campaign', align: 'left' },
  { key: 'managers', label: 'Account manager', align: 'left' },
  { key: 'total', label: 'Total deliverables' },
  { key: 'in_conversation', label: 'In Conversation' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'awaiting', label: 'Awaiting Deliverables' },
  { key: 'completed', label: 'Completed' },
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
  const allowed = Boolean(user);

  const [cycles, setCycles] = useState([]);
  const [cycle, setCycle] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: 'campaign_name', dir: 'asc' });

  useEffect(() => {
    if (!allowed) return;
    prProgressApi.cycles()
      .then((p) => {
        setCycles(p.cycles ?? []);
        if (p.current != null) setCycle(String(p.current));
      })
      .catch((err) => setError(err.message ?? 'Could not load cycles'));
  }, [allowed]);

  useEffect(() => {
    if (!cycle) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    prProgressApi.report(cycle)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load PR progress'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cycle]);

  const rows = useMemo(
    () => (data ? sortRows(data.rows, sort.key, sort.dir) : []),
    [data, sort],
  );

  if (!allowed) return <Navigate to="/" replace />;

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  async function exportPdf() {
    if (!cycle || exporting) return;
    setExporting(true);
    try {
      const { blob, contentDisposition } = await prProgressApi.pdf(cycle, sort.key, sort.dir);
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
          <span className="mb-1.5 block text-2xs font-medium text-ink-secondary">Cycle</span>
          <select className="input-field w-72" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {cycles.length === 0 && <option value="">No cycles</option>}
            {cycles.map((c) => (
              <option key={c.number} value={c.number}>
                Cycle {c.number}{c.range ? ` (${c.range})` : ''}
              </option>
            ))}
          </select>
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
                <tr key={row.id} className="hover:bg-zinc-50">
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`border border-line px-3 py-2 ${col.align === 'left' ? 'text-left' : 'text-center tabular-nums'}`}
                    >
                      {row[col.key] === '' || row[col.key] == null ? '—' : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
