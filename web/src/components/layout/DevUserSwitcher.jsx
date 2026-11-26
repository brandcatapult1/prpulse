import { useEffect, useState } from 'react';
import { authApi } from '../../lib/api.js';
import { roleLabel } from '../../lib/format.jsx';

/** Dev mode only: sign in as another user to test what each role sees. */
export function DevUserSwitcher({ user }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    authApi.devUsers().then((rows) => setUsers(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  if (users.length === 0) return null;

  return (
    <label className="mb-2 block px-2">
      <span className="mb-1 block text-2xs font-medium text-ink-secondary">Sign in as (testing)</span>
      <select
        className="input-field w-full text-2xs"
        value={user?.id ?? ''}
        onChange={(e) => {
          authApi.devSwitch(e.target.value)
            .then(() => { window.location.href = '/'; })
            .catch((err) => window.alert(err.message ?? 'Could not switch user'));
        }}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.full_name} — {roleLabel(u.role)}</option>
        ))}
      </select>
    </label>
  );
}
