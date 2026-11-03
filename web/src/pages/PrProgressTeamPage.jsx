import { Fragment, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { MODULES } from '../lib/modules.js';
import { prProgressApi } from '../lib/api.js';
import { CellValue } from './PrProgressPage.jsx';

const COLUMNS = [
  { key: 'manager_name', label: 'Account manager', align: 'left' },
  { key: 'campaigns', label: 'Campaigns' },
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

/** Opened row: the manager's campaigns as rows of the same table, so every number sits under its own column. */
function ManagerCampaigns({ managerId, cycle, colSpan }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    prProgressApi.report(cycle, '', managerId, '')
      .then((d) => { if (!cancelled) setRows(d.rows ?? []); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load campaigns'); });
    return () => { cancelled = true; };
  }, [managerId, cycle]);

  const note = (text, tone = 'text-ink-secondary') => (
    <tr><td colSpan={colSpan} className={`border border-line bg-zinc-50/70 px-12 py-3 text-2xs ${tone}`}>{text}</td></tr>
  );
  if (error) return note(error, 'text-red-700');
  if (!rows) return note('Loading campaigns…');
  if (rows.length === 0) return note('No campaigns for this cycle.');

  const cell = 'border border-line bg-zinc-100/70 px-3 py-2.5 align-middle text-center text-xs tabular-nums';
  return rows.map((r) => (
    <tr key={r.id} className="transition-colors hover:bg-brand-soft/30">
      <td className={`${cell} !text-left border-l-4 !border-l-brand/50`}>
        <div className="pl-6">
          <div className="text-2xs font-medium text-ink-secondary">{r.campaign_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-ink-tertiary">
            <CellValue colKey="status" row={r} />
            <span>{r.remaining} left of {r.total}</span>
          </div>
        </div>
      </td>
      <td className={cell}><CellValue colKey="total" row={r} /></td>
      {['not_contacted', 'in_conversation', 'scheduled', 'awaiting', 'completed', 'balance_prev'].map((k) => (
        <td key={k} className={cell}><CellValue colKey={k} row={r} /></td>
      ))}
    </tr>
  ));
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
  const [openIds, setOpenIds] = useState(() => new Set());

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
                <Fragment key={row.id}>
                  <tr className={openIds.has(row.id) ? 'bg-brand-soft/60 font-semibold' : 'hover:bg-zinc-50'}>
                    {COLUMNS.map((col, i) => (
                      <td
                        key={col.key}
                        className={`border border-line px-3 py-2 ${col.align === 'left' ? 'text-left font-medium text-ink' : 'text-center tabular-nums'}`}
                      >
                        {i === 0 ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleOpen(row.id)}
                              aria-expanded={openIds.has(row.id)}
                              aria-label={openIds.has(row.id) ? 'Hide campaigns' : 'Show campaigns'}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:bg-zinc-100 hover:text-ink"
                            >
                              <span className={`transition-transform ${openIds.has(row.id) ? 'rotate-90' : ''}`} aria-hidden>▸</span>
                            </button>
                            <span>{row[col.key]}</span>
                          </div>
                        ) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                  {openIds.has(row.id) && <ManagerCampaigns managerId={row.id} cycle={cycle} colSpan={COLUMNS.length} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
