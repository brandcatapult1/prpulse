import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilterBar, DataTable } from '../components/ui/DataKit.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { AddContactDrawer } from '../components/contacts/AddContactDrawer.jsx';
import { ContactBatchActionBar } from '../components/contacts/ContactBatchActionBar.jsx';
import { Pill, statusTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { contactsApi } from '../lib/api.js';
import { setContactsCache } from '../lib/contactsCache.js';
import { canBulkImport } from '../lib/csvImport.js';
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
  const [activeFilters, setActiveFilters] = useState([]);

  useEffect(() => {
    loadContacts();
  }, []);

  function loadContacts() {
    contactsApi
      .list()
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

  function toggleFilter(name) {
    setActiveFilters((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name],
    );
  }

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
    if (activeFilters.includes('Status')) {
      result = result.filter((r) => r.status === 'active');
    }
    if (activeFilters.includes('Classification')) {
      result = result.filter((r) => r.classification);
    }
    if (activeFilters.includes('Open to Paid')) {
      result = result.filter((r) => r.open_to_paid);
    }
    if (activeFilters.includes('Open to Barter')) {
      result = result.filter((r) => r.open_to_barter);
    }
    return result;
  }, [rows, query, activeFilters]);

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="input-field max-w-xs"
          placeholder="Search name, mobile, city, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterBar
          filters={['Status', 'Classification', 'Open to Paid', 'Open to Barter']}
          active={activeFilters}
          onToggle={toggleFilter}
          onClear={() => setActiveFilters([])}
        />
      </div>

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
