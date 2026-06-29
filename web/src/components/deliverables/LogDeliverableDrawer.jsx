import { useEffect, useRef, useState } from 'react';
import { Drawer } from '../ui/Primitives.jsx';
import {
  buildUnitPostedPatch,
  canMarkDeliverablePosted,
  deliverableProofEmphasis,
  deliverablePostedUnits,
  deliverableTotalUnits,
} from '../../lib/deliverableLogging.js';
import { todayIso } from '../../lib/dates.js';
import { uploadProofScreenshot } from '../../lib/proofUpload.js';

function deliverableDrawerTitle(deliverable) {
  const typeLabel = `${deliverable.deliverable_type} ×${deliverableTotalUnits(deliverable)}`;
  const nextUnit = deliverablePostedUnits(deliverable) + 1;
  const totalUnits = deliverableTotalUnits(deliverable);
  return totalUnits > 1
    ? `Log deliverable · ${typeLabel} (${nextUnit} of ${totalUnits})`
    : `Log deliverable · ${typeLabel}`;
}

export function LogDeliverableForm({
  deliverable,
  engagementId,
  contentLink,
  setContentLink,
  screenshots,
  setScreenshots,
  publishedDate,
  setPublishedDate,
  onUploadingChange,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const emphasis = deliverableProofEmphasis(deliverable.deliverable_type);

  async function handleFiles(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || !engagementId) return;

    setUploading(true);
    onUploadingChange?.(true);
    setUploadError(null);
    const added = [];
    const failures = [];

    for (const file of files) {
      try {
        const uploaded = await uploadProofScreenshot(engagementId, file);
        added.push(uploaded);
      } catch (err) {
        failures.push(`${file.name}: ${err.message ?? 'upload failed'}`);
      }
    }

    if (added.length) {
      setScreenshots((prev) => [...prev, ...added]);
    }
    if (failures.length) {
      setUploadError(failures.join(' · '));
    }
    setUploading(false);
    onUploadingChange?.(false);
  }

  return (
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
        <button
          type="button"
          className="btn-secondary text-2xs"
          disabled={uploading || !engagementId}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Upload screenshot'}
        </button>
        {uploadError && (
          <p className="mt-1.5 text-2xs text-health-red">{uploadError}</p>
        )}
        {screenshots.length > 0 && (
          <ul className="mt-2 space-y-1">
            {screenshots.map((shot) => (
              <li
                key={shot.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1 text-2xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {shot.url && (
                    <img
                      src={shot.url}
                      alt={shot.label}
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  )}
                  <span className="truncate">{shot.label}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-ink-tertiary hover:text-health-red"
                  disabled={uploading}
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
  );
}

/** Side drawer for logging a deliverable as posted with proof. */
export function LogDeliverableDrawer({ deliverable, open, onClose, onConfirm }) {
  const [contentLink, setContentLink] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [publishedDate, setPublishedDate] = useState(todayIso());
  const [uploading, setUploading] = useState(false);

  const engagementId = deliverable?.engagement_id ?? deliverable?.engagementId ?? null;

  useEffect(() => {
    if (!deliverable?.id || !open) return;
    setContentLink('');
    setScreenshots([]);
    setPublishedDate(todayIso());
  }, [open, deliverable?.id]);

  if (!deliverable) return null;

  const canSubmit = canMarkDeliverablePosted({ contentLink, screenshots });

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

  return (
    <Drawer
      open={open}
      title={deliverableDrawerTitle(deliverable)}
      onClose={resetAndClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={resetAndClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!canSubmit || uploading} onClick={handleConfirm}>
            {uploading ? 'Uploading…' : 'Mark posted'}
          </button>
        </div>
      }
    >
      <LogDeliverableForm
        deliverable={deliverable}
        engagementId={engagementId}
        contentLink={contentLink}
        setContentLink={setContentLink}
        screenshots={screenshots}
        setScreenshots={setScreenshots}
        publishedDate={publishedDate}
        setPublishedDate={setPublishedDate}
        onUploadingChange={setUploading}
      />
    </Drawer>
  );
}
