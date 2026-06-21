import { orgBrandingApi } from './api.js';
import { getOrgSettingsOverride, saveOrgSettingsOverride } from './demoStore.js';

/** Bundled transparent wordmark for the light sidebar. */
export const DEFAULT_DEMO_ORG_LOGO = '/branding/brand-catapult-wordmark.svg';

/** Legacy PNG is mostly black padding; map to the wordmark instead. */
export const LEGACY_ORG_LOGO = '/branding/brand-catapult-logo.png';

/** Stored when an admin explicitly clears the logo (wordmark-only sidebar). */
export const LOGO_CLEARED = '__cleared__';

export const ORG_LOGO_CHANGED = 'prpulse-org-logo-changed';

const MAX_LOGO_BYTES = 512 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function notifyOrgLogoChanged() {
  window.dispatchEvent(new Event(ORG_LOGO_CHANGED));
}

export function normalizeOrgLogoUrl(url) {
  if (!url || url === LOGO_CLEARED) return null;
  if (url === LEGACY_ORG_LOGO) return DEFAULT_DEMO_ORG_LOGO;
  return url;
}

export function persistOrgLogoOverride(logoUrl) {
  saveOrgSettingsOverride({
    logoUrl: logoUrl === null ? LOGO_CLEARED : logoUrl,
  });
  notifyOrgLogoChanged();
}

export async function loadOrgLogoUrl() {
  const override = getOrgSettingsOverride();
  if (override && Object.prototype.hasOwnProperty.call(override, 'logoUrl')) {
    if (override.logoUrl === LOGO_CLEARED) return null;
    return normalizeOrgLogoUrl(override.logoUrl) ?? DEFAULT_DEMO_ORG_LOGO;
  }

  try {
    const data = await orgBrandingApi.get();
    if (data?.logo_url === LOGO_CLEARED) return null;
    if (data?.logo_url) return normalizeOrgLogoUrl(data.logo_url);
    return DEFAULT_DEMO_ORG_LOGO;
  } catch {
    return DEFAULT_DEMO_ORG_LOGO;
  }
}

export async function saveOrgLogoUrl(logoUrl) {
  const apiValue = logoUrl === null ? LOGO_CLEARED : logoUrl;
  persistOrgLogoOverride(logoUrl);

  try {
    await orgBrandingApi.update({ logo_url: apiValue });
    return { ok: true, persisted: true };
  } catch (err) {
    return {
      ok: true,
      persisted: false,
      warning: err.message ?? 'Saved for this browser session only — set DATABASE_URL and run migration 004 on the server to persist for everyone.',
    };
  }
}

export async function applyDefaultOrgLogo() {
  return saveOrgLogoUrl(DEFAULT_DEMO_ORG_LOGO);
}

export function validateLogoFile(file) {
  if (!file) return 'Choose an image file';
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Use PNG, JPEG, WebP, or SVG';
  }
  if (file.size > MAX_LOGO_BYTES) return 'Logo must be under 512 KB';
  return null;
}

export function readLogoFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
