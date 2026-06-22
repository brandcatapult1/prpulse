import { HealthBadge } from '../ui/HealthBadge.jsx';

function MetricTile({ label, value, suffix }) {
  return (
    <div className="campaign-glass-tile flex flex-col px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">{label}</p>
      <div className="mt-0.5 flex h-5 items-center gap-2">
        <span className="tabular-nums text-base font-medium leading-none text-ink">{value}</span>
        {suffix}
      </div>
    </div>
  );
}

export function CampaignMetricTiles({ campaign }) {
  const health = campaign.campaign_health ?? 'not_set';
  const pct = Math.round(Number(campaign.achievement_pct) || 0);
  const hasHealth = health !== 'not_set';

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MetricTile label="Target" value={campaign.target_collaborations ?? '—'} />
      <MetricTile label="Completed" value={campaign.completed_collaborations ?? 0} />
      <MetricTile label="Remaining" value={campaign.remaining_collaborations ?? '—'} />
      <MetricTile
        label="Health"
        value={hasHealth ? `${pct}%` : '—'}
        suffix={hasHealth ? <HealthBadge health={health} variant="pill" /> : null}
      />
    </div>
  );
}
