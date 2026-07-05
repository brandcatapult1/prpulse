import { useRef, useState } from 'react';
import { ExpandableSection } from '../ui/DataKit.jsx';
import { deliverableTypeLabel } from '../../lib/deliverableTypes.js';
import { deliverableProofEmphasis } from '../../lib/deliverableLogging.js';
import { deliverableProofIntroMessage } from '../../lib/deliverableProofRules.js';
import { uploadProofScreenshot } from '../../lib/proofUpload.js';

/**
 * Inline proof capture for a deliverable — content link + screenshots (PRD Module 6).
 * Proof fields are draft-only until the parent commits all deliverables in one save.
 */
export function DeliverableProofSection({
  deliverable,
  editable,
  onUpdate,
  engagementId: engagementIdProp = null,
}) {
  const fileRef = useRef(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const engagementId =
    engagementIdProp
    ?? deliverable?.engagement_id
    ?? deliverable?.engagementId
    ?? null;

  const screenshots = deliverable.screenshots ?? [];
  const contentLink = deliverable.content_link ?? '';
  const emphasis = deliverableProofEmphasis(deliverable.deliverable_type);
  const introMessage = deliverableProofIntroMessage(deliverable.deliverable_type);

  async function handleFiles(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || !engagementId) return;

    setUploading(true);
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
      onUpdate({ screenshots: [...screenshots, ...added] });
    }
    if (failures.length) {
      setUploadError(failures.join(' · '));
    }
    setUploading(false);
  }

  function addImageUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    onUpdate({
      screenshots: [
        ...screenshots,
        { id: `s-${Date.now()}`, label: 'Image link', url },
      ],
    });
    setUrlDraft('');
  }

  function removeScreenshot(screenshotId) {
    onUpdate({ screenshots: screenshots.filter((s) => s.id !== screenshotId) });
  }

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <p className="text-2xs text-ink-tertiary">{introMessage}</p>

      <div>
        <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">
          {emphasis.linkLabel}
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
          <input
            type="url"
            className="input-field w-full"
            placeholder="https://instagram.com/p/…"
            value={contentLink}
            onChange={(e) => onUpdate({ content_link: e.target.value || null })}
          />
        )}
        {!contentLink && !editable && (
          <p className="text-2xs text-ink-tertiary">No link attached</p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span
            className={`text-2xs ${
              emphasis.screenshotPrimary ? 'font-medium text-ink-secondary' : 'font-medium text-ink-secondary'
            }`}
          >
            {emphasis.screenshotLabel}
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
                <span className="flex min-w-0 items-center gap-2 text-ink">
                  {shot.url && (
                    <a href={shot.url} target="_blank" rel="noreferrer" className="shrink-0">
                      <img
                        src={shot.url}
                        alt={shot.label}
                        className="h-9 w-9 rounded object-cover"
                      />
                    </a>
                  )}
                  {shot.url ? (
                    <a href={shot.url} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">
                      {shot.label}
                    </a>
                  ) : (
                    <span className="truncate">📎 {shot.label}</span>
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
              disabled={uploading || !engagementId}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Upload screenshot'}
            </button>
            {uploadError && (
              <p className="text-2xs text-health-red">{uploadError}</p>
            )}
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
  canRemove = false,
  deliverableStatusOptions,
  onStatusChange,
  onUpdate,
  onRemove,
  engagementId = null,
  compact = false,
}) {
  const showProof = canEditProof || deliverable.content_link || (deliverable.screenshots?.length ?? 0) > 0;

  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-ink">
            {deliverableTypeLabel(deliverable.deliverable_type)} ×{deliverable.quantity}
          </span>
          {deliverable.due_date && (
            <span className="ml-2 text-2xs text-ink-tertiary">
              Due {formatDateShort(deliverable.due_date)}
            </span>
          )}
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
          {canRemove && (
            <button
              type="button"
              className="rounded-md px-1.5 py-1 text-2xs font-medium text-ink-tertiary hover:bg-red-50 hover:text-health-red"
              aria-label={`Remove ${deliverableTypeLabel(deliverable.deliverable_type)}`}
              onClick={() => onRemove?.(deliverable.id)}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {showProof && (
        <DeliverableProofSection
          deliverable={deliverable}
          editable={canEditProof}
          engagementId={engagementId}
          onUpdate={(patch) => onUpdate?.(deliverable.id, patch)}
        />
      )}
    </div>
  );
}

function formatDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
