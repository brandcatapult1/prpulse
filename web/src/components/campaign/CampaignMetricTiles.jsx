import { HealthBadge } from '../ui/HealthBadge.jsx';

function MetricTile({ label, value, children }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-line/80 bg-white px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">{label}</p>
      <p className="mt-0.5 tabular-nums text-lg font-medium leading-tight text-ink">{value}</p>
      {children}
    </div>
  );
}

export function CampaignMetricTiles({ campaign }) {
  const health = campaign.campaign_health ?? 'not_set';
  const pct = campaign.achievement_pct;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MetricTile label="Target" value={campaign.target_collaborations ?? '—'} />
      <MetricTile label="Completed" value={campaign.completed_collaborations ?? 0} />
      <MetricTile label="Remaining" value={campaign.remaining_collaborations ?? '—'} />
      <MetricTile label="Health" value={health === 'not_set' ? '—' : `${pct ?? 0}%`}>
        <div className="mt-1">
          <HealthBadge health={health} />
        </div>
      </MetricTile>
    </div>
  );
}
