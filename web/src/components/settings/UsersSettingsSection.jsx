import { useCallback, useEffect, useState } from 'react';
import { Toast } from '../ui/Primitives.jsx';
import { DataTable } from '../ui/DataKit.jsx';
import { Pill } from '../../lib/format.jsx';
import { USER_ROLES, eligibleReportingManagers, reportsToEditableForRole } from '../../lib/adminPermissions.js';
import { adminApi } from '../../lib/api.js';
import { AddUserDrawer } from '../admin/AddUserDrawer.jsx';

/** Users & roles — relocated from AdminPage; logic unchanged. */
export function UsersSettingsSection() {
  const [users, setUsers] = useState([]);
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

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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

  return (
    <>
      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">
          {loadError}
        </div>
      )}

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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
