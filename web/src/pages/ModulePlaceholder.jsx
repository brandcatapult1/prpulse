import { MODULES } from '../lib/modules.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';

export function ModulePlaceholder({ moduleKey }) {
  const mod = MODULES[moduleKey];
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={mod.pageTitle} subtitle={mod.subtitle} />
      <div className="panel mt-4 px-6 py-10 text-center">
        <p className="text-2xs text-ink-tertiary">
          PRD Module {mod.prd} — coming soon
        </p>
      </div>
    </div>
  );
}
