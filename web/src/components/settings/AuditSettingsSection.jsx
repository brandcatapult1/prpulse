import { useCallback, useEffect, useState } from 'react';
import { Drawer, EmptyState } from '../ui/Primitives.jsx';
import { DataTable } from '../ui/DataKit.jsx';
import { Pill } from '../../lib/format.jsx';
import { AUDIT_ENTITY_TYPES } from '../../lib/adminPermissions.js';
import { adminApi } from '../../lib/api.js';

/** Audit log — relocated from AdminPage; logic unchanged. */
export function AuditSettingsSection() {
  const [auditRows, setAuditRows] = useState([]);
  const [entityFilter, setEntityFilter] = useState('all');
  const [selectedAudit, setSelectedAudit] = useState(null);

  const loadAudit = useCallback(() => {
    adminApi
      .auditLog(entityFilter === 'all' ? undefined : entityFilter)
      .then((data) => {
        setAuditRows(Array.isArray(data) ? data : []);
      })
      .catch(() => setAuditRows([]));
  }, [entityFilter]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

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

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
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

      <AuditDetailDrawer entry={selectedAudit} onClose={() => setSelectedAudit(null)} />
    </>
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
