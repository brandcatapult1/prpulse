import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { roleLabel } from '../../lib/format.jsx';
import { NAV_ITEMS } from '../../lib/modules.js';
import { canAccessSettings } from '../../lib/settingsRegistry.js';
import { SidebarBrand } from './SidebarBrand.jsx';

const DESKTOP_LINK =
  'block rounded-md px-2.5 py-2 text-sm transition-colors';
const MOBILE_LINK =
  'flex min-h-[44px] items-center rounded-md px-3 py-2.5 text-sm transition-colors';

function navLinkClass(isActive, mobile) {
  const base = mobile ? MOBILE_LINK : DESKTOP_LINK;
  return `${base} ${
    isActive
      ? 'bg-brand-soft font-medium text-brand'
      : 'text-ink-secondary hover:bg-canvas hover:text-ink'
  }`;
}

/** Parent menu with sub-pages; open while one of its pages is showing. */
function NavGroup({ item, mobile, onNavClick, user }) {
  const { pathname } = useLocation();
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
  const [open, setOpen] = useState(active);
  const shown = open;
  const children = item.children.filter((c) => c.to !== '/reports/team' || user?.role !== 'campaign_manager');
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={shown}
        className={`flex w-full items-center justify-between ${navLinkClass(false, mobile)} ${active ? 'font-medium text-ink' : ''}`}
      >
        <span>{item.label}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${shown ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>
      {shown && (
        <div className="mt-0.5 space-y-0.5 pl-3">
          {children.map((c) => (
            <NavLink key={c.to} to={c.to} onClick={onNavClick} className={({ isActive }) => `${navLinkClass(isActive, mobile)} !text-xs`}>
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function NavSidebarContent({
  logoUrl,
  loading,
  user,
  devMode,
  logout,
  onNavClick,
  mobile = false,
}) {
  const items = NAV_ITEMS.filter((item) => {
    if (item.to === '/settings') return canAccessSettings(user?.role);
    if (item.to === '/reports') return user?.role === 'admin' || user?.role === 'senior_manager';
    return true;
  });

  return (
    <>
      <SidebarBrand logoUrl={logoUrl} loading={loading} variant={mobile ? 'drawer' : 'sidebar'} />
      <nav className={`flex-1 space-y-0.5 ${mobile ? 'px-3' : 'px-2'}`}>
        {items.map((item) => (item.children ? (
          <NavGroup key={item.to} item={item} mobile={mobile} onNavClick={onNavClick} user={user} />
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavClick}
            className={({ isActive }) => navLinkClass(isActive, mobile)}
          >
            {item.label}
          </NavLink>
        )))}
      </nav>
      <div className={`border-t border-line ${mobile ? 'p-4' : 'p-3'}`}>
        {devMode && (
          <div className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-2xs font-medium text-amber-800">
            Dev mode — no Google sign-in
          </div>
        )}
        <div className="rounded-md px-2 py-2">
          <div className="truncate text-sm font-medium text-ink">{user?.full_name}</div>
          <div className="text-2xs text-ink-tertiary">{roleLabel(user?.role)}</div>
        </div>
        <button
          type="button"
          className={`btn-ghost mt-1 w-full justify-start ${mobile ? 'min-h-[44px] px-3' : 'px-2'}`}
          onClick={() => {
            onNavClick?.();
            logout();
          }}
        >
          Sign out
        </button>
      </div>
    </>
  );
}
