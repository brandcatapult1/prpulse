import { useCallback, useEffect, useState } from 'react';
import { contactsApi } from '../../lib/api.js';
import { EmptyState, Toast } from '../ui/Primitives.jsx';
import { formatFee } from '../../lib/format.jsx';
import { formatCollaborationReason } from '../../lib/collaborationReasons.js';
import { Pill, formatDate, formatStatus } from '../../lib/format.jsx';
import { formatCount } from './SystemLabelPills.jsx';
import { estimateReach } from '../../lib/reachEstimate.js';

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

function DeliverableStatsTable({ deliverables, classification, followers }) {
  if (!deliverables.length) {
    return <p className="px-4 py-3 text-2xs text-ink-tertiary">No completed deliverables yet — metrics appear once they are marked posted.</p>;
  }
  return (
    <div className="overflow-x-auto">
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
  );
}

function Field({ label, children }) {
  return (
    <span className="text-2xs text-ink-secondary">
      {label} <b className="tabular-nums text-ink">{children}</b>
    </span>
  );
}

/** A header column: small label above, value below. */
function Col({ label, children, className = '' }) {
  return (
    <div className={`shrink-0 ${className}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="mt-0.5 text-2xs font-semibold tabular-nums text-ink">{children}</div>
    </div>
  );
}

/** One collaboration: click to open its details and deliverable metrics. */
function CollaborationAccordion({ row, stats, deliverables, reach, classification, followers, onOpenEngagement, onRefresh, refreshing }) {
  const [open, setOpen] = useState(false);
  const reachText = reach.total > 0
    ? `${reach.estimated ? '~' : ''}${formatCount(reach.total)}`
    : formatCount(stats?.reach);
  return (
    <div className="panel overflow-hidden p-0">
      <div
        role="link"
        tabIndex={0}
        onClick={() => onOpenEngagement(row.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpenEngagement(row.id); }}
        className="cursor-pointer overflow-x-auto px-2 py-3 hover:bg-zinc-50"
        title="Open engagement"
      >
        <div className="flex min-w-max items-center gap-5 text-left">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            aria-expanded={open}
            aria-label={open ? 'Hide deliverables' : 'Show deliverables'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:bg-zinc-100 hover:text-ink"
          >
            <span className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>▸</span>
          </button>
          <Col label="Campaign" className="w-44">
            <span className="block truncate text-sm font-medium text-ink">{row.campaign_name}</span>
            <span className="block truncate text-2xs font-normal text-ink-tertiary">{row.brand_name}</span>
          </Col>
          <Col label="Date">{formatDate(row.last_contact_date)}</Col>
          <Col label="Deliverables">{row.deliverables_completed}</Col>
          {METRICS.map(([k, label]) => (
            <Col key={k} label={label}>{k === 'reach' ? reachText : formatCount(stats?.[k])}</Col>
          ))}
          <Col label="Manager">{row.owner_name ?? '—'}</Col>
          <Col label="Primary reason">{formatCollaborationReason(row.primary_collaboration_reason) ?? '—'}</Col>
          <Col label="Fee">{formatFee(row.agreed_fee)}</Col>
          <Col label="Rating">{row.avg_rating != null ? `★${row.avg_rating.toFixed(1)}` : '—'}</Col>
          <Col label="Would work again">{row.would_work_again == null ? '—' : row.would_work_again ? 'Yes' : 'No'}</Col>
          <button type="button" className="btn-secondary ml-auto shrink-0" onClick={(e) => { e.stopPropagation(); onOpenEngagement(row.id); }}>
            Open engagement →
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line">
          <div className="flex justify-end px-4 pt-3">
            <button type="button" className="btn-secondary" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? 'Refreshing…' : 'Refresh metrics'}
            </button>
          </div>
          <div>
            <DeliverableStatsTable deliverables={deliverables} classification={classification} followers={followers} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Collaboration History tab: one accordion per completed collaboration, with its deliverable metrics inside. */
export function CollaborationHistoryList({ contactId, history, onOpenEngagement }) {
  const { data, error, syncing, sync, toast, setToast } = useCreatorStats(contactId);

  if (error) return <div className="panel p-4 text-2xs text-red-800">{error}</div>;
  if (!data) return <div className="panel p-6 text-center text-2xs text-ink-secondary">Loading…</div>;
  if (!history.length) {
    return <EmptyState title="No completed collaborations yet" description="Completed collaborations appear here." />;
  }

  const followers = data.social.find((s) => s.platform === 'instagram')?.followers;
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
    <div className="space-y-2">
      {history.map((row) => (
        <CollaborationAccordion
          key={row.id}
          row={row}
          stats={data.campaigns.find((c) => c.campaign_id === row.campaign_id)}
          deliverables={data.deliverables.filter((d) => d.campaign_id === row.campaign_id)}
          reach={campaignReach(row.campaign_id)}
          classification={data.classification}
          followers={followers}
          onOpenEngagement={onOpenEngagement}
          onRefresh={sync}
          refreshing={syncing}
        />
      ))}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
