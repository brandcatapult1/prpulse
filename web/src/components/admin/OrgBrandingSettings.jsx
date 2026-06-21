import { useEffect, useRef, useState } from 'react';
import { Card, Toast } from '../ui/Primitives.jsx';
import {
  loadOrgLogoUrl,
  readLogoFileAsDataUrl,
  saveOrgLogoUrl,
  validateLogoFile,
} from '../../lib/orgBranding.js';

export function OrgBrandingSettings() {
  const inputRef = useRef(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadOrgLogoUrl({ demoMode: true })
      .then(setLogoUrl)
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const error = validateLogoFile(file);
    if (error) {
      setToast(error);
      return;
    }

    setSaving(true);
    try {
      const dataUrl = await readLogoFileAsDataUrl(file);
      await saveOrgLogoUrl(dataUrl);
      setLogoUrl(dataUrl);
      setToast('Logo updated');
    } catch {
      setToast('Could not save logo');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await saveOrgLogoUrl(null);
      setLogoUrl(null);
      setToast('Logo removed');
    } catch {
      setToast('Could not remove logo');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card elevated className="!p-5">
        <h2 className="text-sm font-semibold text-ink">Agency logo</h2>
        <p className="mt-1 text-2xs text-ink-secondary">
          Shown at the top of the sidebar above PR Pulse. PNG or SVG on a transparent background works best.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex h-16 min-w-[120px] items-center rounded-lg border border-line bg-canvas px-4">
            {loading ? (
              <span className="text-2xs text-ink-tertiary">Loading…</span>
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="max-h-10 max-w-[140px] object-contain object-left"
              />
            ) : (
              <span className="text-2xs text-ink-tertiary">No logo set</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => inputRef.current?.click()}
            >
              {logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            {logoUrl && (
              <button
                type="button"
                className="btn-ghost text-health-red"
                disabled={saving}
                onClick={handleRemove}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
      </Card>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
