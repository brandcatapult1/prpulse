const tones = {
  default: 'bg-zinc-100 text-ink-secondary',
  success: 'bg-teal-50 text-teal-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-brand-soft text-brand',
  brand: 'bg-brand text-white',
  muted: 'bg-canvas text-ink-tertiary',
};

export function Pill({ children, tone = 'default' }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium ${tones[tone] ?? tones.default}`}>
      {children}
    </span>
  );
}

export function healthTone(health) {
  if (health === 'green') return 'success';
  if (health === 'amber') return 'warning';
  if (health === 'red') return 'danger';
  return 'muted';
}

export function healthLabel(health) {
  if (health === 'green') return 'On track';
  if (health === 'amber') return 'At risk';
  if (health === 'red') return 'Behind';
  return 'No target set';
}

export function healthDotClass(health) {
  if (health === 'green') return 'bg-health-green';
  if (health === 'amber') return 'bg-health-amber';
  if (health === 'red') return 'bg-health-red';
  return 'bg-ink-tertiary/50';
}

export function statusTone(status) {
  if (status === 'collaboration_complete') return 'success';
  if (status?.startsWith('dropped_') || status === 'dropped') return 'muted';
  if (status === 'scheduled') return 'info';
  return 'default';
}

export function formatStatus(status) {
  return (status ?? '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Posted date label for proof display — day + month in IST. */
export function formatPostedDateIst(iso) {
  if (!iso) return null;
  const date = typeof iso === 'string'
    ? iso.slice(0, 10)
    : new Date(iso).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00`));
}

export function formatFee(fee) {
  if (fee == null) return '—';
  return `₹${Number(fee).toLocaleString('en-IN')}`;
}

export function roleLabel(role) {
  return (role ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize engagements.collaboration_type to paid | barter, or null when unset. */
export function normalizeCollaborationType(value) {
  const type = String(value ?? '').trim().toLowerCase();
  if (type === 'paid' || type === 'barter') return type;
  return null;
}

/** Paid/barter label for reports — classification only, never fee amounts. */
export function collaborationTypeLabel(value) {
  const type = normalizeCollaborationType(value);
  if (type === 'paid') return 'Paid';
  if (type === 'barter') return 'Barter';
  return null;
}
