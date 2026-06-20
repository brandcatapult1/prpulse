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

function FilterChip({ active, label, valueLabel, onOpen, onClear }) {
  if (active) {
    return (
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand-soft/50 px-2 py-1 text-2xs font-medium text-brand"
      >
        <span>{label}: {valueLabel}</span>
        <span className="text-brand/70" aria-hidden>×</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-md border border-line/80 bg-white px-2 py-1 text-2xs text-ink-secondary transition-colors hover:border-zinc-300 hover:text-ink"
    >
      {label}
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
      <span className="mr-0.5 inline-flex h-7 w-7 items-center justify-center" title="Filters" aria-hidden>
        <FilterIcon />
      </span>

      <div className="relative">
        <FilterChip
          active={Boolean(filters.status)}
          label="Status"
          valueLabel={formatStatus(filters.status)}
          onOpen={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
          onClear={() => onChange({ ...filters, status: null })}
        />
        {openMenu === 'status' && !filters.status && (
          <FilterMenu
            options={statusOptions}
            onSelect={(value) => onChange({ ...filters, status: value })}
            onClose={() => setOpenMenu(null)}
          />
        )}
      </div>

      <div className="relative">
        <FilterChip
          active={Boolean(filters.owner)}
          label="Owner"
          valueLabel={filters.owner}
          onOpen={() => setOpenMenu(openMenu === 'owner' ? null : 'owner')}
          onClear={() => onChange({ ...filters, owner: null })}
        />
        {openMenu === 'owner' && !filters.owner && (
          <FilterMenu
            options={ownerOptions}
            onSelect={(value) => onChange({ ...filters, owner: value })}
            onClose={() => setOpenMenu(null)}
          />
        )}
      </div>

      <FilterChip
        active={filters.followUpDue}
        label="Follow-up due"
        valueLabel="Due"
        onOpen={() => onChange({ ...filters, followUpDue: true })}
        onClear={() => onChange({ ...filters, followUpDue: false })}
      />

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
