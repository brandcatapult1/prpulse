import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable } from '../components/ui/DataKit.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { AddContactDrawer } from '../components/contacts/AddContactDrawer.jsx';
import { ContactBatchActionBar } from '../components/contacts/ContactBatchActionBar.jsx';
import { ContactFilters } from '../components/contacts/ContactFilters.jsx';
import { Pill, statusTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { contactsApi, lookupApi } from '../lib/api.js';
import { setContactsCache } from '../lib/contactsCache.js';
import { canBulkImport } from '../lib/csvImport.js';
import { CONTACT_PAGE_FILTER_DEFAULTS, filterContacts } from '../lib/contactFilters.js';
import { useAuth } from '../context/AuthContext.jsx';

export function ContactsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = canBulkImport(user?.role);
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(CONTACT_PAGE_FILTER_DEFAULTS);
  const [tagOptions, setTagOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);

  const includeArchived = filters.status === 'archived' || filters.status === 'all';

  useEffect(() => {
    loadContacts(includeArchived);
  }, [includeArchived]);

  useEffect(() => {
    Promise.all([
      lookupApi.tags().catch(() => []),
      lookupApi.cities().catch(() => []),
      lookupApi.categories().catch(() => []),
    ]).then(([tags, cities, categories]) => {
      setTagOptions(Array.isArray(tags) ? tags : []);
      setCityOptions(Array.isArray(cities) ? cities : []);
      setCategoryOptions(Array.isArray(categories) ? categories : []);
    });
  }, []);

  function loadContacts(withArchived = includeArchived) {
    contactsApi
      .list({ includeArchived: withArchived })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        setContactsCache(list);
        setLoadError(null);
      })
      .catch((err) => {
        setRows([]);
        setLoadError(err.message ?? 'Could not load contacts');
      });
  }

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function clearAll() {
    setQuery('');
    setFilters(CONTACT_PAGE_FILTER_DEFAULTS);
  }

  const filteredRows = useMemo(
    () => filterContacts(rows, { query, filters, tagOptions, includeStatusFilter: true }),
    [rows, query, filters, tagOptions],
  );

  const selectableIds = useMemo(
    () => filteredRows.map((r) => r.id),
    [filteredRows],
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
  const someSelected = selectableIds.some((id) => selectedIds.includes(id));

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...selectableIds])]);
    }
  }

  const columns = [
    { key: 'full_name', label: 'Name', render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: 'city', label: 'City' },
    { key: 'primary_category_name', label: 'Category', render: (r) => r.primary_category_name ?? '—' },
    { key: 'classification', label: 'Class', render: (r) => r.classification?.replace('_', ' ') ?? '—' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <div className="flex gap-1">
          <Pill tone={statusTone(r.status)}>{r.status}</Pill>
          {r.is_blacklisted && <Pill tone="danger">Blacklisted</Pill>}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24">
      <PageHeader
        title={MODULES.contactDatabase.pageTitle}
        subtitle={MODULES.contactDatabase.subtitle}
        actions={
          <>
            {canImport && (
              <Link to="/import" className="btn-secondary">Bulk Import</Link>
            )}
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
              Add Contact
            </button>
          </>
        }
      />

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{loadError}</div>
      )}

      <ContactFilters
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onChange={updateFilters}
        cityOptions={cityOptions}
        tagOptions={tagOptions}
        categoryOptions={categoryOptions}
        onClear={clearAll}
      />

      {filteredRows.length === 0 ? (
        <div className="panel px-4 py-10 text-center text-2xs text-ink-secondary">
          No contacts match these filters.
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredRows}
          selectable
          selected={selectedIds}
          onSelect={toggleSelect}
          onSelectAll={toggleSelectAll}
          allSelected={allSelected}
          someSelected={someSelected}
          onRowClick={(row) => navigate(`/contacts/${row.id}`)}
        />
      )}

      <ContactBatchActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onComplete={loadContacts}
      />

      <AddContactDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => loadContacts()}
      />
    </div>
  );
}
