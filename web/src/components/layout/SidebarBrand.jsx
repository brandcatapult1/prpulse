/**
 * Sidebar header: agency logo (when configured) + PR Pulse product name.
 */
export function SidebarBrand({ logoUrl, loading = false }) {
  const showLogo = Boolean(logoUrl) && !loading;

  return (
    <div className="border-b border-line/60 px-4 pb-4 pt-5">
      {showLogo && (
        <img
          src={logoUrl}
          alt=""
          className="block h-9 w-auto max-w-[172px] object-contain object-left"
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
