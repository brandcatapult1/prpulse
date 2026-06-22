import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

/** Render overlays at document root so board scroll/overflow/transform cannot clip them. */
export function OverlayPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function findScrollParent(el) {
  let node = el?.parentElement;
  while (node) {
    const { overflow, overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(`${overflow}${overflowY}`)) return node;
    node = node.parentElement;
  }
  return null;
}

export function useAnchoredPosition(anchorEl, open, { width = 288, gap = 6 } = {}) {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!open || !anchorEl) {
      setPosition(null);
      return undefined;
    }

    function update() {
      const rect = anchorEl.getBoundingClientRect();
      const margin = 8;
      const panelWidth = Math.min(width, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - panelWidth - margin);
      const belowTop = rect.bottom + gap;
      const spaceBelow = window.innerHeight - belowTop - margin;
      const spaceAbove = rect.top - gap - margin;
      let top = belowTop;
      let maxHeight = spaceBelow;
      let transform;

      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        top = rect.top - gap;
        maxHeight = spaceAbove;
        transform = 'translateY(-100%)';
      }

      setPosition({
        left,
        top,
        width: panelWidth,
        maxHeight: Math.max(160, maxHeight),
        transform,
      });
    }

    update();
    const scrollParent = findScrollParent(anchorEl);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    scrollParent?.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      scrollParent?.removeEventListener('scroll', update);
    };
  }, [anchorEl, open, width, gap]);

  return position;
}

/** Popover panel anchored to a trigger element (portaled). */
export function AnchoredPanel({
  open,
  anchorEl,
  onClose,
  children,
  className = '',
  width = 288,
  backdrop = true,
}) {
  const position = useAnchoredPosition(anchorEl, open, { width });
  if (!open || !position) return null;

  return (
    <OverlayPortal>
      {backdrop && (
        <div className="fixed inset-0 z-[60] bg-transparent" onClick={onClose} aria-hidden />
      )}
      <div
        role="dialog"
        aria-modal="true"
        className={`panel z-[61] overflow-y-auto shadow-[0_12px_40px_rgba(26,29,38,0.14)] ${className}`}
        style={{
          position: 'fixed',
          left: position.left,
          top: position.top,
          width: position.width,
          maxHeight: position.maxHeight,
          transform: position.transform,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </OverlayPortal>
  );
}
