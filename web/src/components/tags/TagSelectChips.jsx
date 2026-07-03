import { useMemo } from 'react';
import { Pill } from '../../lib/format.jsx';

/**
 * Merge active lookup options with applied-but-archived tags still on the record.
 * Archived applied tags appear only while still selected; once toggled off they leave
 * the option set and cannot be re-added.
 */
export function mergeTagOptions(activeTags, appliedTags, selectedIds) {
  const byId = new Map();
  for (const tag of activeTags ?? []) {
    if (!tag?.id) continue;
    byId.set(tag.id, {
      ...tag,
      is_active: tag.is_active !== false,
    });
  }

  const selected = new Set(selectedIds ?? []);
  for (const tag of appliedTags ?? []) {
    if (!tag?.id || typeof tag === 'string') continue;
    if (tag.is_active === false && selected.has(tag.id) && !byId.has(tag.id)) {
      byId.set(tag.id, { ...tag, is_active: false });
    }
  }

  return [...byId.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }),
  );
}

/** Multi-select chips from admin-managed tag list — no free-text creation. */
export function TagSelectChips({
  tags,
  selectedIds,
  onChange,
  appliedTags = [],
  emptyMessage,
}) {
  const options = useMemo(
    () => mergeTagOptions(tags, appliedTags, selectedIds),
    [tags, appliedTags, selectedIds],
  );

  if (!options.length) {
    return (
      <p className="text-2xs text-ink-secondary">
        {emptyMessage ?? 'No tags configured — ask an Admin to add tags.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((tag) => {
        const selected = selectedIds.includes(tag.id);
        const archived = tag.is_active === false;
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => {
              // Toggle exactly one id — never rebuild from the active-only list.
              if (selected) {
                onChange(selectedIds.filter((id) => id !== tag.id));
                return;
              }
              // Archived tags are not selectable for new use.
              if (archived) return;
              onChange([...selectedIds, tag.id]);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-2xs font-medium transition-colors ${
              selected
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
            }`}
          >
            <span>{tag.name}</span>
            {archived && (
              <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                Archived
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TagReadPills({ tags }) {
  const names = (tags ?? []).map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean);
  if (names.length === 0) return <span className="text-2xs text-ink-tertiary">No tags</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <Pill key={name} tone="info">{name}</Pill>
      ))}
    </div>
  );
}
