import { healthDotClass, healthLabel, healthTone } from '../../lib/format.jsx';

const pillTones = {
  success: 'bg-teal-50 text-teal-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  muted: 'bg-zinc-100 text-ink-secondary',
};

/** Campaign health — colored dot + human label (never raw colour names). */
export function HealthBadge({ health, variant = 'plain', className = '' }) {
  const dot = (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotClass(health)}`}
      aria-hidden
    />
  );

  if (variant === 'pill') {
    const tone = pillTones[healthTone(health)] ?? pillTones.muted;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${tone} ${className}`}
      >
        {dot}
        {healthLabel(health)}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-2xs font-medium text-ink-secondary ${className}`}
    >
      {dot}
      {healthLabel(health)}
    </span>
  );
}
