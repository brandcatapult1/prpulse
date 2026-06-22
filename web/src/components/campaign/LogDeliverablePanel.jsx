import { useEffect, useRef, useState } from 'react';
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

/**
 * One-level panel to log a single deliverable as posted with proof.
 * Use `inline` on kanban cards — backdrop-filter on cards breaks fixed modals.
 */
export function LogDeliverablePanel({ deliverable, open, onClose, onConfirm, inline = false }) {
  const [contentLink, setContentLink] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [publishedDate, setPublishedDate] = useState(todayIso());

  useEffect(() => {
    if (!deliverable?.id) return;
    if (!inline && !open) return;
    setContentLink('');
    setScreenshots([]);
    setPublishedDate(todayIso());
  }, [open, inline, deliverable?.id]);

  if (!deliverable) return null;
  if (!inline && !open) return null;

  const canSubmit = canMarkDeliverablePosted({ contentLink, screenshots });
  const title = deliverablePanelTitle(deliverable);

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
      compact={inline}
    />
  );

  if (inline) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <h4 className="mb-2 text-[11px] font-medium text-ink">{title}</h4>
        {form}
        <div className="mt-2 flex gap-1">
          <button type="button" className="btn-secondary flex-1 !py-1 text-[11px]" onClick={resetAndClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1 !py-1 text-[11px]"
            disabled={!canSubmit}
            onClick={handleConfirm}
          >
            Mark posted
          </button>
        </div>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      mobileSheet
      title={title}
      onClose={resetAndClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={resetAndClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit}
            onClick={handleConfirm}
          >
            Mark posted
          </button>
        </div>
      }
    >
      {form}
    </Modal>
  );
}
