import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../components/ui/DataKit.jsx';
import { Drawer, EmptyState, Toast } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill, healthTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { BRAND_CATEGORIES, canManageBrands } from '../lib/brandCategories.js';
import { brandsApi } from '../lib/api.js';
import { AddBrandModal } from '../components/brands/AddBrandModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function BrandsPage() {
  const { user } = useAuth();
  const canEdit = canManageBrands(user?.role);
  const [rows, setRows] = useState([]);
  const [managers, setManagers] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(() => {
    brandsApi
      .list()
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => {
        setRows([]);
        setError(err.message ?? 'Could not load brands');
      });
    if (canEdit) {
      brandsApi.accountManagers().then((m) => setManagers(Array.isArray(m) ? m : [])).catch(() => setManagers([]));
    }
  }, [canEdit]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: 'brand_name',
      label: 'Brand',
      render: (r) => (
        <div className="flex items-center gap-2">
          {r.logo_label ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-canvas text-2xs">📎</span>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-canvas text-2xs font-medium text-ink-tertiary">
              {r.brand_name.charAt(0)}
            </span>
          )}
          <span className="font-medium text-ink">{r.brand_name}</span>
        </div>
      ),
    },
    { key: 'brand_category', label: 'Category', render: (r) => r.brand_category ?? '—' },
    { key: 'account_manager_name', label: 'Account manager', render: (r) => r.account_manager_name ?? '—' },
    {
      key: 'campaign_count',
      label: 'Campaigns',
      render: (r) => <span className="tabular-nums">{r.campaign_count ?? 0}</span>,
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (r) => <Pill tone={r.is_active ? 'success' : 'muted'}>{r.is_active ? 'Active' : 'Inactive'}</Pill>,
    },
  ];

  const saveBrand = async (id, patch, message) => {
    try {
      const saved = await brandsApi.update(id, patch);
      setRows((prev) => prev.map((b) => (b.id === id ? { ...b, ...saved } : b)));
      setSelected((prev) => (prev?.id === id ? { ...prev, ...saved } : prev));
      setToast(message);
    } catch (err) {
      setToast(err.message ?? 'Save failed');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={MODULES.brands.pageTitle}
        subtitle={MODULES.brands.subtitle}
        actions={
          canEdit ? (
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
              + Brand
            </button>
          ) : null
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{error}</div>
      )}

      {!canEdit && (
        <div className="rounded-lg border border-line bg-canvas px-4 py-3 text-2xs text-ink-secondary">
          View-only — brand edits require Senior Manager or Admin access.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No brands yet"
          description={
            canEdit
              ? 'Add your first client brand to create campaigns.'
              : 'Client brands appear here once added.'
          }
          action={
            canEdit ? (
              <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
                + Brand
              </button>
            ) : null
          }
        />
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={setSelected} />
      )}

      <BrandDrawer
        brand={selected}
        canEdit={canEdit}
        managers={managers}
        onClose={() => setSelected(null)}
        onSave={saveBrand}
      />

      <AddBrandModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        managers={managers}
        onCreated={(brand) => {
          load();
          setSelected(brand);
          setToast(`${brand.brand_name} created`);
        }}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function BrandDrawer({ brand, canEdit, managers, onClose, onSave }) {
  const fileRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    if (brand) {
      setDraft({ ...brand });
      brandsApi.get(brand.id).then((detail) => {
        setCampaigns(detail.campaigns ?? []);
      }).catch(() => setCampaigns([]));
    }
  }, [brand]);

  if (!brand || !draft) return null;

  const manager = managers.find((m) => m.id === draft.account_manager_id);

  const setField = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  const handleLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setField('logo_label', file.name);
    event.target.value = '';
  };

  const save = () => {
    const patch = {
      brand_name: draft.brand_name,
      brand_category: draft.brand_category,
      logo_label: draft.logo_label,
      primary_contact: draft.primary_contact,
      contact_email: draft.contact_email,
      account_manager_id: draft.account_manager_id,
      account_manager_name: manager?.full_name ?? draft.account_manager_name,
      is_active: draft.is_active,
    };
    onSave(brand.id, patch, `${draft.brand_name} saved`);
  };

  return (
    <Drawer
      open={Boolean(brand)}
      title={brand.brand_name}
      onClose={onClose}
      footer={
        canEdit ? (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={save}>Save brand</button>
          </div>
        ) : (
          <button type="button" className="btn-primary ml-auto" onClick={onClose}>Close</button>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {draft.logo_label ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-canvas text-lg">📎</div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-brand-soft text-lg font-semibold text-brand">
              {draft.brand_name.charAt(0)}
            </div>
          )}
          <div>
            <div className="text-sm font-semibold text-ink">{draft.brand_name}</div>
            <div className="text-2xs text-ink-tertiary">{draft.brand_category ?? 'No category'}</div>
          </div>
        </div>

        {canEdit && (
          <>
            <Field label="Brand name">
              <input className="input-field" value={draft.brand_name} onChange={(e) => setField('brand_name', e.target.value)} />
            </Field>
            <Field label="Category">
              <select className="input-field" value={draft.brand_category ?? ''} onChange={(e) => setField('brand_category', e.target.value || null)}>
                <option value="">Select category</option>
                {BRAND_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </Field>
            <Field label="Logo">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
                  Upload logo
                </button>
                {draft.logo_label && (
                  <span className="text-2xs text-ink-secondary">📎 {draft.logo_label}</span>
                )}
              </div>
            </Field>
            <Field label="Primary contact">
              <input className="input-field" value={draft.primary_contact ?? ''} onChange={(e) => setField('primary_contact', e.target.value)} />
            </Field>
            <Field label="Contact email">
              <input className="input-field" type="email" value={draft.contact_email ?? ''} onChange={(e) => setField('contact_email', e.target.value)} />
            </Field>
            <Field label="Account manager">
              <select
                className="input-field"
                value={draft.account_manager_id ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const person = managers.find((m) => m.id === id);
                  setDraft((d) => ({
                    ...d,
                    account_manager_id: id,
                    account_manager_name: person?.full_name ?? null,
                  }));
                }}
              >
                <option value="">Unassigned</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={Boolean(draft.is_active)}
                onChange={(e) => setField('is_active', e.target.checked)}
                className="rounded border-line text-brand"
              />
              Active brand
            </label>
          </>
        )}

        {!canEdit && (
          <dl className="space-y-2 text-sm">
            <ReadOnly label="Primary contact" value={draft.primary_contact} />
            <ReadOnly label="Contact email" value={draft.contact_email} />
            <ReadOnly label="Account manager" value={draft.account_manager_name} />
            <ReadOnly label="Status" value={draft.is_active ? 'Active' : 'Inactive'} />
          </dl>
        )}

        <div className="border-t border-line pt-4">
          <h3 className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">Campaigns</h3>
          {campaigns.length === 0 ? (
            <p className="mt-2 text-2xs text-ink-tertiary">No campaigns for this brand.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link to={`/campaigns/${c.id}`} className="min-w-0 hover:text-brand">
                    <div className="truncate text-sm font-medium text-ink">{c.campaign_name}</div>
                    <div className="text-2xs text-ink-tertiary">
                      {c.completed_collaborations}/{c.target_collaborations ?? '—'} complete
                    </div>
                  </Link>
                  <Pill tone={healthTone(c.campaign_health)}>
                    {c.campaign_health === 'not_set' ? c.status : c.campaign_health}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-2xs font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <dt className="text-2xs text-ink-tertiary">{label}</dt>
      <dd className="font-medium text-ink">{value ?? '—'}</dd>
    </div>
  );
}
