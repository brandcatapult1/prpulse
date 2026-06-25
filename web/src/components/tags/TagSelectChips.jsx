import { Pill } from '../../lib/format.jsx';

/** Multi-select chips from admin-managed tag list — no free-text creation. */
export function TagSelectChips({ tags, selectedIds, onChange, emptyMessage }) {
  if (!tags?.length) {
    return (
      <p className="text-2xs text-ink-secondary">
        {emptyMessage ?? 'No tags configured — ask an Admin to add tags.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const selected = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => {
              onChange(
                selected
                  ? selectedIds.filter((id) => id !== tag.id)
                  : [...selectedIds, tag.id],
              );
            }}
            className={`rounded-lg border px-3 py-1.5 text-2xs font-medium transition-colors ${
              selected
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
            }`}
          >
            {tag.name}
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
