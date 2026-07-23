function renderCell(col, row, ctx = {}) {
  return col.render ? col.render(row, ctx) : row[col.key];
}

function DataTableDesktop({
  columns,
  rows,
  onRowClick,
  selectable,
  selected,
  onSelect,
  onSelectAll,
  allSelected,
  someSelected,
  isRowDisabled,
}) {
  return (
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
                  {renderCell(col, row, { disabled })}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DataTableMobileCards({
  columns,
  rows,
  onRowClick,
  selectable,
  selected,
  onSelect,
  onSelectAll,
  allSelected,
  someSelected,
  isRowDisabled,
}) {
  const primaryCol = columns.find((col) => col.mobilePrimary) ?? columns[0];
  const secondaryCols = columns.filter((col) => col.key !== primaryCol?.key);

  return (
    <div className="space-y-2">
      {selectable && onSelectAll && (
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 px-1">
          <input
            type="checkbox"
            className="rounded border-line text-brand focus:ring-brand/30"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => onSelectAll?.()}
          />
          <span className="text-2xs text-ink-secondary">Select all</span>
        </label>
      )}

      {rows.map((row) => {
        const disabled = isRowDisabled?.(row) ?? false;
        const interactive = Boolean(onRowClick) && !disabled;

        return (
          <div
            key={row.id}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            className={`campaign-glass-tile w-full px-4 py-3 text-left transition-colors ${
              disabled
                ? 'cursor-not-allowed opacity-60'
                : interactive
                  ? 'cursor-pointer hover:border-brand/20'
                  : ''
            }`}
            onClick={() => {
              if (!disabled) onRowClick?.(row);
            }}
            onKeyDown={(event) => {
              if (!interactive) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRowClick?.(row);
              }
            }}
          >
            <div className="flex items-start gap-3">
              {selectable && (
                <div className="flex min-h-[44px] shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="rounded border-line text-brand focus:ring-brand/30 disabled:cursor-not-allowed"
                    checked={selected.includes(row.id)}
                    disabled={disabled}
                    onChange={() => {
                      if (!disabled) onSelect?.(row.id);
                    }}
                  />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">
                  {primaryCol ? renderCell(primaryCol, row, { disabled }) : null}
                </div>

                {secondaryCols.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs">
                    {secondaryCols.map((col) => (
                      <div key={col.key} className="flex min-w-0 max-w-full items-center gap-1">
                        <span className="shrink-0 text-ink-tertiary">{col.label}</span>
                        <span className="min-w-0 text-ink-secondary">
                          {renderCell(col, row, { disabled })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  responsive = false,
}) {
  if (!rows.length) {
    return (
      <div className="panel px-4 py-10 text-center text-2xs text-ink-secondary">
        No rows to show
      </div>
    );
  }

  const tableProps = {
    columns,
    rows,
    onRowClick,
    selectable,
    selected,
    onSelect,
    onSelectAll,
    allSelected,
    someSelected,
    isRowDisabled,
  };

  if (!responsive) {
    return (
      <div className="panel overflow-hidden">
        <DataTableDesktop {...tableProps} />
      </div>
    );
  }

  return (
    <>
      <div className="panel hidden overflow-hidden md:block">
        <DataTableDesktop {...tableProps} />
      </div>
      <div className="md:hidden">
        <DataTableMobileCards {...tableProps} />
      </div>
    </>
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
  const n = value == null || value === '' ? null : Number(value);
  if (n == null || !Number.isFinite(n) || n <= 0) {
    return <span className="text-2xs text-ink-tertiary">—</span>;
  }
  const rounded = Math.round(n);
  return (
    <span className="text-sm text-health-amber">
      {'★'.repeat(rounded)}
      <span className="text-line">{'★'.repeat(5 - rounded)}</span>
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

export function ListPagination({ page, pageSize, total, onPageChange, loading = false }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-2xs text-ink-secondary">
      <span>
        {total === 0 ? 'No results' : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary !py-1 !px-2.5 disabled:opacity-40"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="whitespace-nowrap tabular-nums">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="btn-secondary !py-1 !px-2.5 disabled:opacity-40"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
