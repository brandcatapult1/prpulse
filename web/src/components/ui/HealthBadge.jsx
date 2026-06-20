import { healthDotClass, healthLabel } from '../../lib/format.jsx';

/** Campaign health — colored dot + human label (never raw colour names). */
export function HealthBadge({ health, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-2xs font-medium text-ink-secondary ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotClass(health)}`}
        aria-hidden
      />
      {healthLabel(health)}
    </span>
  );
}
