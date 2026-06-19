export function DataTable({ columns, rows, onRowClick, selectable = false, selected = [], onSelect }) {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-surface-border bg-surface-muted text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {selectable && <th className="px-4 py-3 w-10" />}
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-medium">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-surface-border last:border-0 hover:bg-slate-50 cursor-pointer"
              onClick={() => onRowClick?.(row)}
            >
              {selectable && (
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => onSelect?.(row.id)}
                  />
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-slate-700">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({ filters, onClear }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2">
      {filters.map((f) => (
        <button key={f} type="button" className="rounded-full border border-surface-border px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
          {f}
        </button>
      ))}
      <button type="button" onClick={onClear} className="ml-auto text-xs text-slate-400 hover:text-slate-600">
        Clear all
      </button>
    </div>
  );
}

export function StatusButton({ value, options, onChange, disabled, hint }) {
  return (
    <div className="relative">
      <select
        className="input-field pr-8 disabled:opacity-50"
        value={value}
        disabled={disabled}
        title={hint}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {disabled && hint && (
        <p className="mt-1 text-xs text-amber-700">{hint}</p>
      )}
    </div>
  );
}

export function QuickAction({ label, onClick }) {
  return (
    <button type="button" className="btn-ghost text-xs" onClick={onClick}>{label}</button>
  );
}

export function RatingStars({ value = 0 }) {
  return (
    <span className="text-amber-500 text-sm">
      {'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}
    </span>
  );
}

export function ExpandableSection({ title, children, defaultOpen = false }) {
  return (
    <details className="rounded-md border border-surface-border bg-surface-muted px-3 py-2" open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-medium text-slate-700">{title}</summary>
      <div className="mt-2 text-sm text-slate-600">{children}</div>
    </details>
  );
}
