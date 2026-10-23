import { Pill } from '../../lib/format.jsx';

const ORDER = ['New', 'Recent', 'Frequent'];
const TONE = { New: 'info', Recent: 'success', Frequent: 'brand' };

/** New / Recent / Frequent — derived server-side, so they vanish when no longer true. */
export function SystemLabelPills({ labels }) {
  const shown = ORDER.filter((l) => labels?.includes(l));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((l) => (
        <Pill key={l} tone={TONE[l]}>{l}</Pill>
      ))}
    </>
  );
}

export function formatCount(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e7) return `${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(v);
}
