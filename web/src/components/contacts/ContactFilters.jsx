import { useState } from 'react';
import { CLASSIFICATION_OPTIONS, classificationSelectLabel } from '../../lib/classifications.js';
import { countryLabel } from '../../lib/locations.js';
import { contactFiltersActive } from '../../lib/contactFilters.js';

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
      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-2xs transition-colors ${
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
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`whitespace-nowrap rounded-md border px-2 py-1 text-2xs transition-colors ${
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

function CategoryFilterMenu({ categoryOptions, selectedIds, onChange }) {
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
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`whitespace-nowrap rounded-md border px-2 py-1 text-2xs transition-colors ${
          count > 0
            ? 'border-brand/30 bg-brand-soft text-brand'
            : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
        }`}
      >
        Category{count > 0 ? ` · ${count}` : ''}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg">
            {categoryOptions.length === 0 ? (
              <p className="px-1 py-2 text-2xs text-ink-secondary">
                No categories configured — ask an Admin to add categories.
              </p>
            ) : (
              <div className="space-y-0.5">
                {categoryOptions.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-2xs text-ink-secondary hover:bg-canvas"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-line text-brand focus:ring-brand/30"
                      checked={selectedIds.includes(cat.id)}
                      onChange={() => toggle(cat.id)}
                    />
                    {cat.name}
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
                Clear categories
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ContactFilterFacets({
  filters,
  onChange,
  cityOptions,
  tagOptions,
  categoryOptions,
  hideStatus = false,
  selectClass,
}) {
  return (
    <>
      {!hideStatus && (
        <select
          className={selectClass}
          value={filters.status ?? ''}
          onChange={(e) => onChange({ status: e.target.value })}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      <select
        className={selectClass}
        value={filters.classification}
        onChange={(e) => onChange({ classification: e.target.value })}
      >
        <option value="">All classes</option>
        {CLASSIFICATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{classificationSelectLabel(opt)}</option>
        ))}
      </select>

      <select
        className={`${selectClass} min-w-[120px]`}
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

      <CategoryFilterMenu
        categoryOptions={categoryOptions}
        selectedIds={filters.primaryCategoryIds}
        onChange={(primaryCategoryIds) => onChange({ primaryCategoryIds })}
      />

      <ToggleChip
        active={filters.openToBarter}
        onClick={() => onChange({ openToBarter: !filters.openToBarter })}
      >
        Barter
      </ToggleChip>

      <ToggleChip
        active={filters.openToPaid}
        onClick={() => onChange({ openToPaid: !filters.openToPaid })}
      >
        Paid
      </ToggleChip>
    </>
  );
}

/**
 * Combinable, AND-ed contact filters plus instant text search.
 * layout="drawer" — search always visible; facets in a collapsible panel (no status).
 */
export function ContactFilters({
  query,
  onQueryChange,
  filters,
  onChange,
  cityOptions,
  tagOptions,
  categoryOptions,
  onClear,
  layout = 'page',
  hideStatus = false,
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const includeStatus = !hideStatus && layout !== 'drawer';
  const hasActive = contactFiltersActive(filters, { query, includeStatus });

  const selectClass =
    'input-field h-8 w-auto min-w-[108px] shrink-0 py-0 text-2xs';

  if (layout === 'drawer') {
    const facetActive = contactFiltersActive(filters, { includeStatus: false });
    return (
      <div className="space-y-2">
        <input
          className="input-field h-8 w-full py-0 text-2xs"
          placeholder="Search name, mobile, city, tags…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />

        <div>
          <button
            type="button"
            onClick={() => setFiltersExpanded((v) => !v)}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-2xs transition-colors ${
              facetActive
                ? 'border-brand/30 bg-brand-soft/40 text-brand'
                : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
            }`}
          >
            <span className="font-medium">Filters{facetActive ? ' · active' : ''}</span>
            <span className="text-ink-tertiary">{filtersExpanded ? '▾' : '▸'}</span>
          </button>

          {filtersExpanded && (
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-md border border-line bg-canvas/50 p-2">
              <ContactFilterFacets
                filters={filters}
                onChange={onChange}
                cityOptions={cityOptions}
                tagOptions={tagOptions}
                categoryOptions={categoryOptions}
                hideStatus
                selectClass={selectClass}
              />
              {hasActive && (
                <button
                  type="button"
                  onClick={onClear}
                  className="shrink-0 whitespace-nowrap text-2xs text-ink-tertiary hover:text-ink"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      <input
        className="input-field h-8 w-full min-w-[160px] max-w-xs shrink-0 py-0 sm:w-auto"
        placeholder="Search name, mobile, city, tags…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <ContactFilterFacets
          filters={filters}
          onChange={onChange}
          cityOptions={cityOptions}
          tagOptions={tagOptions}
          categoryOptions={categoryOptions}
          hideStatus={hideStatus}
          selectClass={selectClass}
        />

        {hasActive && (
          <button type="button" onClick={onClear} className="shrink-0 whitespace-nowrap text-2xs text-ink-tertiary hover:text-ink">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
