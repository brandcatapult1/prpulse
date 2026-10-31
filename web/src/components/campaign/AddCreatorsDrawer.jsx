import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, ListPagination } from '../ui/DataKit.jsx';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { AddContactDrawer } from '../contacts/AddContactDrawer.jsx';
import { SystemLabelPills } from '../contacts/SystemLabelPills.jsx';
import { Pill } from '../../lib/format.jsx';
import { ContactFilters } from '../contacts/ContactFilters.jsx';
import { campaignsApi, lookupApi } from '../../lib/api.js';
import { fetchPopulationContacts } from '../../lib/persistence.js';
import { CONTACT_DRAWER_FILTER_DEFAULTS } from '../../lib/contactFilters.js';
import { instagramProfileFromUrl } from '../../lib/contactSocialLinks.js';
import { mergeContactsCache } from '../../lib/contactsCache.js';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

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
/** The creator's own tags (system labels are shown separately): first three, then +N. */
function CreatorTagPills({ row }) {
  const system = new Set(row.system_labels ?? []);
  const own = (row.tags ?? []).filter((t) => !system.has(t));
  if (own.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {own.slice(0, 3).map((t) => <Pill key={t} tone="default">{t}</Pill>)}
      {own.length > 3 && (
        <span className="text-2xs text-ink-tertiary" title={own.slice(3).join(', ')}>+{own.length - 3}</span>
      )}
    </span>
  );
}

export function AddCreatorsDrawer({
  open,
  onClose,
  campaignId,
  campaignName,
  engagementContactIds,
  onAdded,
}) {
  const [selected, setSelected] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchPage = useCallback((targetPage) => {
    if (!campaignId) return Promise.resolve();
    setLoading(true);
    return fetchPopulationContacts(campaignId, {
      page: targetPage,
      pageSize: PAGE_SIZE,
      query: debouncedQuery,
      filters,
    })
      .then((data) => {
        const list = data?.rows ?? [];
        setRows(list);
        setTotal(data?.total ?? list.length);
        mergeContactsCache(list);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [campaignId, debouncedQuery, filters]);

  useEffect(() => {
    if (!open || !campaignId) return;
    setSelected([]);
    setQuery('');
    setDebouncedQuery('');
    setFilters(CONTACT_DRAWER_FILTER_DEFAULTS);
    setPage(1);
  }, [open, campaignId]);

  useEffect(() => {
    if (!open || !campaignId) return;
    fetchPage(page);
  }, [open, campaignId, page, fetchPage]);

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
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function clearFilters() {
    setPage(1);
    setQuery('');
    setFilters(CONTACT_DRAWER_FILTER_DEFAULTS);
  }

  const selectableIds = useMemo(
    () => rows.filter((r) => !inCampaignIds.has(String(r.id))).map((r) => r.id),
    [rows, inCampaignIds],
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

  const showEmpty = !loading && rows.length === 0;

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
          onQueryChange={(value) => {
            setPage(1);
            setQuery(value);
          }}
          filters={filters}
          onChange={updateFilters}
          cityOptions={cityOptions}
          tagOptions={tagOptions}
          categoryOptions={categoryOptions}
          onClear={clearFilters}
        />

        <div className="mt-4 space-y-3">
          <ListPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />

          {loading && rows.length === 0 ? (
            <p className="campaign-glass-tile p-4 text-center text-2xs text-ink-tertiary">Loading creators…</p>
          ) : showEmpty ? (
            <p className="campaign-glass-tile p-4 text-center text-2xs text-ink-tertiary">
              No eligible creators match these filters — add a new contact or adjust filters.
            </p>
          ) : (
            <div className={loading ? 'pointer-events-none opacity-60' : ''}>
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
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={disabled ? 'text-ink-tertiary' : 'font-medium text-ink'}>
                            {r.full_name}
                          </span>
                          <SystemLabelPills labels={r.system_labels} />
                        </span>
                        <CreatorTagPills row={r} />
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
                  {
                    key: 'primary_category_name',
                    label: 'Category',
                    render: (r) => r.primary_category_name ?? '—',
                  },
                ]}
                rows={rows}
              />
            </div>
          )}

          {!showEmpty && (
            <ListPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              loading={loading}
              onPageChange={setPage}
            />
          )}
        </div>
      </Drawer>

      <AddContactDrawer
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSaved={() => {
          if (page !== 1) setPage(1);
          else fetchPage(1);
          setToast('Contact added — select them above to add to campaign');
        }}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
