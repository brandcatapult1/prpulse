import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../components/ui/DataKit.jsx';
import { Card, Toast } from '../components/ui/Primitives.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill } from '../lib/format.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  CAMPAIGN_IMPORT_TEMPLATE,
  CONTACT_IMPORT_TEMPLATE,
  canBulkImport,
  importSummary,
  parseCsv,
  rowsReadyToImport,
  validateCampaignRows,
  validateContactRows,
} from '../lib/csvImport.js';
import {
  addCampaignImports,
  addContactImports,
  getDemoBrands,
  getDemoContacts,
} from '../lib/demo.js';
import { importApi } from '../lib/api.js';

const TABS = [
  { id: 'contacts', label: 'Contacts' },
  { id: 'campaigns', label: 'Campaigns' },
];

export function BulkImportPage() {
  const { user } = useAuth();
  const allowed = canBulkImport(user?.role);
  const fileRef = useRef(null);
  const [tab, setTab] = useState('contacts');
  const [validated, setValidated] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [toast, setToast] = useState(null);
  const [demo, setDemo] = useState(true);

  const summary = useMemo(() => importSummary(validated), [validated]);
  const ready = useMemo(() => rowsReadyToImport(validated), [validated]);

  const parseFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    const { rows } = parseCsv(text);

    if (tab === 'contacts') {
      setValidated(
        validateContactRows(rows, getDemoContacts(), { skipDuplicates }),
      );
    } else {
      setValidated(validateCampaignRows(rows, getDemoBrands()));
    }
  };

  const onTabChange = (next) => {
    setTab(next);
    setValidated([]);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const revalidate = (nextSkip = skipDuplicates) => {
    if (!validated.length) return;
    const rawRows = validated.map(
      ({ status, message, existing_contact_id, existing_contact_name, brand_id, campaign_status, ...rest }) => rest,
    );
    if (tab === 'contacts') {
      setValidated(validateContactRows(rawRows, getDemoContacts(), { skipDuplicates: nextSkip }));
    } else {
      setValidated(validateCampaignRows(rawRows, getDemoBrands()));
    }
  };

  const downloadTemplate = () => {
    const content = tab === 'contacts' ? CONTACT_IMPORT_TEMPLATE : CAMPAIGN_IMPORT_TEMPLATE;
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab === 'contacts' ? 'contacts-template.csv' : 'campaigns-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!ready.length) {
      setToast('No valid rows to import');
      return;
    }

    try {
      if (tab === 'contacts') {
        const payload = ready.map((r) => ({
          full_name: r.full_name,
          mobile_number: r.mobile_number,
          city: r.city,
          instagram_url: r.instagram_url,
        }));
        await importApi.contacts(payload);
      } else {
        const payload = ready.map((r) => ({
          campaign_name: r.campaign_name,
          brand_id: r.brand_id,
          brand_name: r.brand_name,
          target_collaborations: r.target_collaborations,
          status: r.campaign_status,
        }));
        await importApi.campaigns(payload);
      }
      setDemo(false);
    } catch {
      if (tab === 'contacts') {
        addContactImports(
          ready.map((r, i) => ({
            id: `imp-c-${Date.now()}-${i}`,
            full_name: r.full_name,
            mobile_number: r.mobile_number,
            city: r.city,
            instagram_url: r.instagram_url,
            classification: 'micro',
            status: 'active',
            tags: ['Imported'],
            source: 'bulk_upload',
          })),
        );
      } else {
        addCampaignImports(
          ready.map((r, i) => ({
            id: `imp-camp-${Date.now()}-${i}`,
            brand_id: r.brand_id,
            campaign_name: r.campaign_name,
            brand_name: r.brand_name,
            status: r.campaign_status,
            target_collaborations: r.target_collaborations,
            completed_collaborations: 0,
            remaining_collaborations: r.target_collaborations,
            achievement_pct: r.target_collaborations ? 0 : null,
            campaign_health: r.target_collaborations ? 'red' : 'not_set',
          })),
        );
      }
      setDemo(true);
    }

    setToast(`Imported ${ready.length} ${tab === 'contacts' ? 'contact' : 'campaign'}${ready.length === 1 ? '' : 's'}`);
    setValidated([]);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const previewColumns =
    tab === 'contacts'
      ? [
          { key: 'full_name', label: 'Name', render: (r) => r.full_name || '—' },
          { key: 'mobile_number', label: 'Mobile', render: (r) => r.mobile_number || '—' },
          { key: 'city', label: 'City', render: (r) => r.city || '—' },
          {
            key: 'status',
            label: 'Status',
            render: (r) => (
              <div className="space-y-0.5">
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
                {r.existing_contact_id && (
                  <Link to={`/contacts/${r.existing_contact_id}`} className="block text-2xs text-brand hover:underline">
                    Review existing
                  </Link>
                )}
              </div>
            ),
          },
          { key: 'message', label: 'Notes', render: (r) => <span className="text-2xs text-ink-secondary">{r.message}</span> },
        ]
      : [
          { key: 'campaign_name', label: 'Campaign', render: (r) => r.campaign_name || '—' },
          { key: 'brand_name', label: 'Brand', render: (r) => r.brand_name || '—' },
          { key: 'target_collaborations', label: 'Target', render: (r) => r.target_collaborations ?? '—' },
          {
            key: 'status',
            label: 'Status',
            render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
          },
          { key: 'message', label: 'Notes', render: (r) => <span className="text-2xs text-ink-secondary">{r.message}</span> },
        ];

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Bulk Import" subtitle="Import contacts or campaigns from CSV" />
        <Card className="!p-6 text-center">
          <p className="text-sm text-ink-secondary">
            Bulk import requires Senior Manager or Admin access.
          </p>
          <Link to="/contacts" className="btn-secondary mt-4 inline-flex">Back to Contacts</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Bulk Import"
        subtitle="Upload a CSV to add contacts or campaigns — duplicates are flagged by mobile number"
        actions={
          <button type="button" className="btn-secondary" onClick={downloadTemplate}>
            Download template
          </button>
        }
      />

      <DemoBanner show={demo} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`rounded-md border px-3 py-1.5 text-2xs font-medium transition-colors ${
              tab === t.id
                ? 'border-brand/30 bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="!p-4">
        <p className="mb-3 text-2xs text-ink-secondary">
          {tab === 'contacts'
            ? 'Required columns: full_name, mobile_number. Optional: city, instagram_url.'
            : 'Required columns: campaign_name, brand_name. Optional: target_collaborations, status (draft/active/planning).'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => parseFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
            Choose CSV file
          </button>
          {fileName && <span className="text-2xs text-ink-secondary">{fileName}</span>}
        </div>
        {tab === 'contacts' && (
          <label className="mt-3 flex items-center gap-2 text-2xs text-ink-secondary">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => {
                const next = e.target.checked;
                setSkipDuplicates(next);
                revalidate(next);
              }}
              className="rounded border-line text-brand"
            />
            Skip rows with duplicate mobile numbers
          </label>
        )}
      </Card>

      {validated.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3 text-2xs">
            <span className="rounded-md border border-line bg-white px-3 py-1.5">
              <span className="font-medium text-ink">{summary.ok}</span> ready
            </span>
            <span className="rounded-md border border-line bg-white px-3 py-1.5">
              <span className="font-medium text-ink">{summary.duplicate}</span> duplicates
            </span>
            <span className="rounded-md border border-line bg-white px-3 py-1.5">
              <span className="font-medium text-ink">{summary.error}</span> errors
            </span>
          </div>

          <DataTable columns={previewColumns} rows={validated} />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setValidated([]);
                setFileName(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!ready.length}
              onClick={runImport}
            >
              Import {ready.length} row{ready.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function statusTone(status) {
  if (status === 'ok') return 'success';
  if (status === 'duplicate' || status === 'warning') return 'warning';
  if (status === 'error') return 'danger';
  return 'default';
}
