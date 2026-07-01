import { formatCurrentCycleLabel } from '../../lib/campaignCycles.js';

export function CampaignCycleIndicator({ campaign }) {
  const label = formatCurrentCycleLabel(campaign);
  if (!label) return null;

  return (
    <p className="px-0.5 text-sm text-ink-secondary">{label}</p>
  );
}
