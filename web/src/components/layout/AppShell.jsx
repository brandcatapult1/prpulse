import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleLabel } from '../../lib/format.jsx';
import { NAV_ITEMS } from '../../lib/modules.js';
import { canAccessAdmin } from '../../lib/adminPermissions.js';
import { SidebarBrand } from './SidebarBrand.jsx';
import { useOrgLogo } from '../../hooks/useOrgLogo.js';

export function AppShell({ onQuickAdd }) {
  const { user, logout, devMode } = useAuth();
  const navigate = useNavigate();
  const { logoUrl, loading } = useOrgLogo({ demoMode: devMode });

  return (
    <div className="bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col overflow-y-auto border-r border-line bg-white md:flex">
        <SidebarBrand logoUrl={logoUrl} loading={loading} />
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV_ITEMS.filter((item) => item.to !== '/admin' || canAccessAdmin(user?.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-2.5 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-ink-secondary hover:bg-canvas hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          {devMode && (
            <div className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-2xs font-medium text-amber-800">
              Dev mode — no Google sign-in
            </div>
          )}
          <div className="rounded-md px-2 py-2">
            <div className="truncate text-sm font-medium text-ink">{user?.full_name}</div>
            <div className="text-2xs text-ink-tertiary">{roleLabel(user?.role)}</div>
          </div>
          <button type="button" className="btn-ghost mt-1 w-full justify-start px-2" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-col md:pl-[220px]">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-line bg-white px-4 md:px-5">
          <div className="md:hidden text-sm font-semibold text-ink">PR Pulse</div>
          <button
            type="button"
            className="hidden flex-1 items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5 text-left text-2xs text-ink-tertiary md:flex md:max-w-sm"
            onClick={() => navigate('/contacts')}
          >
            <span>Search contacts, campaigns…</span>
            <span className="ml-auto rounded border border-line bg-white px-1.5 py-0.5 text-[10px]">⌘K</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={onQuickAdd}>
              Quick Add
            </button>
          </div>
        </header>
        <main className="p-4 md:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
