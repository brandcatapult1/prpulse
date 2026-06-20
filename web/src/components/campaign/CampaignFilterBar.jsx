import { useEffect, useMemo, useRef, useState } from 'react';
import { formatStatus } from '../../lib/format.jsx';

const EMPTY_FILTERS = { status: null, owner: null, followUpDue: false };

function FilterIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-ink-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg className="h-3 w-3 text-ink-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ownerShortName(fullName) {
  if (!fullName) return '';
  return fullName.split(/\s+/)[0];
}

function ActiveFilterChip({ label, valueLabel, onClear }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-1 text-2xs font-medium text-brand"
    >
      <span>{label}: {valueLabel}</span>
      <span className="text-brand/60" aria-hidden>×</span>
    </button>
  );
}

function FilterDropdownChip({ label, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded-md border border-line/80 bg-white px-2 py-1 text-2xs text-ink-secondary transition-colors hover:border-zinc-300 hover:text-ink"
    >
      {label}
      <ChevronDown />
    </button>
  );
}

function FilterMenu({ options, onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (options.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-line/80 bg-white px-3 py-2 text-2xs text-ink-tertiary shadow-sm"
      >
        No options
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-line/80 bg-white py-1 shadow-sm"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="block w-full px-3 py-1.5 text-left text-2xs text-ink hover:bg-canvas/80"
          onClick={() => {
            onSelect(opt.value);
            onClose();
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function CampaignFilterBar({ engagements, filters, onChange }) {
  const [openMenu, setOpenMenu] = useState(null);

  const statusOptions = useMemo(() => {
    const values = [...new Set(engagements.map((e) => e.conversation_status).filter(Boolean))].sort();
    return values.map((value) => ({ value, label: formatStatus(value) }));
  }, [engagements]);

  const ownerOptions = useMemo(() => {
    const values = [...new Set(engagements.map((e) => e.owner_name).filter(Boolean))].sort();
    return values.map((value) => ({ value, label: value }));
  }, [engagements]);

  const hasActive = Boolean(filters.status || filters.owner || filters.followUpDue);

  function clearAll() {
    onChange(EMPTY_FILTERS);
    setOpenMenu(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex h-7 w-5 items-center justify-center" title="Filters" aria-hidden>
        <FilterIcon />
      </span>

      {filters.owner && (
        <ActiveFilterChip
          label="Owner"
          valueLabel={ownerShortName(filters.owner)}
          onClear={() => onChange({ ...filters, owner: null })}
        />
      )}

      {filters.status && (
        <ActiveFilterChip
          label="Status"
          valueLabel={formatStatus(filters.status)}
          onClear={() => onChange({ ...filters, status: null })}
        />
      )}

      {filters.followUpDue && (
        <ActiveFilterChip
          label="Follow-up due"
          valueLabel="Due"
          onClear={() => onChange({ ...filters, followUpDue: false })}
        />
      )}

      {!filters.status && (
        <div className="relative">
          <FilterDropdownChip
            label="Status"
            onOpen={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
          />
          {openMenu === 'status' && (
            <FilterMenu
              options={statusOptions}
              onSelect={(value) => onChange({ ...filters, status: value })}
              onClose={() => setOpenMenu(null)}
            />
          )}
        </div>
      )}

      {!filters.owner && (
        <div className="relative">
          <FilterDropdownChip
            label="Owner"
            onOpen={() => setOpenMenu(openMenu === 'owner' ? null : 'owner')}
          />
          {openMenu === 'owner' && (
            <FilterMenu
              options={ownerOptions}
              onSelect={(value) => onChange({ ...filters, owner: value })}
              onClose={() => setOpenMenu(null)}
            />
          )}
        </div>
      )}

      {!filters.followUpDue && (
        <FilterDropdownChip
          label="Follow-up due"
          onOpen={() => onChange({ ...filters, followUpDue: true })}
        />
      )}

      {hasActive && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-0.5 text-2xs text-ink-tertiary hover:text-ink"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export { EMPTY_FILTERS as CAMPAIGN_EMPTY_FILTERS };
