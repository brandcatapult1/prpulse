import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Primitives.jsx';
import {
  buildPostedDeliverablePatch,
  canMarkDeliverablePosted,
  deliverableProofEmphasis,
} from '../../lib/deliverableLogging.js';
import { todayIso } from '../../lib/dates.js';

/**
 * One-level panel to log a single deliverable as posted with proof.
 */
export function LogDeliverablePanel({ deliverable, open, onClose, onConfirm }) {
  const fileRef = useRef(null);
  const [contentLink, setContentLink] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [publishedDate, setPublishedDate] = useState(todayIso());

  useEffect(() => {
    if (!open || !deliverable?.id) return;
    setContentLink('');
    setScreenshots([]);
    setPublishedDate(todayIso());
  }, [open, deliverable?.id]);

  if (!deliverable) return null;

  const emphasis = deliverableProofEmphasis(deliverable.deliverable_type);
  const canSubmit = canMarkDeliverablePosted({ contentLink, screenshots });

  function resetAndClose() {
    setContentLink('');
    setScreenshots([]);
    setPublishedDate(todayIso());
    onClose();
  }

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

  function handleConfirm() {
    if (!canSubmit) return;
    const next = buildPostedDeliverablePatch(deliverable, {
      contentLink,
      screenshots,
      publishedDate,
    });
    onConfirm(next);
    resetAndClose();
  }

  const typeLabel = `${deliverable.deliverable_type} ×${deliverable.quantity}`;

  return (
    <Modal
      open={open}
      mobileSheet
      title={`Log deliverable · ${typeLabel}`}
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
      <div className="space-y-4">
        <p className="text-2xs text-ink-secondary">
          Add a post link and/or screenshot — at least one is required.
        </p>

        <label className="block text-2xs text-ink-secondary">
          <span className={emphasis.screenshotPrimary ? 'font-normal text-ink-tertiary' : 'font-medium text-ink'}>
            {emphasis.linkLabel}
          </span>
          <input
            type="url"
            className="input-field mt-1 w-full text-sm"
            placeholder="https://instagram.com/…"
            value={contentLink}
            onChange={(e) => setContentLink(e.target.value)}
          />
        </label>

        <div>
          <span
            className={`mb-1.5 block text-2xs ${
              emphasis.screenshotPrimary ? 'font-medium text-ink' : 'text-ink-secondary'
            }`}
          >
            {emphasis.screenshotLabel}
          </span>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          <button type="button" className="btn-secondary text-2xs" onClick={() => fileRef.current?.click()}>
            Upload screenshot
          </button>
          {screenshots.length > 0 && (
            <ul className="mt-2 space-y-1">
              {screenshots.map((shot) => (
                <li
                  key={shot.id}
                  className="flex items-center justify-between rounded-md border border-line px-2 py-1 text-2xs"
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

        <label className="block text-2xs text-ink-secondary">
          Posted date
          <input
            type="date"
            className="input-field mt-1 w-full text-sm"
            value={publishedDate}
            onChange={(e) => setPublishedDate(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
