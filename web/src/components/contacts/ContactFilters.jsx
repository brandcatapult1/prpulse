import { useEffect, useState } from 'react';
import { CLASSIFICATION_OPTIONS, classificationSelectLabel } from '../../lib/classifications.js';
import { countryLabel } from '../../lib/locations.js';
import {
  activeFacetFilterCount,
  contactFiltersActive,
} from '../../lib/contactFilters.js';
import { OverlayPortal } from '../ui/OverlayPortal.jsx';

const STATUS_OPTIONS = [
  { value: '', label: 'Active & inactive' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
  { value: 'archived', label: 'Archived only' },
  { value: 'all', label: 'All (incl. archived)' },
];

function ToggleChip({ active, onClick, children, stacked = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-md border text-2xs transition-colors ${
        stacked
          ? 'flex min-h-[44px] w-full items-center justify-center px-3 py-2'
          : 'shrink-0 px-2 py-1'
      } ${
        active
          ? 'border-brand/30 bg-brand-soft text-brand'
          : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function TagFilterMenu({ tagOptions, selectedIds, onChange, stacked = false }) {
  const [open, setOpen] = useState(false);
  const count = selectedIds.length;

  function toggle(id) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  const buttonClass = `whitespace-nowrap rounded-md border text-2xs transition-colors ${
    stacked
      ? 'flex min-h-[44px] w-full items-center justify-between px-3 py-2'
      : 'px-2 py-1'
  } ${
    count > 0
      ? 'border-brand/30 bg-brand-soft text-brand'
      : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
  }`;

  const menu = (
    <div
      className={
        stacked
          ? 'mt-2 max-h-48 w-full overflow-y-auto rounded-lg border border-line bg-white p-2'
          : 'absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg'
      }
    >
      {tagOptions.length === 0 ? (
        <p className="px-1 py-2 text-2xs text-ink-secondary">
          No tags configured — ask an Admin to add tags.
        </p>
      ) : (
        <div className="space-y-0.5">
          {tagOptions.map((tag) => (
            <label
              key={tag.id}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-2xs text-ink-secondary hover:bg-canvas"
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
  );

  return (
    <div className={stacked ? 'w-full' : 'relative shrink-0'}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={buttonClass}>
        <span>Tags{count > 0 ? ` · ${count}` : ''}</span>
        {stacked && <span className="text-ink-tertiary">{open ? '▾' : '▸'}</span>}
      </button>

      {open && (
        stacked ? (
          menu
        ) : (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            {menu}
          </>
        )
      )}
    </div>
  );
}

function CategoryFilterMenu({ categoryOptions, selectedIds, onChange, stacked = false }) {
  const [open, setOpen] = useState(false);
  const count = selectedIds.length;

  function toggle(id) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  const buttonClass = `whitespace-nowrap rounded-md border text-2xs transition-colors ${
    stacked
      ? 'flex min-h-[44px] w-full items-center justify-between px-3 py-2'
      : 'px-2 py-1'
  } ${
    count > 0
      ? 'border-brand/30 bg-brand-soft text-brand'
      : 'border-line bg-white text-ink-secondary hover:border-zinc-300 hover:text-ink'
  }`;

  const menu = (
    <div
      className={
        stacked
          ? 'mt-2 max-h-48 w-full overflow-y-auto rounded-lg border border-line bg-white p-2'
          : 'absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg'
      }
    >
      {categoryOptions.length === 0 ? (
        <p className="px-1 py-2 text-2xs text-ink-secondary">
          No categories configured — ask an Admin to add categories.
        </p>
      ) : (
        <div className="space-y-0.5">
          {categoryOptions.map((cat) => (
            <label
              key={cat.id}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-2xs text-ink-secondary hover:bg-canvas"
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
  );

  return (
    <div className={stacked ? 'w-full' : 'relative shrink-0'}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={buttonClass}>
        <span>Category{count > 0 ? ` · ${count}` : ''}</span>
        {stacked && <span className="text-ink-tertiary">{open ? '▾' : '▸'}</span>}
      </button>

      {open && (
        stacked ? (
          menu
        ) : (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            {menu}
          </>
        )
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
  stacked = false,
}) {
  const facets = (
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
        className={`${selectClass}${stacked ? '' : ' min-w-[120px]'}`}
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
        stacked={stacked}
      />

      <CategoryFilterMenu
        categoryOptions={categoryOptions}
        selectedIds={filters.primaryCategoryIds}
        onChange={(primaryCategoryIds) => onChange({ primaryCategoryIds })}
        stacked={stacked}
      />

      <ToggleChip
        active={filters.openToBarter}
        onClick={() => onChange({ openToBarter: !filters.openToBarter })}
        stacked={stacked}
      >
        Barter
      </ToggleChip>

      <ToggleChip
        active={filters.openToPaid}
        onClick={() => onChange({ openToPaid: !filters.openToPaid })}
        stacked={stacked}
      >
        Paid
      </ToggleChip>
    </>
  );

  if (stacked) {
    return <div className="flex w-full flex-col gap-3">{facets}</div>;
  }

  return facets;
}

function ContactFiltersMobileSheet({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 md:hidden">
        <button
          type="button"
          className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
          onClick={onClose}
          aria-label="Close filters"
        />
        <div
          className="absolute inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-white/80 bg-white/[0.95] shadow-[0_16px_48px_rgba(26,29,38,0.11),0_6px_16px_rgba(26,29,38,0.07),0_0_0_1px_rgba(255,255,255,0.8)_inset] backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Contact filters"
        >
          <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Filters</h2>
            <button
              type="button"
              className="btn-ghost h-11 w-11 p-0"
              onClick={onClose}
              aria-label="Close filters"
            >
              <span className="text-lg leading-none text-ink-tertiary" aria-hidden>
                ×
              </span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        </div>
      </div>
    </OverlayPortal>
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
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const includeStatus = !hideStatus && layout !== 'drawer';
  const hasActive = contactFiltersActive(filters, { query, includeStatus });
  const facetCount = activeFacetFilterCount(filters, { includeStatus });

  const selectClass =
    'input-field h-8 w-auto min-w-[108px] shrink-0 py-0 text-2xs';
  const mobileSelectClass =
    'input-field h-10 w-full min-w-0 shrink-0 py-0 text-2xs';

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
            className={`campaign-glass-chip flex w-full items-center justify-between px-3 py-2 ${
              facetActive ? 'campaign-glass-chip-active' : ''
            }`}
          >
            <span className="font-medium">Filters{facetActive ? ' · active' : ''}</span>
            <span className="text-ink-tertiary">{filtersExpanded ? '▾' : '▸'}</span>
          </button>

          {filtersExpanded && (
            <div className="campaign-glass-tile mt-2 flex flex-wrap gap-1.5 p-2">
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
    <>
      <div className="hidden flex-wrap items-center gap-x-1.5 gap-y-2 md:flex">
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

      <div className="space-y-2 md:hidden">
        <input
          className="input-field h-8 w-full py-0 text-2xs"
          placeholder="Search name, mobile, city, tags…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />

        <button
          type="button"
          onClick={() => setMobileSheetOpen(true)}
          className={`campaign-glass-chip flex min-h-[44px] w-full items-center justify-between px-3 py-2 ${
            facetCount > 0 ? 'campaign-glass-chip-active' : ''
          }`}
        >
          <span className="font-medium">Filters</span>
          {facetCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-medium text-white">
              {facetCount}
            </span>
          )}
        </button>
      </div>

      <ContactFiltersMobileSheet open={mobileSheetOpen} onClose={() => setMobileSheetOpen(false)}>
        <ContactFilterFacets
          filters={filters}
          onChange={onChange}
          cityOptions={cityOptions}
          tagOptions={tagOptions}
          categoryOptions={categoryOptions}
          hideStatus={hideStatus}
          selectClass={mobileSelectClass}
          stacked
        />

        {hasActive && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setMobileSheetOpen(false);
            }}
            className="btn-ghost mt-4 w-full min-h-[44px] justify-center"
          >
            Clear all
          </button>
        )}
      </ContactFiltersMobileSheet>
    </>
  );
}
