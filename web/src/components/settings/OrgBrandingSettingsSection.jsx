import { OrgBrandingSettings } from '../admin/OrgBrandingSettings.jsx';

/** Org branding — relocated from AdminPage settings tab; component unchanged. */
export function OrgBrandingSettingsSection() {
  return (
    <>
      <p className="mb-4 text-2xs text-ink-secondary">
        Organization branding shown in the sidebar and across the app.
      </p>
      <OrgBrandingSettings />
    </>
  );
}
