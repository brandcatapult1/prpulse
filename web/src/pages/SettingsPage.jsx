import { Navigate, NavLink, useParams } from 'react-router-dom';
import { Card } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { TagsSettingsSection } from '../components/settings/TagsSettingsSection.jsx';
import { UsersSettingsSection } from '../components/settings/UsersSettingsSection.jsx';
import { AuditSettingsSection } from '../components/settings/AuditSettingsSection.jsx';
import { OrgBrandingSettingsSection } from '../components/settings/OrgBrandingSettingsSection.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { roleLabel } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import {
  canAccessSettings,
  canAccessSettingsSection,
  getSettingsSection,
  sectionsForRole,
} from '../lib/settingsRegistry.js';

/** Map registry keys to section components — keep registry free of React imports. */
const SECTION_COMPONENTS = {
  tags: TagsSettingsSection,
  users: UsersSettingsSection,
  audit: AuditSettingsSection,
  branding: OrgBrandingSettingsSection,
};

export function SettingsPage() {
  const { user } = useAuth();
  const { sectionKey } = useParams();
  const role = user?.role;
  const permitted = sectionsForRole(role);

  if (!canAccessSettings(role)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title={MODULES.settings.pageTitle} subtitle={MODULES.settings.subtitle} />
        <Card className="!p-6 text-center">
          <p className="text-sm text-ink-secondary">
            You do not have access to Settings.
          </p>
          <p className="mt-2 text-2xs text-ink-tertiary">
            Your role: {roleLabel(role)}
          </p>
        </Card>
      </div>
    );
  }

  if (!sectionKey) {
    return <Navigate to={`/settings/${permitted[0].path}`} replace />;
  }

  const section = getSettingsSection(sectionKey);
  const allowed = canAccessSettingsSection(role, sectionKey);
  const SectionComponent = section ? SECTION_COMPONENTS[section.key] : null;

  if (!section || !allowed || !SectionComponent) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title={MODULES.settings.pageTitle} subtitle={MODULES.settings.subtitle} />
        <Card className="!p-6 text-center">
          <p className="text-sm text-ink-secondary">
            You are not authorized to view this settings section.
          </p>
          <p className="mt-2 text-2xs text-ink-tertiary">
            Your role: {roleLabel(role)}
          </p>
          {permitted[0] && (
            <NavLink
              to={`/settings/${permitted[0].path}`}
              className="btn-secondary mt-4 inline-flex"
            >
              Go to {permitted[0].label}
            </NavLink>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={MODULES.settings.pageTitle} subtitle={MODULES.settings.subtitle} />

      <div className="flex flex-wrap gap-2">
        {permitted.map((s) => (
          <NavLink
            key={s.key}
            to={`/settings/${s.path}`}
            className={({ isActive }) =>
              `rounded-md border px-3 py-1.5 text-2xs font-medium transition-colors ${
                isActive
                  ? 'border-brand/30 bg-brand-soft text-brand'
                  : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
              }`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-ink">{section.label}</h2>
        <SectionComponent />
      </div>
    </div>
  );
}
