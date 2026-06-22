import { useEffect, useRef, useState } from 'react';
import { Card, Toast } from '../ui/Primitives.jsx';
import {
  applyDefaultOrgLogo,
  DEFAULT_DEMO_ORG_LOGO,
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
    loadOrgLogoUrl().then(setLogoUrl).finally(() => setLoading(false));
  }, []);

  async function handleSaveResult(result, nextUrl, successMessage) {
    setLogoUrl(nextUrl);
    if (result.warning) {
      setToast(`${successMessage} — ${result.warning}`);
      return;
    }
    setToast(successMessage);
  }

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
      const result = await saveOrgLogoUrl(dataUrl);
      await handleSaveResult(result, dataUrl, 'Logo updated');
    } catch (err) {
      setToast(err.message ?? 'Could not save logo');
    } finally {
      setSaving(false);
    }
  }

  async function handleUseDefault() {
    setSaving(true);
    try {
      const result = await applyDefaultOrgLogo();
      await handleSaveResult(result, DEFAULT_DEMO_ORG_LOGO, 'Default wordmark applied');
    } catch (err) {
      setToast(err.message ?? 'Could not apply default logo');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      const result = await saveOrgLogoUrl(null);
      await handleSaveResult(result, null, 'Logo removed — sidebar shows PR Pulse only');
    } catch (err) {
      setToast(err.message ?? 'Could not remove logo');
    } finally {
      setSaving(false);
    }
  }

  const usingDefault = logoUrl === DEFAULT_DEMO_ORG_LOGO;

  return (
    <>
      <Card elevated className="!p-5">
        <h2 className="text-sm font-semibold text-ink">Agency logo</h2>
        <p className="mt-1 text-2xs text-ink-secondary">
          Shown at the top of the sidebar above PR Pulse. Use a transparent PNG or SVG — solid backgrounds look like a pasted box on the white sidebar.
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
              <span className="text-2xs text-ink-tertiary">PR Pulse wordmark only</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => inputRef.current?.click()}
            >
              Upload logo
            </button>
            {!usingDefault && (
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={handleUseDefault}
              >
                Use default wordmark
              </button>
            )}
            {logoUrl && (
              <button
                type="button"
                className="btn-ghost text-health-red"
                disabled={saving}
                onClick={handleRemove}
              >
                Remove logo
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
