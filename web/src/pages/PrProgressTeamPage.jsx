import { Fragment, useEffect, useMemo, useState } from 'react';
import AccordionChevron from '../components/ui/AccordionChevron.jsx';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { MODULES } from '../lib/modules.js';
import { prProgressApi } from '../lib/api.js';
import { CreatorsTable } from './PrProgressPage.jsx';

const COLUMNS = [
  { key: 'manager_name', label: 'Account manager', align: 'left' },
  { key: 'in_conversation', label: 'In conversation' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'awaiting', label: 'Awaiting final deliverables' },
  { key: 'completed', label: 'Completed' },
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

/** Opened row: the manager's creators awaiting final deliverables, across their campaigns. */
function ManagerCreators({ managerId, cycle, colSpan }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    prProgressApi.report(cycle, '', managerId, '')
      .then((d) => Promise.all((d.rows ?? []).map((camp) =>
        prProgressApi.creators(camp.id, managerId, '', camp.cycle_start, camp.prev_start)
          .then((list) => (Array.isArray(list) ? list : [])
            .filter((c) => c.stage === 'awaiting_final_deliverables')
            .map((c) => ({ ...c, campaign_name: camp.campaign_name }))))))
      .then((lists) => { if (!cancelled) setRows(lists.flat()); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load creators'); });
    return () => { cancelled = true; };
  }, [managerId, cycle]);

  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-line bg-zinc-50/70 px-4 py-4 sm:px-8">
        {error ? (
          <p className="text-2xs text-red-700">{error}</p>
        ) : !rows ? (
          <p className="text-2xs text-ink-secondary">Loading creators…</p>
        ) : rows.length === 0 ? (
          <p className="text-2xs text-ink-secondary">No creators awaiting deliverables for this account manager.</p>
        ) : (
          <CreatorsTable rows={rows} second="campaign" />
        )}
      </td>
    </tr>
  );
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

  async function exportFile(kind) {
    if (!cycle || exporting) return;
    setExporting(kind);
    try {
      const { blob, contentDisposition } = await (kind === 'xlsx' ? prProgressApi.teamXlsx : prProgressApi.teamPdf)(cycle, sort.key, sort.dir);
      const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] ?? `pr-progress-team.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message ?? 'Could not export');
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
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!cycle || loading || Boolean(exporting)} onClick={() => exportFile('xlsx')}>
              {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
            </button>
            <button type="button" className="btn-primary" disabled={!cycle || loading || Boolean(exporting)} onClick={() => exportFile('pdf')}>
              {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
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
                  <tr className="hover:bg-zinc-50">
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
                              aria-label={openIds.has(row.id) ? 'Hide creators' : 'Show creators'}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:bg-zinc-100 hover:text-ink"
                            >
                              <AccordionChevron open={openIds.has(row.id)} />
                            </button>
                            <span>{row[col.key]}</span>
                          </div>
                        ) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                  {openIds.has(row.id) && <ManagerCreators managerId={row.id} cycle={cycle} colSpan={COLUMNS.length} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
