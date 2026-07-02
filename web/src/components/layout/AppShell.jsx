import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { SidebarBrand } from './SidebarBrand.jsx';
import { NavSidebarContent } from './NavSidebarContent.jsx';
import { MobileNavDrawer } from './MobileNavDrawer.jsx';
import { useOrgLogo } from '../../hooks/useOrgLogo.js';

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3 5h14M3 10h14M3 15h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppShell({ onAddContact }) {
  const { user, logout, devMode } = useAuth();
  const { logoUrl, loading } = useOrgLogo();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const showAddContact = location.pathname !== '/contacts';

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col overflow-y-auto border-r border-line bg-white md:flex">
        <NavSidebarContent
          logoUrl={logoUrl}
          loading={loading}
          user={user}
          devMode={devMode}
          logout={logout}
        />
      </aside>

      <MobileNavDrawer open={mobileNavOpen} onClose={closeMobileNav}>
        <NavSidebarContent
          logoUrl={logoUrl}
          loading={loading}
          user={user}
          devMode={devMode}
          logout={logout}
          onNavClick={closeMobileNav}
          mobile
        />
      </MobileNavDrawer>

      <div className="flex flex-col md:pl-[220px]">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-white px-3 md:gap-3 md:px-5">
          <button
            type="button"
            className="btn-ghost -ml-1 h-11 w-11 shrink-0 p-0 md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-drawer"
          >
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1 md:hidden">
            <SidebarBrand logoUrl={logoUrl} loading={loading} variant="header" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showAddContact && (
              <button type="button" className="btn-secondary" onClick={onAddContact}>
                Add Contact
              </button>
            )}
          </div>
        </header>
        <main className="p-4 md:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
