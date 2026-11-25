import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { dashboardApi } from '../lib/api.js';
import { AuroraBackground, ManagerDashboardView } from '../components/dashboard/ManagerDashboardView.jsx';

function firstNameFrom(fullName) {
  return fullName?.split(/\s+/)[0] ?? 'there';
}

function DashboardScopeTabs({ activeId, reports, onSelect }) {
  return (
    <div className="rounded-[22px] border border-white bg-white/[0.95] p-2 shadow-[0_16px_48px_rgba(26,29,38,0.11),0_6px_16px_rgba(26,29,38,0.07),0_0_0_1px_rgba(255,255,255,0.8)_inset] backdrop-blur-xl">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Team dashboards">
        <ScopeTab
          active={activeId === 'self'}
          onClick={() => onSelect('self')}
          label="My dashboard"
        />
        {reports.map((report) => (
          <ScopeTab
            key={report.id}
            active={activeId === report.id}
            onClick={() => onSelect(report.id)}
            label={report.full_name}
          />
        ))}
      </div>
    </div>
  );
}

function ScopeTab({ active, onClick, label }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-2xs font-medium transition-colors ${
        active
          ? 'border-brand/30 bg-brand-soft text-brand'
          : 'border-line bg-white/90 text-ink-secondary hover:border-zinc-300 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [directReports, setDirectReports] = useState(null);
  const [activeScopeId, setActiveScopeId] = useState('self');

  useEffect(() => {
    if (!user?.id) return;
    dashboardApi
      .directReports()
      .then((rows) => setDirectReports(Array.isArray(rows) ? rows : []))
      .catch(() => setDirectReports([]));
  }, [user?.id]);

  const reportsLoading =
    directReports === null
    && (user?.role === 'senior_manager' || user?.role === 'admin');

  const isAdminUser = user?.role === 'admin';
  const hasReportTabs = (directReports?.length ?? 0) > 0 || isAdminUser;

  const scopeUserId = useMemo(() => {
    if (!hasReportTabs) return user?.role === 'senior_manager' ? user.id : undefined;
    if (activeScopeId === 'self') return user?.id;
    return activeScopeId;
  }, [activeScopeId, hasReportTabs, user?.id]);

  const displayFirstName = useMemo(() => {
    if (!hasReportTabs || activeScopeId === 'self') {
      return firstNameFrom(user?.full_name);
    }
    const report = directReports?.find((r) => r.id === activeScopeId);
    return firstNameFrom(report?.full_name);
  }, [activeScopeId, directReports, hasReportTabs, user?.full_name]);

  return (
    <div className="relative -m-4 min-h-[calc(100vh-3rem)] overflow-hidden md:-m-5">
      <AuroraBackground />

      <div className="relative mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 md:px-5 md:py-6">
        {reportsLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-ink-secondary">Loading dashboard…</p>
          </div>
        ) : (
          <>
            {hasReportTabs && directReports && (
              <DashboardScopeTabs
                activeId={activeScopeId}
                reports={directReports}
                onSelect={setActiveScopeId}
              />
            )}

            {isAdminUser && activeScopeId === 'self' ? (
              <div className="rounded-2xl border border-line bg-white/90 px-6 py-12 text-center">
                <p className="text-sm font-medium text-ink">Nothing to show here</p>
                <p className="mt-1 text-2xs text-ink-secondary">
                  Admins have no personal campaign work. Pick a team member above to see their dashboard.
                </p>
              </div>
            ) : (
              <ManagerDashboardView
                key={scopeUserId ?? 'legacy'}
                scopeUserId={scopeUserId}
                displayFirstName={displayFirstName}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
