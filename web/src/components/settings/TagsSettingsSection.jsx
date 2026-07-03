import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, Toast } from '../ui/Primitives.jsx';
import { Pill } from '../../lib/format.jsx';
import { tagsApi } from '../../lib/api.js';

const TAG_TYPES = [
  { value: 'influencer', label: 'Influencer' },
  { value: 'campaign', label: 'Campaign' },
];

function typeLabel(type) {
  return TAG_TYPES.find((t) => t.value === type)?.label ?? type;
}

function formatCreatedAtIst(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function TagsSettingsSection() {
  const [tags, setTags] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('influencer');
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const loadTags = useCallback(async (archived) => {
    setLoading(true);
    try {
      const rows = await tagsApi.list(archived);
      setTags(Array.isArray(rows) ? rows : []);
      setLoadError(null);
    } catch (err) {
      setTags([]);
      setLoadError(err.message ?? 'Could not load tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags(includeArchived);
  }, [includeArchived, loadTags]);

  const grouped = useMemo(() => {
    const influencer = [];
    const campaign = [];
    for (const tag of tags) {
      if (tag.type === 'campaign') campaign.push(tag);
      else influencer.push(tag);
    }
    return { influencer, campaign };
  }, [tags]);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const saved = await tagsApi.create({ name, type: newType });
      setTags((prev) =>
        [...prev, saved].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      );
      setNewName('');
      setToast(`Tag “${saved.name}” added`);
    } catch (err) {
      setCreateError(err.message ?? 'Could not create tag');
    } finally {
      setCreating(false);
    }
  }

  function startRename(tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setRenameError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditName('');
    setRenameError(null);
  }

  async function commitRename(tag) {
    const name = editName.trim();
    if (!name) {
      setRenameError('name is required');
      return;
    }
    if (name === tag.name) {
      cancelRename();
      return;
    }

    setSavingId(tag.id);
    setRenameError(null);
    try {
      const saved = await tagsApi.update(tag.id, { name });
      setTags((prev) =>
        prev
          .map((t) => (t.id === saved.id ? saved : t))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      );
      cancelRename();
      setToast(`Renamed to “${saved.name}”`);
    } catch (err) {
      setRenameError(err.message ?? 'Could not rename tag');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(tag) {
    if (savingId === tag.id) return;
    setSavingId(tag.id);
    try {
      const saved = await tagsApi.update(tag.id, { is_active: !tag.is_active });
      if (!includeArchived && !saved.is_active) {
        setTags((prev) => prev.filter((t) => t.id !== saved.id));
      } else {
        setTags((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      }
      setToast(saved.is_active ? `“${saved.name}” unarchived` : `“${saved.name}” archived`);
    } catch (err) {
      setToast(err.message ?? 'Could not update tag');
    } finally {
      setSavingId(null);
    }
  }

  function renderGroup(title, rows) {
    return (
      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-sm font-medium text-ink">{title}</h3>
          <p className="text-2xs text-ink-tertiary">{rows.length} tag{rows.length === 1 ? '' : 's'}</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-2xs text-ink-tertiary">No tags in this group.</p>
        ) : (
          <ul className="divide-y divide-line/80">
            {rows.map((tag) => {
              const isEditing = editingId === tag.id;
              const busy = savingId === tag.id;
              return (
                <li key={tag.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <input
                        className="input-field h-8 min-w-[10rem] flex-1"
                        value={editName}
                        autoFocus
                        disabled={busy}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename(tag);
                          }
                          if (e.key === 'Escape') cancelRename();
                        }}
                      />
                    ) : (
                      <span className={`min-w-0 flex-1 text-sm font-medium ${tag.is_active ? 'text-ink' : 'text-ink-tertiary'}`}>
                        {tag.name}
                      </span>
                    )}

                    <Pill tone={tag.type === 'campaign' ? 'info' : 'default'}>{typeLabel(tag.type)}</Pill>
                    <Pill tone={tag.is_active ? 'success' : 'warning'}>
                      {tag.is_active ? 'Active' : 'Archived'}
                    </Pill>
                    <span className="text-2xs text-ink-tertiary">{formatCreatedAtIst(tag.created_at)}</span>

                    <div className="ml-auto flex flex-wrap gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={busy}
                            onClick={() => commitRename(tag)}
                          >
                            Save
                          </button>
                          <button type="button" className="btn-ghost" disabled={busy} onClick={cancelRename}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => startRename(tag)}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => toggleActive(tag)}
                          >
                            {tag.is_active ? 'Archive' : 'Unarchive'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isEditing && renameError && (
                    <p className="mt-1.5 text-2xs text-health-red">{renameError}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xs text-ink-secondary">
          Manage influencer and campaign tags. Archive hides a tag from new use; it does not remove tags already on contacts.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-2xs text-ink-secondary">
          <input
            type="checkbox"
            className="rounded border-line text-brand focus:ring-brand/30"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived
        </label>
      </div>

      <Card className="!p-4">
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-2xs text-ink-secondary">
            Name
            <input
              className="input-field mt-1"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (createError) setCreateError(null);
              }}
              placeholder="Tag name"
              disabled={creating}
            />
          </label>
          <label className="w-40 text-2xs text-ink-secondary">
            Type
            <select
              className="input-field mt-1"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              disabled={creating}
            >
              {TAG_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="btn-primary"
            disabled={creating || !newName.trim()}
          >
            {creating ? 'Adding…' : 'Add tag'}
          </button>
        </form>
        {createError && (
          <p className="mt-2 text-2xs text-health-red">{createError}</p>
        )}
      </Card>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-2xs text-ink-tertiary">Loading tags…</p>
      ) : tags.length === 0 ? (
        <EmptyState
          title="No tags yet"
          description={includeArchived ? 'No tags in the master list.' : 'No active tags. Add one above, or include archived.'}
        />
      ) : (
        <div className="space-y-4">
          {renderGroup('Influencer tags', grouped.influencer)}
          {renderGroup('Campaign tags', grouped.campaign)}
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
