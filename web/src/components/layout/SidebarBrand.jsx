/**
 * Sidebar header: agency logo (when configured) + PR Pulse product name.
 */
export function SidebarBrand({ logoUrl, loading = false }) {
  const showLogo = Boolean(logoUrl) && !loading;

  return (
    <div className="px-4 pb-4 pt-5">
      {showLogo && (
        <img
          src={logoUrl}
          alt=""
          className="h-8 max-w-[168px] object-contain object-left"
          decoding="async"
        />
      )}
      <div
        className={`text-sm font-semibold tracking-tight text-ink ${showLogo ? 'mt-3' : ''}`}
      >
        PR Pulse
      </div>
    </div>
  );
}
