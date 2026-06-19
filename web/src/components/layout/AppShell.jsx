import { NavLink, Outlet } from 'react-router-dom';
import { MOCK_USER } from '../../data/mock.js';

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/campaigns/c1', label: 'Campaigns' },
  { to: '/brands', label: 'Brands' },
  { to: '/registrations', label: 'Registrations' },
  { to: '/reports', label: 'Reports' },
];

export function AppShell({ onQuickAdd }) {
  return (
    <div className="flex min-h-screen bg-surface-muted">
      <aside className="hidden w-56 shrink-0 border-r border-surface-border bg-white md:flex md:flex-col">
        <div className="border-b border-surface-border px-5 py-4">
          <div className="text-sm font-semibold tracking-tight">PR Pulse</div>
          <div className="text-xs text-slate-500">Brand Catapult</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-accent-muted font-medium text-accent' : 'text-slate-600 hover:bg-slate-50'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-surface-border bg-white px-4 py-3 md:px-6">
          <div className="md:hidden text-sm font-semibold">PR Pulse</div>
          <div className="hidden flex-1 md:block">
            <input className="input-field max-w-md" placeholder="Search contacts, campaigns… (Cmd+K)" />
          </div>
          <button type="button" className="btn-primary" onClick={onQuickAdd}>Quick Add</button>
          <div className="hidden text-right text-xs sm:block">
            <div className="font-medium text-slate-800">{MOCK_USER.full_name}</div>
            <div className="text-slate-500">Campaign Manager</div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
