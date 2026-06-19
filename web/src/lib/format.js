const tones = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  muted: 'bg-slate-50 text-slate-500',
};

export function Pill({ children, tone = 'default' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.default}`}>
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

export function statusTone(status) {
  if (status === 'collaboration_complete') return 'success';
  if (status?.startsWith('dropped_')) return 'muted';
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

export function formatFee(fee) {
  if (fee == null) return '—';
  return `₹${Number(fee).toLocaleString('en-IN')}`;
}
