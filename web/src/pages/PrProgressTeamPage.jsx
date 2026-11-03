import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { MODULES } from '../lib/modules.js';
import { prProgressApi } from '../lib/api.js';

const COLUMNS = [
  { key: 'manager_name', label: 'Account manager', align: 'left' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'creators', label: 'Creators' },
  { key: 'not_contacted', label: 'Not contacted' },
  { key: 'in_conversation', label: 'In conversation' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'awaiting', label: 'Awaiting final deliverables' },
  { key: 'completed', label: 'Completed' },
  { key: 'balance_prev', label: 'Balance from previous cycles' },
];

function sortRows(rows, key, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const cmp = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x ?? '').localeCompare(String(y ?? ''), undefined, { sensitivity: 'base' });
    return cmp * sign || a.manager_name.localeCompare(b.manager_name);
  });
}

/** Account manager-wise progress for a cycle (admins and senior managers). */
export function PrProgressTeamPage() {
  const { user } = useAuth();
  const allowed = user?.role === 'admin' || user?.role === 'senior_manager';
  const [cycles, setCycles] = useState([]);
  const [cycle, setCycle] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const sort = { key: 'manager_name', dir: 'asc' }; // always listed A–Z by name
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    prProgressApi.cycles('')
      .then((p) => {
        setCycles(p.cycles ?? []);
        setCycle(p.current != null ? String(p.current) : '');
      })
      .catch((err) => setError(err.message ?? 'Could not load cycles'));
  }, [allowed]);

  useEffect(() => {
    if (!cycle) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    prProgressApi.team(cycle)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load team progress'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cycle]);

  const rows = useMemo(() => (data ? sortRows(data.rows, sort.key, sort.dir) : []), [data]);

  if (!allowed) return <Navigate to="/" replace />;

  async function exportPdf() {
    if (!cycle || exporting) return;
    setExporting(true);
    try {
      const { blob, contentDisposition } = await prProgressApi.teamPdf(cycle, sort.key, sort.dir);
      const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] ?? 'pr-progress-team.pdf';
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
        title={MODULES.prProgressTeam.pageTitle}
        subtitle={MODULES.prProgressTeam.subtitle}
        actions={
          <button type="button" className="btn-primary" disabled={!cycle || loading || exporting} onClick={exportPdf}>
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        }
      />

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
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{error}</div>
      )}

      <div className="panel overflow-hidden p-0">
        <div className="border-b border-line px-4 py-3 text-center text-base font-semibold text-ink">
          PR Progress - Team - As of {data?.as_of ?? '…'}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-100">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`border border-line px-3 py-2 text-2xs font-semibold text-ink ${
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
                <tr><td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-2xs text-ink-secondary">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-2xs text-ink-secondary">No team members found.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50">
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`border border-line px-3 py-2 ${col.align === 'left' ? 'text-left font-medium text-ink' : 'text-center tabular-nums'}`}
                    >
                      {row[col.key]}
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
