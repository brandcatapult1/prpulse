import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../ui/DataKit.jsx';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { AddContactDrawer } from '../contacts/AddContactDrawer.jsx';
import { ContactFilters } from '../contacts/ContactFilters.jsx';
import { campaignsApi, lookupApi } from '../../lib/api.js';
import { fetchPopulationContacts } from '../../lib/persistence.js';
import {
  CONTACT_DRAWER_FILTER_DEFAULTS,
  filterContacts,
} from '../../lib/contactFilters.js';
import { instagramProfileFromUrl } from '../../lib/contactSocialLinks.js';
import { mergeContactsCache } from '../../lib/contactsCache.js';

function InstagramHandle({ contact }) {
  const profile = instagramProfileFromUrl(contact?.instagram_url);
  if (!profile?.profileUrl) {
    return <span className="text-2xs text-ink-tertiary">—</span>;
  }

  return (
    <a
      href={profile.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="campaign-glass-chip text-brand hover:text-brand"
      onClick={(e) => e.stopPropagation()}
    >
      {profile.handleLabel ?? 'Instagram'}
    </a>
  );
}

/**
 * Campaign discovery drawer — find active, addable creators and batch-add them
 * via the same populate endpoint as contacts-page batch "Add to campaign".
 */
export function AddCreatorsDrawer({
  open,
  onClose,
  campaignId,
  campaignName,
  engagementContactIds,
  onAdded,
}) {
  const [selected, setSelected] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(CONTACT_DRAWER_FILTER_DEFAULTS);
  const [tagOptions, setTagOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  const inCampaignIds = useMemo(
    () => new Set(engagementContactIds.map(String)),
    [engagementContactIds],
  );

  function loadPool() {
    if (!campaignId) return;
    setLoading(true);
    fetchPopulationContacts(campaignId)
      .then((rows) => {
        setContacts(rows ?? []);
        mergeContactsCache(rows);
      })
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open || !campaignId) return;
    setSelected([]);
    setQuery('');
    setFilters(CONTACT_DRAWER_FILTER_DEFAULTS);
    loadPool();
  }, [open, campaignId]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      lookupApi.tags().catch(() => []),
      lookupApi.cities().catch(() => []),
      lookupApi.categories().catch(() => []),
    ]).then(([tags, cities, categories]) => {
      setTagOptions(Array.isArray(tags) ? tags : []);
      setCityOptions(Array.isArray(cities) ? cities : []);
      setCategoryOptions(Array.isArray(categories) ? categories : []);
    });
  }, [open]);

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function clearFilters() {
    setQuery('');
    setFilters(CONTACT_DRAWER_FILTER_DEFAULTS);
  }

  const filteredRows = useMemo(
    () => filterContacts(contacts, {
      query,
      filters,
      tagOptions,
      includeStatusFilter: false,
    }),
    [contacts, query, filters, tagOptions],
  );

  const selectableIds = useMemo(
    () => filteredRows.filter((r) => !inCampaignIds.has(String(r.id))).map((r) => r.id),
    [filteredRows, inCampaignIds],
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));
  const someSelected = selectableIds.some((id) => selected.includes(id));

  function toggleSelect(id) {
    if (inCampaignIds.has(String(id))) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...selectableIds])]);
    }
  }

  async function handleAddToCampaign() {
    const pickedIds = selected.filter((id) => !inCampaignIds.has(String(id)));
    if (pickedIds.length === 0) {
      setToast(selected.length > 0 ? 'Selected creators are already on this campaign' : 'Select at least one creator');
      return;
    }

    setAdding(true);
    try {
      const result = await campaignsApi.populate(campaignId, { contact_ids: pickedIds });
      const created = result?.created?.length ?? 0;
      const skipped = result?.skipped?.length ?? 0;
      if (created === 0 && pickedIds.length > 0) {
        throw new Error('No new engagements created');
      }
      let message = `${created} added to ${campaignName ?? 'campaign'}`;
      if (skipped > 0) message += ` · ${skipped} already on campaign`;
      setToast(message);
      setSelected([]);
      onAdded?.();
      onClose();
    } catch (err) {
      setToast(err.message ?? 'Could not add creators');
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        title="Add creators"
        onClose={onClose}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="campaign-glass-chip text-ink-tertiary">
              {selected.length} selected · active only · blacklisted hidden
            </span>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setQuickOpen(true)}>
                Add Contact
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={adding || selected.length === 0}
                onClick={handleAddToCampaign}
              >
                {adding ? 'Adding…' : 'Add to campaign'}
              </button>
            </div>
          </div>
        }
      >
        <ContactFilters
          layout="drawer"
          hideStatus
          query={query}
          onQueryChange={setQuery}
          filters={filters}
          onChange={updateFilters}
          cityOptions={cityOptions}
          tagOptions={tagOptions}
          categoryOptions={categoryOptions}
          onClear={clearFilters}
        />

        <div className="mt-4">
          {loading ? (
            <p className="campaign-glass-tile p-4 text-center text-2xs text-ink-tertiary">Loading creators…</p>
          ) : filteredRows.length === 0 ? (
            <p className="campaign-glass-tile p-4 text-center text-2xs text-ink-tertiary">
              {contacts.length === 0
                ? 'No eligible creators — add a new contact first.'
                : 'No creators match these filters.'}
            </p>
          ) : (
            <DataTable
              selectable
              selected={selected}
              onSelect={toggleSelect}
              onSelectAll={toggleSelectAll}
              allSelected={allSelected}
              someSelected={someSelected}
              isRowDisabled={(row) => inCampaignIds.has(String(row.id))}
              columns={[
                {
                  key: 'full_name',
                  label: 'Name',
                  render: (r, { disabled }) => (
                    <div>
                      <span className={disabled ? 'text-ink-tertiary' : 'font-medium text-ink'}>
                        {r.full_name}
                      </span>
                      {disabled && (
                        <span className="mt-0.5 block text-2xs text-ink-tertiary">Already on campaign</span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'instagram',
                  label: 'Instagram',
                  render: (r) => <InstagramHandle contact={r} />,
                },
                { key: 'city', label: 'City', render: (r) => r.city ?? '—' },
                {
                  key: 'primary_category_name',
                  label: 'Category',
                  render: (r) => r.primary_category_name ?? '—',
                },
                {
                  key: 'classification',
                  label: 'Class',
                  render: (r) => r.classification?.replace('_', ' ') ?? '—',
                },
              ]}
              rows={filteredRows}
            />
          )}
        </div>
      </Drawer>

      <AddContactDrawer
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSaved={() => {
          loadPool();
          setToast('Contact added — select them above to add to campaign');
        }}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
