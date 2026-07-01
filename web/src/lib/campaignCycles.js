import { addDaysToIsoDate } from './dates.js';

const IST = 'Asia/Kolkata';

export function formatCycleDayMonth(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));
}

export function formatCycleRangeLabel(cycle) {
  if (!cycle?.cycle_start || !cycle?.cycle_end) return '';
  const endInclusive = addDaysToIsoDate(cycle.cycle_end, -1);
  return `${formatCycleDayMonth(cycle.cycle_start)} – ${formatCycleDayMonth(endInclusive)}`;
}

/** Recurring campaigns only — projects return null (no "Cycle 1 of 1" noise). */
export function formatCurrentCycleLabel(campaign) {
  if (campaign.campaign_type !== 'monthly' || !campaign.current_cycle) return null;
  const total = Number(campaign.term_months);
  const num = Number(campaign.current_cycle.cycle_number);
  if (!Number.isFinite(total) || !Number.isFinite(num)) return null;
  const range = formatCycleRangeLabel(campaign.current_cycle);
  return `Cycle ${num} of ${total} · ${range}`;
}
