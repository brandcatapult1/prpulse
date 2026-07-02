/**
 * Sidebar header: agency logo (when configured) + PR Pulse product name.
 * variant="sidebar" — desktop fixed sidebar (default, unchanged).
 * variant="header" — compact inline brand for the mobile top bar.
 * variant="drawer" — mobile nav drawer header.
 */
export function SidebarBrand({ logoUrl, loading = false, variant = 'sidebar' }) {
  const showLogo = Boolean(logoUrl) && !loading;

  if (variant === 'header') {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {showLogo && (
          <img
            src={logoUrl}
            alt=""
            className="h-7 w-auto max-w-[120px] shrink-0 object-contain object-left"
            decoding="async"
          />
        )}
        <span className="truncate text-sm font-semibold tracking-tight text-ink">PR Pulse</span>
      </div>
    );
  }

  if (variant === 'drawer') {
    return (
      <div className="border-b border-line/60 px-4 pb-4 pt-4">
        {showLogo && (
          <img
            src={logoUrl}
            alt=""
            className="block h-10 w-full max-w-[188px] object-contain object-left"
            decoding="async"
          />
        )}
        <div
          className={`text-sm font-semibold tracking-tight text-ink ${showLogo ? 'mt-2' : ''}`}
        >
          PR Pulse
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-line/60 px-4 pb-4 pt-5">
      {showLogo && (
        <img
          src={logoUrl}
          alt=""
          className="block h-12 w-full max-w-[188px] object-contain object-left"
          decoding="async"
        />
      )}
      <div
        className={`text-sm font-semibold tracking-tight text-ink ${showLogo ? 'mt-2.5' : ''}`}
      >
        PR Pulse
      </div>
    </div>
  );
}
