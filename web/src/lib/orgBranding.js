import { orgBrandingApi } from './api.js';
import { getOrgSettingsOverride, saveOrgSettingsOverride } from './demoStore.js';

/** Bundled demo default — replace via Admin → Settings upload in production. */
export const DEFAULT_DEMO_ORG_LOGO = '/branding/brand-catapult-logo.png';

export const ORG_LOGO_CHANGED = 'prpulse-org-logo-changed';

const MAX_LOGO_BYTES = 512 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function notifyOrgLogoChanged() {
  window.dispatchEvent(new Event(ORG_LOGO_CHANGED));
}

/** Resolve logo for display: session override → API value → demo default → none. */
export function resolveOrgLogoUrl({ override, apiLogo, demoMode }) {
  if (override && Object.prototype.hasOwnProperty.call(override, 'logoUrl')) {
    return override.logoUrl || null;
  }
  if (apiLogo) return apiLogo;
  if (demoMode) return DEFAULT_DEMO_ORG_LOGO;
  return null;
}

export function readOrgLogoOverride() {
  return getOrgSettingsOverride()?.logoUrl ?? undefined;
}

export function persistOrgLogoOverride(logoUrl) {
  saveOrgSettingsOverride({ logoUrl: logoUrl ?? null });
  notifyOrgLogoChanged();
}

export async function loadOrgLogoUrl({ demoMode = true } = {}) {
  const override = getOrgSettingsOverride();
  if (override && Object.prototype.hasOwnProperty.call(override, 'logoUrl')) {
    return override.logoUrl || null;
  }

  try {
    const data = await orgBrandingApi.get();
    return data?.logo_url ?? null;
  } catch {
    if (demoMode) return DEFAULT_DEMO_ORG_LOGO;
    return null;
  }
}

export async function saveOrgLogoUrl(logoUrl) {
  persistOrgLogoOverride(logoUrl);
  try {
    await orgBrandingApi.update({ logo_url: logoUrl });
  } catch {
    /* demo session override is enough */
  }
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
