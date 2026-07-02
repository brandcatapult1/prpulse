import { useEffect } from 'react';
import { OverlayPortal } from '../ui/OverlayPortal.jsx';

export function MobileNavDrawer({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-40 md:hidden">
        <button
          type="button"
          className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
          onClick={onClose}
          aria-label="Close menu"
        />
        <aside
          id="mobile-nav-drawer"
          className="absolute inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col overflow-y-auto border-r border-white/80 bg-white/[0.95] shadow-[0_16px_48px_rgba(26,29,38,0.11),0_6px_16px_rgba(26,29,38,0.07),0_0_0_1px_rgba(255,255,255,0.8)_inset] backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="flex items-center justify-end border-b border-line/60 px-3 py-2">
            <button
              type="button"
              className="btn-ghost h-11 w-11 p-0"
              onClick={onClose}
              aria-label="Close menu"
            >
              <span className="text-lg leading-none text-ink-tertiary" aria-hidden>
                ×
              </span>
            </button>
          </div>
          {children}
        </aside>
      </div>
    </OverlayPortal>
  );
}
