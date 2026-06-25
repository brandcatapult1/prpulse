export function DataTable({
  columns,
  rows,
  onRowClick,
  selectable = false,
  selected = [],
  onSelect,
  onSelectAll,
  allSelected = false,
  someSelected = false,
  isRowDisabled,
}) {
  if (!rows.length) {
    return (
      <div className="panel px-4 py-10 text-center text-2xs text-ink-secondary">
        No rows to show
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas/60">
            {selectable && (
              <th className="w-10 px-4 py-2.5">
                {onSelectAll && (
                  <input
                    type="checkbox"
                    className="rounded border-line text-brand focus:ring-brand/30"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={() => onSelectAll?.()}
                  />
                )}
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-ink-tertiary">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const disabled = isRowDisabled?.(row) ?? false;
            return (
            <tr
              key={row.id}
              className={`group border-b border-line/80 last:border-0 transition-colors ${
                disabled
                  ? 'cursor-not-allowed bg-canvas/40 opacity-60'
                  : 'cursor-pointer hover:bg-brand-soft/40'
              }`}
              onClick={() => {
                if (!disabled) onRowClick?.(row);
              }}
            >
              {selectable && (
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="rounded border-line text-brand focus:ring-brand/30 disabled:cursor-not-allowed"
                    checked={selected.includes(row.id)}
                    disabled={disabled}
                    onChange={() => {
                      if (!disabled) onSelect?.(row.id);
                    }}
                  />
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2.5 text-sm text-ink">
                  {col.render ? col.render(row, { disabled }) : row[col.key]}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({ filters, active = [], onToggle, onClear }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f) => {
        const isActive = active.includes(f);
        return (
          <button
            key={f}
            type="button"
            onClick={() => onToggle?.(f)}
            className={`rounded-md border px-2.5 py-1 text-2xs transition-colors ${
              isActive
                ? 'border-brand/30 bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
            }`}
          >
            {f}
          </button>
        );
      })}
      {active.length > 0 && (
        <button type="button" onClick={onClear} className="ml-1 text-2xs text-ink-tertiary hover:text-ink">
          Clear
        </button>
      )}
    </div>
  );
}

export function StatusButton({ value, options, onChange, disabled, hint }) {
  return (
    <div>
      <select
        className="input-field h-8 max-w-[220px] disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        disabled={disabled}
        title={hint}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {hint && (
        <p className={`mt-1.5 text-2xs ${disabled ? 'text-health-amber' : 'text-ink-tertiary'}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function QuickAction({ label, onClick, active = false }) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center rounded-md border px-3 text-2xs font-medium transition-colors ${
        active
          ? 'border-brand/30 bg-brand-soft text-brand'
          : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function MetricStrip({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-ink-secondary">
      {items.map(({ label, value, tone }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span>{label}</span>
          <span className={`font-medium ${tone === 'accent' ? 'text-brand' : 'text-ink'}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

export function RatingStars({ value = 0 }) {
  return (
    <span className="text-sm text-health-amber">
      {'★'.repeat(Math.round(value))}
      <span className="text-line">{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  );
}

export function ExpandableSection({ title, children, defaultOpen = false }) {
  return (
    <details className="rounded-md border border-line bg-canvas/50 px-3 py-2" open={defaultOpen}>
      <summary className="cursor-pointer text-2xs font-medium text-ink">{title}</summary>
      <div className="mt-2 text-2xs text-ink-secondary">{children}</div>
    </details>
  );
}
