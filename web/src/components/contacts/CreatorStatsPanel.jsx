import { useCallback, useEffect, useState } from 'react';
import AccordionChevron from '../ui/AccordionChevron.jsx';
import RefreshIconButton from '../ui/RefreshIconButton.jsx';
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
          <RefreshIconButton busy={syncing} disabled={!configured} onClick={sync}
            title={configured ? 'Refresh metrics' : 'Set META_ACCESS_TOKEN / META_IG_USER_ID on the server to enable sync'} />
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

// Same grid as the accordion header, so every value sits under its own heading.
const ROW_GRID = 'grid grid-cols-2 gap-x-4 gap-y-2 px-2 lg:grid-cols-[36px_minmax(150px,1.8fr)_repeat(3,minmax(0,1fr))_minmax(112px,1.2fr)_repeat(7,minmax(0,1fr))]';

function DeliverableStatsTable({ deliverables, classification, followers, action }) {
  if (!deliverables.length) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-2xs text-ink-tertiary">No completed deliverables yet — metrics appear once they are marked posted.</p>
        {action}
      </div>
    );
  }
  const rows = deliverables.flatMap((d) => (d.links.length ? d.links : [{ content_url: null }]).map((l, i) => ({ d, l, key: `${d.deliverable_id}-${i}` })));
  return (
    <div>
      {rows.map(({ d, l, key }, idx) => (
        <div key={key} className={`${ROW_GRID} items-center border-b border-line/50 py-3 transition-colors last:border-0 hover:bg-white`}>
          <div className="col-span-2 min-w-0 lg:col-span-5 lg:col-start-2">
            <div className="flex items-center gap-2">
              <Chip>{TYPE_LABEL[d.deliverable_type] ?? formatStatus(d.deliverable_type)}</Chip>
              {l.content_url
                ? <a href={l.content_url} target="_blank" rel="noreferrer" title={l.content_url} className="truncate text-2xs text-brand hover:underline">{l.content_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 34)}{l.content_url.replace(/^https?:\/\/(www\.)?/, '').length > 34 ? '…' : ''}</a>
                : <span className="text-2xs italic text-ink-tertiary">No link · screenshot proof</span>}
            </div>
          </div>
          {METRICS.map(([k, label]) => {
            const est = k === 'reach' ? estimateReach(l, classification, followers) : null;
            return (
              <div key={k} className="text-2xs font-semibold tabular-nums text-ink">
                <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-ink-tertiary lg:hidden">{label}</span>
                {est != null ? `~${formatCount(est)}` : formatCount(l[k])}
              </div>
            );
          })}
          <div className="col-span-2 flex justify-end lg:col-span-3">
            {idx === 0 && action}
          </div>
        </div>
      ))}
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

function Chip({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-ink',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    muted: 'text-ink-tertiary',
  };
  return <span className={`text-2xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** A header column: small label above, value below. */
function Col({ label, children, className = '', tint = false }) {
  return (
    <div className={`shrink-0 ${className}`}>
      {label && <div className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary/80">{label}</div>}
      <div className={`${label ? 'mt-0.5' : ''} text-2xs font-semibold tabular-nums text-ink`}>{children}</div>
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
        className="cursor-pointer px-2 py-3.5 transition-colors hover:bg-zinc-50/70"
        title="Open engagement"
      >
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-left lg:grid lg:grid-cols-[36px_minmax(150px,1.8fr)_repeat(3,minmax(0,1fr))_minmax(112px,1.2fr)_repeat(7,minmax(0,1fr))] lg:gap-x-4">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            aria-expanded={open}
            aria-label={open ? 'Hide deliverables' : 'Show deliverables'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:bg-zinc-100 hover:text-ink"
          >
            <AccordionChevron open={open} />
          </button>
          <Col className="w-44 lg:w-auto">
            <span className="block truncate text-sm font-medium text-ink">{row.campaign_name}</span>
            <span className="block truncate text-2xs font-normal text-ink-tertiary">{row.brand_name}</span>
          </Col>
          <Col label="Date">{formatDate(row.last_contact_date)}</Col>
          <Col label="Manager">{row.owner_name ?? '—'}</Col>
          <Col label="Reason">{formatCollaborationReason(row.primary_collaboration_reason) ?? '—'}</Col>
          <Col label="Deliverables" className="pr-2"><Chip>{row.deliverables_completed}</Chip></Col>
          {METRICS.map(([k, label]) => (
            <Col key={k} label={label} tint>{k === 'reach' ? reachText : formatCount(stats?.[k])}</Col>
          ))}
          <Col label="Fee">{formatFee(row.agreed_fee)}</Col>
          <Col label="Rating">{row.avg_rating != null ? <Chip tone="warn">★ {row.avg_rating.toFixed(1)}</Chip> : '—'}</Col>
          <Col label="WWA">{row.would_work_again == null ? '—' : <Chip tone={row.would_work_again ? 'good' : 'muted'}>{row.would_work_again ? 'Yes' : 'No'}</Chip>}</Col>
        </div>
      </div>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden" aria-hidden={!open}>
          <div className="border-t border-line bg-zinc-50/50">
            <DeliverableStatsTable
              deliverables={deliverables}
              classification={classification}
              followers={followers}
              action={<RefreshIconButton busy={refreshing} onClick={onRefresh} />}
            />
          </div>
        </div>
      </div>
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
