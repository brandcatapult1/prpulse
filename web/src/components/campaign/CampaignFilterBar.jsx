import { useEffect, useMemo, useRef, useState } from 'react';
import { COLLABORATION_REASONS } from '../../lib/collaborationReasons.js';
import {
  CAMPAIGN_EMPTY_FILTERS,
  CAMPAIGN_RISK_FILTERS,
  collabReasonFilterLabel,
  riskFilterLabel,
} from '../../lib/campaignBoardFilters.js';

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
      className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] rounded-md border border-line/80 bg-white py-1 shadow-sm"
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

function FilterDropdown({ label, active, valueLabel, options, open, onToggle, onClose, onSelect, onClear }) {
  if (active) {
    return (
      <ActiveFilterChip label={label} valueLabel={valueLabel} onClear={onClear} />
    );
  }
  return (
    <div className="relative">
      <FilterDropdownChip label={label} onOpen={onToggle} />
      {open && (
        <FilterMenu options={options} onSelect={onSelect} onClose={onClose} />
      )}
    </div>
  );
}

export function CampaignFilterBar({ engagements, filters, onChange }) {
  const [openMenu, setOpenMenu] = useState(null);

  const ownerOptions = useMemo(() => {
    const values = [...new Set(engagements.map((e) => e.owner_name).filter(Boolean))].sort();
    return values.map((value) => ({ value, label: value }));
  }, [engagements]);

  const reasonOptions = useMemo(() => {
    const present = new Set(
      engagements.map((e) => e.primary_collaboration_reason).filter(Boolean),
    );
    return COLLABORATION_REASONS.filter((r) => present.has(r.value));
  }, [engagements]);

  const hasActive = Boolean(filters.owner || filters.collabReason || filters.risk);

  function toggleMenu(menu) {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  }

  function closeMenu() {
    setOpenMenu(null);
  }

  function clearAll() {
    onChange(CAMPAIGN_EMPTY_FILTERS);
    closeMenu();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex h-7 w-5 items-center justify-center" title="Filters" aria-hidden>
        <FilterIcon />
      </span>

      <FilterDropdown
        label="Owner"
        active={Boolean(filters.owner)}
        valueLabel={ownerShortName(filters.owner)}
        options={ownerOptions}
        open={openMenu === 'owner'}
        onToggle={() => toggleMenu('owner')}
        onClose={closeMenu}
        onSelect={(value) => onChange({ ...filters, owner: value })}
        onClear={() => onChange({ ...filters, owner: null })}
      />

      <FilterDropdown
        label="Collab reason"
        active={Boolean(filters.collabReason)}
        valueLabel={collabReasonFilterLabel(filters.collabReason)}
        options={reasonOptions}
        open={openMenu === 'reason'}
        onToggle={() => toggleMenu('reason')}
        onClose={closeMenu}
        onSelect={(value) => onChange({ ...filters, collabReason: value })}
        onClear={() => onChange({ ...filters, collabReason: null })}
      />

      <FilterDropdown
        label="Risk"
        active={Boolean(filters.risk)}
        valueLabel={riskFilterLabel(filters.risk)}
        options={CAMPAIGN_RISK_FILTERS}
        open={openMenu === 'risk'}
        onToggle={() => toggleMenu('risk')}
        onClose={closeMenu}
        onSelect={(value) => onChange({ ...filters, risk: value })}
        onClear={() => onChange({ ...filters, risk: null })}
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

export { CAMPAIGN_EMPTY_FILTERS };
