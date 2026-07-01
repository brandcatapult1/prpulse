import { useEffect, useState } from 'react';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { USER_ROLES, eligibleReportingManagers, reportsToEditableForRole } from '../../lib/adminPermissions.js';
import { adminApi } from '../../lib/api.js';

const EMPTY = {
  full_name: '',
  email: '',
  role: 'campaign_manager',
  reports_to: '',
  is_active: true,
};

export function AddUserDrawer({ open, onClose, users, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setToast(null);
  }, [open]);

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'role' && value === 'admin') {
        next.reports_to = '';
      }
      return next;
    });
  }

  const showReportsTo = reportsToEditableForRole(form.role);
  const managerOptions = eligibleReportingManagers(users, { userRole: form.role });
  const canSave = form.full_name.trim() && form.email.trim();

  async function handleSave() {
    if (saving || !canSave) return;

    setSaving(true);
    try {
      const saved = await adminApi.createUser({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role: form.role,
        reports_to: showReportsTo ? (form.reports_to || null) : null,
        is_active: form.is_active,
      });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setToast(err.message ?? 'Could not create user');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <Drawer
        open={open}
        title="Add user"
        onClose={onClose}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? 'Adding…' : 'Add user'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-2xs text-ink-secondary">
            Team members sign in with Google using this email. No password is required.
          </p>

          <label className="block text-2xs text-ink-secondary">
            Full name
            <input
              className="input-field mt-1"
              value={form.full_name}
              onChange={(e) => updateField('full_name', e.target.value)}
              autoComplete="name"
            />
          </label>

          <label className="block text-2xs text-ink-secondary">
            Email
            <input
              className="input-field mt-1"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="block text-2xs text-ink-secondary">
            Role
            <select
              className="input-field mt-1"
              value={form.role}
              onChange={(e) => updateField('role', e.target.value)}
            >
              {USER_ROLES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          {showReportsTo ? (
            <label className="block text-2xs text-ink-secondary">
              Reports to
              <select
                className="input-field mt-1"
                value={form.reports_to}
                onChange={(e) => updateField('reports_to', e.target.value)}
              >
                <option value="">— None —</option>
                {managerOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-2xs text-ink-tertiary">
              Admins are top of the org chart and do not report to anyone.
            </p>
          )}

          <label className="flex items-center gap-2 text-2xs text-ink-secondary">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => updateField('is_active', e.target.checked)}
              className="rounded border-line text-brand"
            />
            Active account
          </label>
        </div>
      </Drawer>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
