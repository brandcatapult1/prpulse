import { useCallback, useEffect, useState } from 'react';
import { contactsApi } from '../../lib/api.js';
import { DataTable } from '../ui/DataKit.jsx';
import { EmptyState, Toast } from '../ui/Primitives.jsx';
import { Pill, formatDate, formatStatus } from '../../lib/format.jsx';
import { formatCount } from './SystemLabelPills.jsx';

// Only what Instagram exposes publicly. Reach, saves, shares and reposts are private
// to the account owner, so they are not shown.
const METRICS = [
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['views', 'Views'],
];
const TYPE_LABEL = { reel: 'Reel', story: 'Story', other: 'Post', static_carousel_post: 'Carousel' };
const PLATFORMS = [['instagram', 'Instagram', 'Followers']];

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-white/60 px-3 py-2">
      <div className="text-2xs text-ink-tertiary">{label}</div>
      <div className="text-sm font-semibold text-ink" title={value == null ? '' : String(value)}>
        {formatCount(value)}
      </div>
    </div>
  );
}

export function CreatorStatsPanel({ contactId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return contactsApi.creatorStats(contactId).then(setData).catch((e) => setError(e.message));
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await contactsApi.syncCreatorStats(contactId);
      setData(res);
      const r = res.result ?? {};
      const notes = ['instagram']
        .filter((p) => r[p] && r[p] !== 'skipped')
        .map((p) => `${p}: ${r[p] === 'not_configured' ? 'API not configured' : r[p]}`);
      setToast(notes.length ? notes.join(' · ') : 'No linked Instagram profile to sync');
    } catch (e) {
      setToast(e.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  if (error) return <div className="panel p-4 text-2xs text-red-800">{error}</div>;
  if (!data) return <div className="panel p-6 text-center text-2xs text-ink-secondary">Loading stats…</div>;

  const byPlatform = Object.fromEntries(data.social.map((s) => [s.platform, s]));
  const configured = data.sync_available?.instagram;

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">Audience</h3>
          <button type="button" className="btn-secondary" disabled={syncing || !configured} onClick={sync}
            title={configured ? '' : 'Set META_ACCESS_TOKEN / META_IG_USER_ID on the server to enable sync'}>
            {syncing ? 'Syncing…' : 'Refresh from Instagram'}
          </button>
        </div>
        <div className="mt-3 grid gap-4">
          {PLATFORMS.map(([key, name, followLabel]) => {
            const s = byPlatform[key];
            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2 text-2xs text-ink-secondary">
                  <span className="font-medium text-ink">{name}</span>
                  {s?.handle && <span>@{s.handle}</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label={followLabel} value={s?.followers} />
                  <Stat label="Following" value={s?.following} />
                  <Stat label="Posts" value={s?.posts_count} />
                </div>
                {s?.sync_error && <p className="mt-1 text-2xs text-health-red">{s.sync_error}</p>}
                {s?.synced_at && <p className="mt-1 text-2xs text-ink-tertiary">Updated {formatDate(s.synced_at)}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="text-sm font-medium text-ink">
          Completed-deliverable performance
          <span className="ml-2 text-2xs font-normal text-ink-tertiary">
            {data.totals.completed_deliverables} completed deliverable{data.totals.completed_deliverables === 1 ? '' : 's'}
          </span>
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {METRICS.map(([k, label]) => <Stat key={k} label={label} value={data.totals[k]} />)}
        </div>
      </div>

      {data.campaigns.length === 0 ? (
        <EmptyState title="No completed deliverables yet" description="Metrics appear once deliverables are marked posted." />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'campaign_name', label: 'Campaign', render: (r) => <span className="font-medium">{r.campaign_name}</span> },
              { key: 'brand_name', label: 'Brand' },
              { key: 'completed_deliverables', label: 'Deliverables' },
              ...METRICS.map(([k, label]) => ({ key: k, label, render: (r) => formatCount(r[k]) })),
            ]}
            rows={data.campaigns.map((c) => ({ ...c, id: c.campaign_id }))}
          />
          <div className="panel overflow-x-auto p-0">
            <table className="w-full text-2xs">
              <thead>
                <tr className="border-b border-line text-left text-ink-tertiary">
                  <th className="px-3 py-2">Deliverable</th>
                  {METRICS.map(([k, label]) => <th key={k} className="px-2 py-2">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.deliverables.flatMap((d) => (d.links.length ? d.links : [{ content_url: null }]).map((l, i) => (
                  <tr key={`${d.deliverable_id}-${i}`} className="border-b border-line/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{d.campaign_name} · {TYPE_LABEL[d.deliverable_type] ?? formatStatus(d.deliverable_type)}</div>
                      <div className="text-ink-tertiary">
                        {l.content_url
                          ? <a href={l.content_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{l.content_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
                          : 'No link (screenshot proof)'}
                      </div>
                    </td>
                    {METRICS.map(([k]) => <td key={k} className="px-2 py-2">{formatCount(l[k])}</td>)}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-ink-tertiary">
            Numbers are fetched automatically from each creator's public Instagram data (Business or
            Creator accounts). Stories can't be fetched. “—” means the platform doesn't expose it publicly.
          </p>
        </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
