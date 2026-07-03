import { useMemo } from 'react';
import { Pill } from '../../lib/format.jsx';

/** Filter active lookup tags to the allowed type(s). Null/empty = both types. */
export function filterTagsByType(tags, allowedTypes) {
  if (!allowedTypes?.length) return tags ?? [];
  const allowed = new Set(allowedTypes);
  return (tags ?? []).filter((tag) => tag?.id && allowed.has(tag.type));
}

function outOfScopeReason(tag, allowedTypes) {
  if (tag.is_active === false) return 'Archived';
  if (!allowedTypes?.length) return null;
  if (tag.type === 'campaign' && !allowedTypes.includes('campaign')) return 'From campaign';
  if (tag.type === 'influencer' && !allowedTypes.includes('influencer')) return 'Influencer';
  return null;
}

function isOutOfScopeApplied(tag, allowedTypes) {
  if (tag.is_active === false) return true;
  if (!allowedTypes?.length) return false;
  return !allowedTypes.includes(tag.type);
}

/**
 * Assignable options = active lookup tags of allowed type(s).
 * Plus read-only chips for applied tags outside that set (wrong type or archived),
 * while they remain on the record (still in selectedIds).
 */
export function mergeTagOptions(activeTags, appliedTags, selectedIds, allowedTypes) {
  const byId = new Map();
  const assignable = filterTagsByType(activeTags, allowedTypes);

  for (const tag of assignable) {
    if (!tag?.id) continue;
    byId.set(tag.id, {
      ...tag,
      is_active: tag.is_active !== false,
      readOnly: false,
      reason: null,
    });
  }

  const selected = new Set(selectedIds ?? []);
  for (const tag of appliedTags ?? []) {
    if (!tag?.id || typeof tag === 'string') continue;
    if (!selected.has(tag.id)) continue;
    if (!isOutOfScopeApplied(tag, allowedTypes)) continue;
    if (byId.has(tag.id) && !byId.get(tag.id).readOnly) continue;

    byId.set(tag.id, {
      ...tag,
      is_active: tag.is_active !== false,
      readOnly: true,
      reason: outOfScopeReason(tag, allowedTypes),
    });
  }

  return [...byId.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }),
  );
}

/**
 * Multi-select chips from admin-managed tag list — no free-text creation.
 * @param {string[]|null} [allowedTypes] — e.g. ['influencer'] or ['campaign']; omit for both.
 * @param {object[]} [appliedTags] — record's own tags (with type + is_active) for edit merge.
 */
export function TagSelectChips({
  tags,
  selectedIds,
  onChange,
  appliedTags = [],
  allowedTypes = null,
  emptyMessage,
}) {
  const options = useMemo(
    () => mergeTagOptions(tags, appliedTags, selectedIds, allowedTypes),
    [tags, appliedTags, selectedIds, allowedTypes],
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
        const readOnly = Boolean(tag.readOnly);

        if (readOnly) {
          return (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft/60 px-3 py-1.5 text-2xs font-medium text-brand"
              title={tag.reason ? `System-managed · ${tag.reason}` : 'System-managed'}
            >
              <span>{tag.name}</span>
              {tag.reason && (
                <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                  {tag.reason}
                </span>
              )}
            </span>
          );
        }

        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => {
              // Toggle exactly one id — never rebuild from the option list.
              if (selected) {
                onChange(selectedIds.filter((id) => id !== tag.id));
                return;
              }
              onChange([...selectedIds, tag.id]);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-2xs font-medium transition-colors ${
              selected
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
            }`}
          >
            <span>{tag.name}</span>
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
