import { useCallback, useEffect, useState } from 'react';
import { contactsApi } from '../../lib/api.js';
import { DataTable } from '../ui/DataKit.jsx';
import { EmptyState, Toast } from '../ui/Primitives.jsx';
import { Pill, formatDate, formatStatus } from '../../lib/format.jsx';
import { formatCount } from './SystemLabelPills.jsx';
import { estimateReach } from '../../lib/reachEstimate.js';
import { InstagramAccessCard } from './InstagramAccessCard.jsx';

// Only what Instagram exposes publicly. Reach, saves and shares are private
// to the account owner, so they are not shown.
const METRICS = [
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['views', 'Views'],
  ['reach', 'Reach'],
  // Saves and Shares are hidden for now: ['saves', 'Saves'], ['shares', 'Shares'],
];
const TYPE_LABEL = { reel: 'Reel', story: 'Story', other: 'Post', static_carousel_post: 'Carousel' };
// Temporarily hidden cards — flip to true to bring them back.
const SHOW_ACCESS_CARD = false;
const SHOW_PERFORMANCE_CARD = false;

const PLATFORMS = [['instagram', 'Instagram', 'Followers']];

function Stat({ label, value, display }) {
  return (
    <div className="rounded-lg border border-line bg-white/60 px-3 py-2">
      <div className="text-2xs text-ink-tertiary">{label}</div>
      <div className="text-sm font-semibold text-ink" title={value == null ? '' : String(value)}>
        {display ?? formatCount(value)}
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
  const followers = byPlatform.instagram?.followers;
  // Per campaign: Instagram's reach where we have it, otherwise the worked-out figure for each link.
  const campaignReach = (campaignId) => {
    let total = 0;
    let estimated = false;
    const seen = new Set();
    for (const d of data.deliverables.filter((x) => x.campaign_id === campaignId)) {
      for (const l of d.links) {
        if (l.content_url) {
          if (seen.has(l.content_url)) continue; // same link on two deliverables counts once
          seen.add(l.content_url);
        }
        const real = Number(l.reach);
        if (Number.isFinite(real) && real > 0) { total += real; continue; }
        const est = estimateReach(l, data.classification, followers);
        if (est != null) { total += est; estimated = true; }
      }
    }
    return { total, estimated };
  };
  // Engagement rate on reach = (likes + comments) / reach x 100, using Instagram's reach where we have it,
  // otherwise the worked-out reach. A link shared by two deliverables counts once.
  const reachRate = (links) => {
    let interactions = 0;
    let reach = 0;
    let estimated = false;
    const seen = new Set();
    for (const l of links) {
      if (l.content_url) {
        if (seen.has(l.content_url)) continue;
        seen.add(l.content_url);
      }
      let r = Number(l.reach);
      if (!(Number.isFinite(r) && r > 0)) {
        r = estimateReach(l, data.classification, followers);
        if (r != null) estimated = true;
      }
      if (!(r > 0)) continue;
      reach += r;
      interactions += (Number(l.likes) || 0) + (Number(l.comments) || 0);
    }
    if (reach <= 0) return null;
    return `${estimated ? '~' : ''}${(Math.round((interactions / reach) * 10000) / 100)}%`;
  };
  const allLinks = data.deliverables.flatMap((d) => d.links);
  const configured = data.sync_available?.instagram;

  return (
    <div className="space-y-4">
      {SHOW_ACCESS_CARD && <InstagramAccessCard data={data} contactId={contactId} onChange={setData} onToast={setToast} />}

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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label={followLabel} value={s?.followers}
                    display={s?.followers == null ? '—' : Number(s.followers).toLocaleString('en-IN')} />
                  <Stat label="Engagement rate (latest 5 posts)" value={s?.engagement_rate}
                    display={s?.engagement_rate == null ? '—' : `${Number(s.engagement_rate)}%`} />
                  <Stat label="Engagement rate (on reach)" display={reachRate(allLinks) ?? '—'} />
                  <Stat label="Avg views (latest 5 reels)" value={s?.avg_views} />
                </div>
                {s?.sync_error && <p className="mt-1 text-2xs text-health-red">{s.sync_error}</p>}
                {s?.synced_at && <p className="mt-1 text-2xs text-ink-tertiary">Updated {formatDate(s.synced_at)}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {SHOW_PERFORMANCE_CARD && (
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
      )}

      {data.campaigns.length === 0 ? (
        <EmptyState title="No completed deliverables yet" description="Metrics appear once deliverables are marked posted." />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'campaign_name', label: 'Campaign', render: (r) => <span className="font-medium">{r.campaign_name}</span> },
              { key: 'brand_name', label: 'Brand' },
              { key: 'completed_deliverables', label: 'Deliverables' },
              ...METRICS.map(([k, label]) => ({
                key: k,
                label,
                render: (r) => {
                  if (k !== 'reach') return formatCount(r[k]);
                  const { total, estimated } = campaignReach(r.campaign_id);
                  return total > 0 ? `${estimated ? '~' : ''}${formatCount(total)}` : formatCount(r[k]);
                },
              })),
              {
                key: 'eng_reach',
                label: 'Eng. rate (on reach)',
                render: (r) => reachRate(data.deliverables.filter((x) => x.campaign_id === r.campaign_id).flatMap((x) => x.links)) ?? '—',
              },
            ]}
            rows={data.campaigns.map((c) => ({ ...c, id: c.campaign_id }))}
          />
          <div className="panel overflow-x-auto p-0">
            <table className="w-full text-2xs">
              <thead>
                <tr className="border-b border-line text-left text-ink-tertiary">
                  <th className="px-3 py-2">Deliverable</th>
                  {METRICS.map(([k, label]) => <th key={k} className="px-2 py-2">{label}</th>)}
                  <th className="px-2 py-2">Eng. rate (on reach)</th>
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
                    {METRICS.map(([k]) => {
                      const est = k === 'reach' ? estimateReach(l, data.classification, followers) : null;
                      return (
                        <td key={k} className="px-2 py-2">
                          {est != null ? `~${formatCount(est)}`
                            : formatCount(l[k])}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">{reachRate([l]) ?? '—'}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
