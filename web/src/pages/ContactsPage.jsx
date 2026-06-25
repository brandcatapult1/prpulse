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
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FILTERS = {
  status: '',
  classification: '',
  city: '',
  openToPaid: false,
  openToBarter: false,
  tagIds: [],
};

export function ContactsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = canBulkImport(user?.role);
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tagOptions, setTagOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);

  const includeArchived = filters.status === 'archived' || filters.status === 'all';

  useEffect(() => {
    loadContacts(includeArchived);
  }, [includeArchived]);

  useEffect(() => {
    Promise.all([
      lookupApi.tags().catch(() => []),
      lookupApi.cities().catch(() => []),
    ]).then(([tags, cities]) => {
      setTagOptions(Array.isArray(tags) ? tags : []);
      setCityOptions(Array.isArray(cities) ? cities : []);
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
    setFilters(EMPTY_FILTERS);
  }

  const selectedTagNames = useMemo(
    () => filters.tagIds
      .map((id) => tagOptions.find((t) => t.id === id)?.name)
      .filter(Boolean),
    [filters.tagIds, tagOptions],
  );

  const filteredRows = useMemo(() => {
    let result = rows;
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.full_name?.toLowerCase().includes(q)
          || r.mobile_number?.includes(q)
          || r.city?.toLowerCase().includes(q)
          || r.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (filters.status === 'active' || filters.status === 'inactive' || filters.status === 'archived') {
      result = result.filter((r) => r.status === filters.status);
    } else if (filters.status === '') {
      result = result.filter((r) => r.status !== 'archived');
    }

    if (filters.classification) {
      result = result.filter((r) => r.classification === filters.classification);
    }
    if (filters.city) {
      result = result.filter((r) => r.city === filters.city);
    }
    if (filters.openToPaid) {
      result = result.filter((r) => r.open_to_paid);
    }
    if (filters.openToBarter) {
      result = result.filter((r) => r.open_to_barter);
    }
    if (selectedTagNames.length > 0) {
      result = result.filter((r) =>
        selectedTagNames.every((name) => r.tags?.includes(name)),
      );
    }
    return result;
  }, [rows, query, filters, selectedTagNames]);

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
