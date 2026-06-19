const IST = 'Asia/Kolkata';

export function todayIst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
}

export function addDaysIst(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d);
}

export function formatIstDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export const ROLES = {
  CAMPAIGN_MANAGER: 'campaign_manager',
  SENIOR_MANAGER: 'senior_manager',
  ADMIN: 'admin',
};

export const HEALTH_LABELS = {
  green: { label: 'Green', className: 'bg-emerald-100 text-emerald-800' },
  amber: { label: 'Amber', className: 'bg-amber-100 text-amber-800' },
  red: { label: 'Red', className: 'bg-red-100 text-red-800' },
  not_set: { label: 'Not Set', className: 'bg-slate-100 text-slate-600' },
};

export const STATUS_LABELS = {
  not_contacted: 'Not Contacted',
  in_conversation: 'In Conversation',
  scheduled: 'Scheduled',
  no_response: 'No Response',
  dropped_profile_rejected: 'Dropped – Profile Rejected',
  dropped_not_interested: 'Dropped – Not Interested',
  dropped_terms_disagreement: 'Dropped – Terms Disagreement',
  awaiting_final_deliverables: 'Awaiting Deliverables',
  collaboration_complete: 'Collaboration Complete',
};
