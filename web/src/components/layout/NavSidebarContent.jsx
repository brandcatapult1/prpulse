import { NavLink } from 'react-router-dom';
import { roleLabel } from '../../lib/format.jsx';
import { NAV_ITEMS } from '../../lib/modules.js';
import { canAccessAdmin } from '../../lib/adminPermissions.js';
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

export function NavSidebarContent({
  logoUrl,
  loading,
  user,
  devMode,
  logout,
  onNavClick,
  mobile = false,
}) {
  const items = NAV_ITEMS.filter((item) => item.to !== '/admin' || canAccessAdmin(user?.role));

  return (
    <>
      <SidebarBrand logoUrl={logoUrl} loading={loading} variant={mobile ? 'drawer' : 'sidebar'} />
      <nav className={`flex-1 space-y-0.5 ${mobile ? 'px-3' : 'px-2'}`}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavClick}
            className={({ isActive }) => navLinkClass(isActive, mobile)}
          >
            {item.label}
          </NavLink>
        ))}
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
