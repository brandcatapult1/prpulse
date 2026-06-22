import { useEffect, useState } from 'react';
import { AnchoredPanel } from '../ui/OverlayPortal.jsx';
import { Modal } from '../ui/Primitives.jsx';
import { InConversationCardLogging } from './InConversationCardLogging.jsx';

function usePrefersAnchoredPanel(anchorEl) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return Boolean(anchorEl) && !isMobile;
}

function contactLogTitle(engagement) {
  return `Log contact · ${engagement.contact_name}`;
}

/**
 * Shared shell for the in-conversation contact log flow (dashboard + campaign board).
 * Desktop board: anchored popover. Dashboard / mobile: compact centered modal.
 */
export function ContactLoggingPanel({
  engagement,
  open,
  onClose,
  onApply,
  onError,
  anchorEl = null,
}) {
  const useAnchored = usePrefersAnchoredPanel(anchorEl);

  if (!engagement || !open) return null;

  const title = contactLogTitle(engagement);
  const body = (
    <>
      <p className="mb-3 text-2xs text-ink-secondary">{engagement.campaign_name}</p>
      <InConversationCardLogging
        engagement={engagement}
        alwaysShowActions
        embedded
        onApply={onApply}
        onError={onError}
        onComplete={onClose}
      />
    </>
  );

  if (useAnchored) {
    return (
      <AnchoredPanel open={open} anchorEl={anchorEl} onClose={onClose} width={300}>
        <div className="p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h4 className="text-[11px] font-medium text-ink">{title}</h4>
            <button type="button" onClick={onClose} className="text-ink-tertiary hover:text-ink">
              ×
            </button>
          </div>
          {body}
        </div>
      </AnchoredPanel>
    );
  }

  return (
    <Modal open={open} compact title={title} onClose={onClose}>
      {body}
    </Modal>
  );
}

/** Kanban card trigger — opens ContactLoggingPanel anchored to the button. */
export function InConversationLoggingTrigger({ engagement, onApply, onError }) {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  function handleOpen(event) {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setAnchorEl(null);
  }

  return (
    <>
      <div className="mt-2 border-t border-line/80 pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="max-md:block md:hidden md:group-hover/card:block">
          <button
            type="button"
            className="btn-secondary w-full !py-1 text-[11px]"
            onClick={handleOpen}
          >
            Log contact
          </button>
        </div>
      </div>
      <ContactLoggingPanel
        engagement={engagement}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        onApply={onApply}
        onError={onError}
      />
    </>
  );
}
