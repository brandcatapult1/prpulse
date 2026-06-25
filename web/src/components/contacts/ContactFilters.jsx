import { useState } from 'react';
import { CLASSIFICATION_OPTIONS } from '../../lib/classifications.js';
import { countryLabel } from '../../lib/locations.js';

const STATUS_OPTIONS = [
  { value: '', label: 'Active & inactive' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
  { value: 'archived', label: 'Archived only' },
  { value: 'all', label: 'All (incl. archived)' },
];

function ToggleChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-2xs transition-colors ${
        active
          ? 'border-brand/30 bg-brand-soft text-brand'
          : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function TagFilterMenu({ tagOptions, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const count = selectedIds.length;

  function toggle(id) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-2.5 py-1.5 text-2xs transition-colors ${
          count > 0
            ? 'border-brand/30 bg-brand-soft text-brand'
            : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
        }`}
      >
        Tags{count > 0 ? ` · ${count}` : ''}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg">
            {tagOptions.length === 0 ? (
              <p className="px-1 py-2 text-2xs text-ink-secondary">
                No tags configured — ask an Admin to add tags.
              </p>
            ) : (
              <div className="space-y-0.5">
                {tagOptions.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-2xs text-ink-secondary hover:bg-canvas"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-line text-brand focus:ring-brand/30"
                      checked={selectedIds.includes(tag.id)}
                      onChange={() => toggle(tag.id)}
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            )}
            {count > 0 && (
              <button
                type="button"
                className="mt-1 w-full rounded-md px-2 py-1 text-left text-2xs text-ink-tertiary hover:text-ink"
                onClick={() => onChange([])}
              >
                Clear tags
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Combinable, AND-ed contact filters plus instant text search. */
export function ContactFilters({
  query,
  onQueryChange,
  filters,
  onChange,
  cityOptions,
  tagOptions,
  onClear,
}) {
  const hasActiveFilters =
    Boolean(filters.status)
    || Boolean(filters.classification)
    || Boolean(filters.city)
    || filters.openToPaid
    || filters.openToBarter
    || filters.tagIds.length > 0;

  const selectClass =
    'input-field h-8 w-auto min-w-[130px] py-0 text-2xs';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="input-field h-8 max-w-xs py-0"
        placeholder="Search name, mobile, city, tags…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />

      <select
        className={selectClass}
        value={filters.status}
        onChange={(e) => onChange({ status: e.target.value })}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filters.classification}
        onChange={(e) => onChange({ classification: e.target.value })}
      >
        <option value="">All classes</option>
        {CLASSIFICATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filters.city}
        onChange={(e) => onChange({ city: e.target.value })}
      >
        <option value="">All cities</option>
        {cityOptions.map((city) => (
          <option key={city.id ?? city.name} value={city.name}>
            {city.name}{city.country ? ` · ${countryLabel(city.country)}` : ''}
          </option>
        ))}
      </select>

      <TagFilterMenu
        tagOptions={tagOptions}
        selectedIds={filters.tagIds}
        onChange={(tagIds) => onChange({ tagIds })}
      />

      <ToggleChip
        active={filters.openToBarter}
        onClick={() => onChange({ openToBarter: !filters.openToBarter })}
      >
        Open to Barter
      </ToggleChip>

      <ToggleChip
        active={filters.openToPaid}
        onClick={() => onChange({ openToPaid: !filters.openToPaid })}
      >
        Open to Paid
      </ToggleChip>

      {(hasActiveFilters || query) && (
        <button type="button" onClick={onClear} className="text-2xs text-ink-tertiary hover:text-ink">
          Clear all
        </button>
      )}
    </div>
  );
}
