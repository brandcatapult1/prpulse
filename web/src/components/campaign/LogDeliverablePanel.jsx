import { useEffect, useRef, useState } from 'react';
import { AnchoredPanel } from '../ui/OverlayPortal.jsx';
import { Modal } from '../ui/Primitives.jsx';
import {
  buildUnitPostedPatch,
  canMarkDeliverablePosted,
  deliverableProofEmphasis,
  deliverablePostedUnits,
  deliverableTotalUnits,
} from '../../lib/deliverableLogging.js';
import { todayIso } from '../../lib/dates.js';

function deliverablePanelTitle(deliverable) {
  const typeLabel = `${deliverable.deliverable_type} ×${deliverableTotalUnits(deliverable)}`;
  const nextUnit = deliverablePostedUnits(deliverable) + 1;
  const totalUnits = deliverableTotalUnits(deliverable);
  return totalUnits > 1
    ? `Log deliverable · ${typeLabel} (${nextUnit} of ${totalUnits})`
    : `Log deliverable · ${typeLabel}`;
}

function LogDeliverableForm({
  deliverable,
  contentLink,
  setContentLink,
  screenshots,
  setScreenshots,
  publishedDate,
  setPublishedDate,
  compact = false,
}) {
  const fileRef = useRef(null);
  const emphasis = deliverableProofEmphasis(deliverable.deliverable_type);
  const labelClass = compact ? 'text-[11px]' : 'text-2xs';
  const inputClass = compact ? 'input-field mt-1 w-full text-2xs' : 'input-field mt-1 w-full text-sm';

  function handleFiles(event) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const added = files.map((file) => ({
      id: `s-${Date.now()}-${file.name}`,
      label: file.name,
    }));
    setScreenshots((prev) => [...prev, ...added]);
    event.target.value = '';
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <p className={`${labelClass} text-ink-secondary`}>
        Add a post link and/or screenshot — at least one is required.
      </p>

      <label className={`block ${labelClass} text-ink-secondary`}>
        <span className={emphasis.screenshotPrimary ? 'font-normal text-ink-tertiary' : 'font-medium text-ink'}>
          {emphasis.linkLabel}
        </span>
        <input
          type="url"
          className={inputClass}
          placeholder="https://instagram.com/…"
          value={contentLink}
          onChange={(e) => setContentLink(e.target.value)}
        />
      </label>

      <div>
        <span
          className={`mb-1.5 block ${labelClass} ${
            emphasis.screenshotPrimary ? 'font-medium text-ink' : 'text-ink-secondary'
          }`}
        >
          {emphasis.screenshotLabel}
        </span>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        <button
          type="button"
          className={compact ? 'btn-secondary !py-1 text-[11px]' : 'btn-secondary text-2xs'}
          onClick={() => fileRef.current?.click()}
        >
          Upload screenshot
        </button>
        {screenshots.length > 0 && (
          <ul className="mt-2 space-y-1">
            {screenshots.map((shot) => (
              <li
                key={shot.id}
                className={`flex items-center justify-between rounded-md border border-line px-2 py-1 ${labelClass}`}
              >
                <span className="truncate">{shot.label}</span>
                <button
                  type="button"
                  className="text-ink-tertiary hover:text-health-red"
                  onClick={() => setScreenshots((prev) => prev.filter((s) => s.id !== shot.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className={`block ${labelClass} text-ink-secondary`}>
        Posted date
        <input
          type="date"
          className={inputClass}
          value={publishedDate}
          onChange={(e) => setPublishedDate(e.target.value)}
        />
      </label>
    </div>
  );
}

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

/**
 * One-level panel to log a single deliverable as posted with proof.
 * Pass anchorEl on kanban cards for a portaled popover anchored to the trigger.
 */
export function LogDeliverablePanel({ deliverable, open, onClose, onConfirm, anchorEl = null }) {
  const [contentLink, setContentLink] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [publishedDate, setPublishedDate] = useState(todayIso());
  const useAnchored = usePrefersAnchoredPanel(anchorEl);

  useEffect(() => {
    if (!deliverable?.id || !open) return;
    setContentLink('');
    setScreenshots([]);
    setPublishedDate(todayIso());
  }, [open, deliverable?.id]);

  if (!deliverable || !open) return null;

  const canSubmit = canMarkDeliverablePosted({ contentLink, screenshots });
  const title = deliverablePanelTitle(deliverable);
  const compact = Boolean(anchorEl);

  function resetAndClose() {
    setContentLink('');
    setScreenshots([]);
    setPublishedDate(todayIso());
    onClose();
  }

  function handleConfirm() {
    if (!canSubmit) return;
    const next = buildUnitPostedPatch(deliverable, {
      contentLink,
      screenshots,
      publishedDate,
    });
    onConfirm(next);
    resetAndClose();
  }

  const form = (
    <LogDeliverableForm
      deliverable={deliverable}
      contentLink={contentLink}
      setContentLink={setContentLink}
      screenshots={screenshots}
      setScreenshots={setScreenshots}
      publishedDate={publishedDate}
      setPublishedDate={setPublishedDate}
      compact={compact}
    />
  );

  const footer = (
    <div className={compact ? 'mt-2 flex gap-1' : 'flex justify-end gap-2'}>
      <button
        type="button"
        className={compact ? 'btn-secondary flex-1 !py-1 text-[11px]' : 'btn-secondary'}
        onClick={resetAndClose}
      >
        Cancel
      </button>
      <button
        type="button"
        className={compact ? 'btn-primary flex-1 !py-1 text-[11px]' : 'btn-primary'}
        disabled={!canSubmit}
        onClick={handleConfirm}
      >
        Mark posted
      </button>
    </div>
  );

  if (useAnchored) {
    return (
      <AnchoredPanel open={open} anchorEl={anchorEl} onClose={resetAndClose} width={300}>
        <div className="p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h4 className="text-[11px] font-medium text-ink">{title}</h4>
            <button type="button" onClick={resetAndClose} className="text-ink-tertiary hover:text-ink">×</button>
          </div>
          {form}
          {footer}
        </div>
      </AnchoredPanel>
    );
  }

  return (
    <Modal
      open={open}
      mobileSheet
      title={title}
      onClose={resetAndClose}
      footer={footer}
    >
      {form}
    </Modal>
  );
}
