import { Card } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { DemoFixturesPanel } from '../components/admin/DemoFixturesPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { canAccessAdmin } from '../lib/adminPermissions.js';
import { roleLabel } from '../lib/format.jsx';

/**
 * TEMPORARY stub — hosts DemoFixturesPanel only until data-flush.
 * Delete this route and page when demo fixtures are removed from the product.
 * Not part of Settings; Admin-gated direct URL only (/admin/fixtures).
 */
export function AdminFixturesPage() {
  const { user } = useAuth();

  if (!canAccessAdmin(user?.role)) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Demo fixtures" subtitle="Admin only" />
        <Card className="!p-6 text-center">
          <p className="text-sm text-ink-secondary">
            Admin access is required to load demo fixtures.
          </p>
          <p className="mt-2 text-2xs text-ink-tertiary">
            Your role: {roleLabel(user?.role)}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Demo fixtures"
        subtitle="Temporary admin stub — remove at data-flush"
      />
      <DemoFixturesPanel />
    </div>
  );
}
