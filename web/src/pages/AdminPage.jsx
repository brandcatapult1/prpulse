import { useCallback, useEffect, useState } from 'react';
import { Card, Drawer, EmptyState, Toast } from '../components/ui/Primitives.jsx';
import { DataTable } from '../components/ui/DataKit.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill, roleLabel } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { AUDIT_ENTITY_TYPES, USER_ROLES, canAccessAdmin, eligibleReportingManagers, reportsToEditableForRole } from '../lib/adminPermissions.js';
import { useAuth } from '../context/AuthContext.jsx';
import { adminApi } from '../lib/api.js';
import { OrgBrandingSettings } from '../components/admin/OrgBrandingSettings.jsx';
import { DemoFixturesPanel } from '../components/admin/DemoFixturesPanel.jsx';
import { AddUserDrawer } from '../components/admin/AddUserDrawer.jsx';

const TABS = [
  { id: 'users', label: 'Users & roles' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit log' },
];

export function AdminPage() {
  const { user } = useAuth();
  const allowed = canAccessAdmin(user?.role);
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [entityFilter, setEntityFilter] = useState('all');
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);
  const [addUserOpen, setAddUserOpen] = useState(false);

  const loadUsers = useCallback(() => {
    adminApi
      .users()
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
        setLoadError(null);
      })
      .catch((err) => {
        setUsers([]);
        setLoadError(err.message ?? 'Could not load users');
      });
  }, []);

  const loadAudit = useCallback(() => {
    adminApi
      .auditLog(entityFilter === 'all' ? undefined : entityFilter)
      .then((data) => {
        setAuditRows(Array.isArray(data) ? data : []);
      })
      .catch(() => setAuditRows([]));
  }, [entityFilter]);

  useEffect(() => {
    if (!allowed) return;
    loadUsers();
  }, [allowed, loadUsers]);

  useEffect(() => {
    if (!allowed || tab !== 'audit') return;
    loadAudit();
  }, [allowed, tab, loadAudit]);

  const updateUser = async (userId, patch) => {
    try {
      const saved = await adminApi.updateUser(userId, patch);
      setUsers((prev) => prev.map((u) => (u.id === userId ? saved : u)));
      setToast('User updated');
    } catch (err) {
      setToast(err.message ?? 'Update failed');
    }
  };

  const handleUserCreated = (saved) => {
    setUsers((prev) => [...prev, saved].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setToast(`${saved.full_name} added`);
  };

  const userColumns = [
    { key: 'full_name', label: 'Name', render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Role',
      render: (r) => (
        <select
          className="input-field h-8 max-w-[180px]"
          value={r.role}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const role = e.target.value;
            const patch = role === 'admin' ? { role, reports_to: null } : { role };
            updateUser(r.id, patch);
          }}
        >
          {USER_ROLES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'reports_to',
      label: 'Reports to',
      render: (r) => {
        if (!reportsToEditableForRole(r.role)) {
          return <span className="text-2xs text-ink-tertiary">Top of org</span>;
        }
        const managers = eligibleReportingManagers(users, {
          userRole: r.role,
          excludeUserId: r.id,
          includeUserId: r.reports_to,
        });
        return (
          <select
            className="input-field h-8 max-w-[200px]"
            value={r.reports_to ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateUser(r.id, { reports_to: e.target.value || null })}
          >
            <option value="">— None —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        );
      },
    },
    {
      key: 'is_active',
      label: 'Active',
      render: (r) => (
        <label className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={Boolean(r.is_active)}
            onChange={(e) => updateUser(r.id, { is_active: e.target.checked })}
            className="rounded border-line text-brand"
          />
          <Pill tone={r.is_active ? 'success' : 'muted'}>{r.is_active ? 'Active' : 'Inactive'}</Pill>
        </label>
      ),
    },
  ];

  const auditColumns = [
      {
        key: 'occurred_at',
        label: 'When',
        render: (r) => formatDateTime(r.occurred_at),
      },
      { key: 'user_name', label: 'User', render: (r) => r.user_name ?? 'System' },
      {
        key: 'entity_type',
        label: 'Entity',
        render: (r) => <Pill tone="info">{r.entity_type}</Pill>,
      },
      {
        key: 'entity_id',
        label: 'Record',
        render: (r) => <span className="font-mono text-2xs">{shortId(r.entity_id)}</span>,
      },
      {
        key: 'action_type',
        label: 'Action',
        render: (r) => formatAction(r.action_type),
      },
      {
        key: 'summary',
        label: 'Change',
      render: (r) => (
        <span className="text-2xs text-ink-secondary">{summarizeChange(r)}</span>
      ),
    },
  ];

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title={MODULES.admin.pageTitle} subtitle={MODULES.admin.subtitle} />
        <Card className="!p-6 text-center">
          <p className="text-sm text-ink-secondary">
            Admin access is required to manage users and view the system audit log.
          </p>
          <p className="mt-2 text-2xs text-ink-tertiary">
            Your role: {roleLabel(user?.role)}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={MODULES.admin.pageTitle} subtitle={MODULES.admin.subtitle} />

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{loadError}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
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

      {tab === 'users' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xs text-ink-secondary">
              Add team members, assign roles, reporting lines, and deactivate accounts.
            </p>
            <button type="button" className="btn-primary" onClick={() => setAddUserOpen(true)}>
              Add user
            </button>
          </div>
          <DataTable columns={userColumns} rows={users} />
          <AddUserDrawer
            open={addUserOpen}
            onClose={() => setAddUserOpen(false)}
            users={users}
            onSaved={handleUserCreated}
          />
        </>
      )}

      {tab === 'settings' && (
        <>
          <p className="text-2xs text-ink-secondary">
            Organization branding and demo data for team walkthroughs.
          </p>
          <OrgBrandingSettings />
          <DemoFixturesPanel />
        </>
      )}

      {tab === 'audit' && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEntityFilter('all')}
              className={`rounded-md border px-2.5 py-1 text-2xs ${entityFilter === 'all' ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line bg-white text-ink-secondary'}`}
            >
              All
            </button>
            {AUDIT_ENTITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setEntityFilter(type)}
                className={`rounded-md border px-2.5 py-1 text-2xs capitalize ${entityFilter === type ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line bg-white text-ink-secondary'}`}
              >
                {type}
              </button>
            ))}
          </div>

          {auditRows.length === 0 ? (
            <EmptyState title="No audit entries" description="System changes will appear here." />
          ) : (
            <DataTable columns={auditColumns} rows={auditRows} onRowClick={setSelectedAudit} />
          )}
        </>
      )}

      <AuditDetailDrawer entry={selectedAudit} onClose={() => setSelectedAudit(null)} />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function AuditDetailDrawer({ entry, onClose }) {
  if (!entry) return null;

  return (
    <Drawer open={Boolean(entry)} title="Audit entry" onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <Detail label="When" value={formatDateTime(entry.occurred_at)} />
        <Detail label="User" value={entry.user_name ?? 'System'} />
        <Detail label="Entity" value={`${entry.entity_type} · ${entry.entity_id}`} />
        <Detail label="Action" value={formatAction(entry.action_type)} />
      </dl>
      <div className="mt-4 space-y-3">
        <JsonBlock title="Previous value" value={entry.previous_value} />
        <JsonBlock title="New value" value={entry.new_value} />
      </div>
    </Drawer>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-2xs font-medium text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

function JsonBlock({ title, value }) {
  return (
    <div>
      <div className="mb-1.5 text-2xs font-medium text-ink-secondary">{title}</div>
      <pre className="max-h-40 overflow-auto rounded-md border border-line bg-canvas p-3 text-2xs text-ink-secondary">
        {value ? JSON.stringify(value, null, 2) : '—'}
      </pre>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(id) {
  if (!id) return '—';
  return String(id).length > 8 ? `${String(id).slice(0, 8)}…` : id;
}

function formatAction(action) {
  return (action ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function summarizeChange(entry) {
  const prev = entry.previous_value;
  const next = entry.new_value;
  if (!prev && next) return 'Created';
  if (prev && !next) return 'Deleted';
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const parts = [];
  for (const key of keys) {
    const a = prev?.[key];
    const b = next?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      parts.push(`${key}: ${formatVal(a)} → ${formatVal(b)}`);
    }
  }
  return parts.slice(0, 2).join(' · ') || 'Updated';
}

function formatVal(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/_/g, ' ');
}
