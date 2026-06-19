import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilterBar, DataTable } from '../components/ui/DataKit.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { QuickAddModal } from '../components/contacts/QuickAddModal.jsx';
import { Pill, statusTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { contactsApi } from '../lib/api.js';
import { getDemoContacts, mergeContacts } from '../lib/demo.js';
import { getContactProfileExtras } from '../lib/contactProfile.js';
import { canBulkImport } from '../lib/csvImport.js';
import { useAuth } from '../context/AuthContext.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';

export function ContactsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canImport = canBulkImport(user?.role);
  const [rows, setRows] = useState(() => getDemoContacts());
  const [demo, setDemo] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);

  useEffect(() => {
    loadContacts();
  }, []);

  function loadContacts() {
    contactsApi
      .list()
      .then((data) => {
        const { rows: resolved, _demo } = mergeContacts(data);
        setRows(resolved);
        setDemo(_demo);
      })
      .catch(() => {
        setRows(getDemoContacts());
        setDemo(true);
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
      result = result.filter((r) => getContactProfileExtras(r.id).open_to_paid);
    }
    if (activeFilters.includes('Open to Barter')) {
      result = result.filter((r) => getContactProfileExtras(r.id).open_to_barter);
    }
    return result;
  }, [rows, query, activeFilters]);

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
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={MODULES.contactDatabase.pageTitle}
        subtitle={MODULES.contactDatabase.subtitle}
        actions={
          <>
            {canImport && (
              <Link to="/import" className="btn-secondary">Bulk Import</Link>
            )}
            <button type="button" className="btn-secondary" onClick={() => setQuickOpen(true)}>Quick Add</button>
            <button type="button" className="btn-primary" onClick={() => setQuickOpen(true)}>+ Contact</button>
          </>
        }
      />

      <DemoBanner show={demo} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="input-field max-w-xs"
          placeholder="Search name, mobile, city, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterBar
          filters={['Name', 'Mobile', 'City', 'Category', 'Tags', 'Open to Paid', 'Open to Barter', 'Classification', 'Status']}
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
        <DataTable columns={columns} rows={filteredRows} onRowClick={(row) => navigate(`/contacts/${row.id}`)} />
      )}

      <QuickAddModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSaved={() => loadContacts()}
      />
    </div>
  );
}
