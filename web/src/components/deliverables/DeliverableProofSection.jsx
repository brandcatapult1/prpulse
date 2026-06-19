import { useEffect, useRef, useState } from 'react';
import { ExpandableSection } from '../ui/DataKit.jsx';

/**
 * Inline proof capture for a deliverable — content link + screenshots (PRD Module 6).
 */
export function DeliverableProofSection({ deliverable, editable, onUpdate, onSaved }) {
  const fileRef = useRef(null);
  const [linkDraft, setLinkDraft] = useState(deliverable.content_link ?? '');
  const [urlDraft, setUrlDraft] = useState('');

  const screenshots = deliverable.screenshots ?? [];
  const contentLink = deliverable.content_link ?? '';

  useEffect(() => {
    setLinkDraft(contentLink);
  }, [deliverable.id, contentLink]);

  const notify = () => onSaved?.();

  const saveLink = () => {
    const next = linkDraft.trim() || null;
    onUpdate({ content_link: next });
    notify();
  };

  const handleFiles = (event) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const added = files.map((file) => ({
      id: `s-${Date.now()}-${file.name}`,
      label: file.name,
    }));
    onUpdate({ screenshots: [...screenshots, ...added] });
    event.target.value = '';
    notify();
  };

  const addImageUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    onUpdate({
      screenshots: [
        ...screenshots,
        { id: `s-${Date.now()}`, label: 'Image link', url },
      ],
    });
    setUrlDraft('');
    notify();
  };

  const removeScreenshot = (screenshotId) => {
    onUpdate({ screenshots: screenshots.filter((s) => s.id !== screenshotId) });
    notify();
  };

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <p className="text-2xs text-ink-tertiary">
        Attach proof so the team can mark this deliverable Posted and close the loop.
      </p>

      <div>
        <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">
          Content link
        </label>
        {contentLink && !editable && (
          <a
            href={contentLink}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-brand hover:underline"
          >
            {contentLink}
          </a>
        )}
        {editable && (
          <div className="flex flex-wrap gap-2">
            <input
              type="url"
              className="input-field min-w-0 flex-1"
              placeholder="https://instagram.com/p/…"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
            />
            <button type="button" className="btn-primary shrink-0" onClick={saveLink}>
              Save link
            </button>
          </div>
        )}
        {!contentLink && !editable && (
          <p className="text-2xs text-ink-tertiary">No link attached</p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-2xs font-medium text-ink-secondary">
            Screenshots
            {deliverable.quantity > 1 && deliverable.deliverable_type === 'story' && (
              <span className="font-normal text-ink-tertiary">
                {' '}· {screenshots.length} of {deliverable.quantity} for this story set
              </span>
            )}
          </span>
          {screenshots.length > 0 && (
            <span className="text-2xs text-ink-tertiary">{screenshots.length} attached</span>
          )}
        </div>

        {screenshots.length > 0 && (
          <ul className="mb-2 space-y-1">
            {screenshots.map((shot) => (
              <li
                key={shot.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-white px-2.5 py-1.5 text-2xs"
              >
                <span className="min-w-0 truncate text-ink">
                  {shot.url ? (
                    <a href={shot.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {shot.label}
                    </a>
                  ) : (
                    <>📎 {shot.label}</>
                  )}
                </span>
                {editable && (
                  <button
                    type="button"
                    className="shrink-0 text-ink-tertiary hover:text-ink"
                    onClick={() => removeScreenshot(shot.id)}
                    aria-label="Remove screenshot"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
            <button
              type="button"
              className="btn-secondary w-full justify-center"
              onClick={() => fileRef.current?.click()}
            >
              Upload screenshots
            </button>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                className="input-field min-w-0 flex-1"
                placeholder="Or paste image / post URL"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={addImageUrl}>
                Add
              </button>
            </div>
          </div>
        )}

        {!editable && screenshots.length === 0 && (
          <p className="text-2xs text-ink-tertiary">No screenshots attached</p>
        )}
      </div>

      {(editable || deliverable.brief_compliance != null || deliverable.brand_tag_verified != null || deliverable.internal_rating) && (
        <ExpandableSection title="Compliance & internal rating">
          <div className="space-y-3">
            <ToggleField
              label="Brief compliance"
              value={deliverable.brief_compliance}
              editable={editable}
              onChange={(v) => onUpdate({ brief_compliance: v })}
            />
            <ToggleField
              label="Brand tag verified"
              value={deliverable.brand_tag_verified}
              editable={editable}
              onChange={(v) => onUpdate({ brand_tag_verified: v })}
            />
            <StarRatingField
              label="Internal rating"
              value={deliverable.internal_rating ?? 0}
              editable={editable}
              onChange={(v) => onUpdate({ internal_rating: v || null })}
            />
          </div>
        </ExpandableSection>
      )}
    </div>
  );
}

function ToggleField({ label, value, editable, onChange }) {
  if (!editable && value == null) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-2xs text-ink-secondary">{label}</span>
      {editable ? (
        <div className="flex gap-1">
          {[true, false].map((opt) => (
            <button
              key={String(opt)}
              type="button"
              onClick={() => onChange(opt)}
              className={`rounded-md border px-2.5 py-1 text-2xs font-medium ${
                value === opt
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line bg-white text-ink-secondary'
              }`}
            >
              {opt ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-2xs font-medium text-ink">{value ? 'Yes' : 'No'}</span>
      )}
    </div>
  );
}

function StarRatingField({ label, value, editable, onChange }) {
  if (!editable && !value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-2xs text-ink-secondary">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!editable}
            onClick={() => onChange(star)}
            className={`text-sm ${star <= value ? 'text-health-amber' : 'text-line'} ${editable ? 'hover:text-health-amber' : ''}`}
            aria-label={`${star} star`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export function DeliverableRow({
  deliverable,
  canEditStatus,
  canEditProof,
  deliverableStatusOptions,
  onStatusChange,
  onUpdate,
  onSaved,
  compact = false,
}) {
  const showProof = canEditProof || deliverable.content_link || (deliverable.screenshots?.length ?? 0) > 0;

  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-sm font-medium capitalize text-ink">
            {deliverable.deliverable_type} ×{deliverable.quantity}
          </span>
          <span className="ml-2 text-2xs text-ink-tertiary">
            Due {formatDateShort(deliverable.due_date)}
          </span>
          {!compact && deliverable.content_link && (
            <p className="mt-1 truncate text-2xs text-brand">{deliverable.content_link}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deliverable.is_overdue && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-2xs font-medium text-red-700">
              Overdue
            </span>
          )}
          {canEditStatus ? (
            <select
              className="input-field h-8 max-w-[140px] capitalize"
              value={deliverable.status}
              onChange={(e) => onStatusChange?.(deliverable.id, e.target.value)}
            >
              {deliverableStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-2xs font-medium capitalize text-ink-secondary">
              {deliverable.status}
            </span>
          )}
        </div>
      </div>

      {showProof && (
        <DeliverableProofSection
          deliverable={deliverable}
          editable={canEditProof}
          onUpdate={(patch) => onUpdate?.(deliverable.id, patch)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function formatDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
