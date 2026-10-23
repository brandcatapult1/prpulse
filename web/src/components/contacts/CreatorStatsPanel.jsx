import { useCallback, useEffect, useState } from 'react';
import { contactsApi } from '../../lib/api.js';
import { DataTable } from '../ui/DataKit.jsx';
import { EmptyState, Toast } from '../ui/Primitives.jsx';
import { Pill, formatDate, formatStatus } from '../../lib/format.jsx';
import { formatCount } from './SystemLabelPills.jsx';

const METRICS = [
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['views', 'Views'],
  ['reach', 'Reach'],
  ['shares', 'Shares'],
  ['reposts', 'Reposts'],
  ['saves', 'Saves'],
];
const PLATFORMS = [
  ['instagram', 'Instagram', 'Followers'],
  ['youtube', 'YouTube', 'Subscribers'],
];

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

function NumberField({ label, value, onChange }) {
  return (
    <label className="text-2xs text-ink-secondary">
      {label}
      <input
        className="input-field mt-1 h-8"
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      />
    </label>
  );
}

export function CreatorStatsPanel({ contactId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [editStats, setEditStats] = useState(null); // { platform, values }
  const [editMetric, setEditMetric] = useState(null); // { deliverableId, content_url, values }

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
      const notes = ['instagram', 'youtube']
        .filter((p) => r[p] && r[p] !== 'skipped')
        .map((p) => `${p}: ${r[p] === 'not_configured' ? 'API not configured' : r[p]}`);
      setToast(notes.length ? notes.join(' · ') : 'No linked Instagram/YouTube profile to sync');
    } catch (e) {
      setToast(e.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function saveStats() {
    try {
      setData(await contactsApi.saveSocialStats(contactId, editStats.platform, editStats.values));
      setEditStats(null);
    } catch (e) { setToast(e.message); }
  }

  async function saveMetric() {
    try {
      setData(await contactsApi.saveDeliverableMetrics(contactId, editMetric.deliverableId, {
        content_url: editMetric.content_url,
        ...editMetric.values,
      }));
      setEditMetric(null);
    } catch (e) { setToast(e.message); }
  }

  if (error) return <div className="panel p-4 text-2xs text-red-800">{error}</div>;
  if (!data) return <div className="panel p-6 text-center text-2xs text-ink-secondary">Loading stats…</div>;

  const byPlatform = Object.fromEntries(data.social.map((s) => [s.platform, s]));
  const configured = data.sync_available?.instagram || data.sync_available?.youtube;

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">Audience</h3>
          <button type="button" className="btn-secondary" disabled={syncing || !configured} onClick={sync}
            title={configured ? '' : 'Set META_* / YOUTUBE_API_KEY on the server to enable sync'}>
            {syncing ? 'Syncing…' : 'Sync from Instagram / YouTube'}
          </button>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {PLATFORMS.map(([key, name, followLabel]) => {
            const s = byPlatform[key];
            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2 text-2xs text-ink-secondary">
                  <span className="font-medium text-ink">{name}</span>
                  {s?.handle && <span>@{s.handle}</span>}
                  {s && <Pill tone={s.source === 'api' ? 'success' : 'default'}>{s.source}</Pill>}
                  <button type="button" className="ml-auto text-brand hover:underline"
                    onClick={() => setEditStats({ platform: key, values: {
                      followers: s?.followers, following: s?.following,
                      posts_count: s?.posts_count, total_views: s?.total_views } })}>
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label={followLabel} value={s?.followers} />
                  <Stat label="Following" value={s?.following} />
                  <Stat label={key === 'youtube' ? 'Videos' : 'Posts'} value={s?.posts_count} />
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
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.deliverables.flatMap((d) => (d.links.length ? d.links : [{ content_url: null }]).map((l, i) => (
                  <tr key={`${d.deliverable_id}-${i}`} className="border-b border-line/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{d.campaign_name} · {formatStatus(d.deliverable_type)}</div>
                      <div className="text-ink-tertiary">
                        {l.content_url
                          ? <a href={l.content_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{l.content_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
                          : 'No link (screenshot proof)'}
                        {l.source && <> · <Pill tone={l.source === 'api' ? 'success' : 'default'}>{l.source}</Pill></>}
                      </div>
                    </td>
                    {METRICS.map(([k]) => <td key={k} className="px-2 py-2">{formatCount(l[k])}</td>)}
                    <td className="px-2 py-2">
                      {l.content_url && (
                        <button type="button" className="text-brand hover:underline"
                          onClick={() => setEditMetric({ deliverableId: d.deliverable_id, content_url: l.content_url,
                            values: Object.fromEntries(METRICS.map(([k]) => [k, l[k]])) })}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-ink-tertiary">
            Instagram API returns likes and comments for public Business/Creator accounts. Reach, shares, reposts and
            saves are only available from the creator's own insights, so enter them from their screenshots (Edit).
            Stories can't be fetched automatically.
          </p>
        </>
      )}

      {editStats && (
        <Modal title={`Edit ${editStats.platform} audience`} onCancel={() => setEditStats(null)} onSave={saveStats}>
          {['followers', 'following', 'posts_count', 'total_views'].map((k) => (
            <NumberField key={k} label={k.replace('_', ' ')} value={editStats.values[k]}
              onChange={(v) => setEditStats((s) => ({ ...s, values: { ...s.values, [k]: v } }))} />
          ))}
        </Modal>
      )}
      {editMetric && (
        <Modal title="Edit post metrics" onCancel={() => setEditMetric(null)} onSave={saveMetric}>
          {METRICS.map(([k, label]) => (
            <NumberField key={k} label={label} value={editMetric.values[k]}
              onChange={(v) => setEditMetric((s) => ({ ...s, values: { ...s.values, [k]: v } }))} />
          ))}
        </Modal>
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function Modal({ title, children, onCancel, onSave }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="mb-3 text-sm font-medium capitalize text-ink">{title}</h4>
        <div className="grid grid-cols-2 gap-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
