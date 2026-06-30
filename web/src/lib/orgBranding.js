import { orgBrandingApi, registrationsApi } from './api.js';

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

export async function loadPublicOrgLogoUrl() {
  try {
    const data = await registrationsApi.branding();
    if (data?.logo_url === LOGO_CLEARED || !data?.logo_url) return null;
    return normalizeOrgLogoUrl(data.logo_url);
  } catch {
    return null;
  }
}

export async function loadOrgLogoUrl() {
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
  await orgBrandingApi.update({ logo_url: apiValue });
  notifyOrgLogoChanged();
  return { ok: true, persisted: true };
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
