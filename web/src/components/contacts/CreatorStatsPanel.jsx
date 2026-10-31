import { useCallback, useEffect, useState } from 'react';
import { contactsApi } from '../../lib/api.js';
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

function useCreatorStats(contactId) {
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

  return { data, setData, error, syncing, sync, toast, setToast };
}

/** Audience card (followers, engagement rate, avg views) — shown on the profile Overview tab. */
export function AudienceCard({ contactId }) {
  const { data, error, syncing, sync, toast, setToast } = useCreatorStats(contactId);

  if (error) return <div className="panel p-4 text-2xs text-red-800">{error}</div>;
  if (!data) return <div className="panel p-6 text-center text-2xs text-ink-secondary">Loading stats…</div>;

  const byPlatform = Object.fromEntries(data.social.map((s) => [s.platform, s]));
  const configured = data.sync_available?.instagram;

  return (
    <>
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
                  <Stat label={followLabel} value={s?.followers}
                    display={s?.followers == null ? '—' : Number(s.followers).toLocaleString('en-IN')} />
                  <Stat label="Engagement rate (latest 5 posts)" value={s?.engagement_rate}
                    display={s?.engagement_rate == null ? '—' : `${Number(s.engagement_rate)}%`} />
                  <Stat label="Avg views (latest 5 reels)" value={s?.avg_views} />
                </div>
                {s?.sync_error && <p className="mt-1 text-2xs text-health-red">{s.sync_error}</p>}
                {s?.synced_at && <p className="mt-1 text-2xs text-ink-tertiary">Updated {formatDate(s.synced_at)}</p>}
              </div>
            );
          })}
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

/** One campaign row: click to open its deliverables. */
function CampaignAccordion({ campaign, deliverables, totalsReach, classification, followers }) {
  const [open, setOpen] = useState(false);
  const { total, estimated } = totalsReach;
  const reachText = total > 0 ? `${estimated ? '~' : ''}${formatCount(total)}` : formatCount(campaign.reach);
  return (
    <div className="panel overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-left hover:bg-zinc-50"
      >
        <span className={`text-ink-tertiary transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>▸</span>
        <span className="min-w-[10rem] flex-1">
          <span className="block text-sm font-medium text-ink">{campaign.campaign_name}</span>
          <span className="block text-2xs text-ink-tertiary">{campaign.brand_name}</span>
        </span>
        <span className="text-2xs text-ink-secondary">
          <b className="tabular-nums text-ink">{campaign.completed_deliverables}</b> deliverable{campaign.completed_deliverables === 1 ? '' : 's'}
        </span>
        {METRICS.map(([k, label]) => (
          <span key={k} className="text-2xs text-ink-secondary">
            {label} <b className="tabular-nums text-ink">{k === 'reach' ? reachText : formatCount(campaign[k])}</b>
          </span>
        ))}
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b border-line text-left text-ink-tertiary">
                <th className="px-3 py-2">Deliverable</th>
                {METRICS.map(([k, label]) => <th key={k} className="px-2 py-2">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {deliverables.flatMap((d) => (d.links.length ? d.links : [{ content_url: null }]).map((l, i) => (
                <tr key={`${d.deliverable_id}-${i}`} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{TYPE_LABEL[d.deliverable_type] ?? formatStatus(d.deliverable_type)}</div>
                    <div className="text-ink-tertiary">
                      {l.content_url
                        ? <a href={l.content_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{l.content_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
                        : 'No link (screenshot proof)'}
                    </div>
                  </td>
                  {METRICS.map(([k]) => {
                    const est = k === 'reach' ? estimateReach(l, classification, followers) : null;
                    return (
                      <td key={k} className="px-2 py-2">
                        {est != null ? `~${formatCount(est)}` : formatCount(l[k])}
                      </td>
                    );
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CreatorStatsPanel({ contactId }) {
  const { data, setData, error, toast, setToast } = useCreatorStats(contactId);

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

  return (
    <div className="space-y-4">
      {SHOW_ACCESS_CARD && <InstagramAccessCard data={data} contactId={contactId} onChange={setData} onToast={setToast} />}

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
        <div className="space-y-2">
          {data.campaigns.map((c) => (
            <CampaignAccordion
              key={c.campaign_id}
              campaign={c}
              deliverables={data.deliverables.filter((d) => d.campaign_id === c.campaign_id)}
              totalsReach={campaignReach(c.campaign_id)}
              classification={data.classification}
              followers={followers}
            />
          ))}
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
