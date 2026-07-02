import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { HealthBadge } from '../components/ui/HealthBadge.jsx';
import { MetricTile } from '../components/campaign/CampaignMetricTiles.jsx';
import { DeliverableProofList } from '../components/deliverables/DeliverableProofList.jsx';
import { defaultReportCycleId, filterCyclesForReportSelector, formatCycleSelectorLabel } from '../lib/campaignCycles.js';
import { formatDate } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import {
  fetchCycleReport,
  fetchReportBrandCampaigns,
  fetchReportBrands,
  fetchReportCampaignCycles,
} from '../lib/persistence.js';

export function ReportsPage() {
  const [brands, setBrands] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [cyclesPayload, setCyclesPayload] = useState(null);
  const [report, setReport] = useState(null);

  const [brandId, setBrandId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [cycleId, setCycleId] = useState('');

  const [loadingNav, setLoadingNav] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId) ?? null,
    [campaigns, campaignId],
  );

  const cycles = cyclesPayload?.cycles ?? [];
  const currentCycleId = cyclesPayload?.current_cycle?.id ?? null;
  const selectableCycles = useMemo(
    () => filterCyclesForReportSelector(cycles),
    [cycles],
  );

  useEffect(() => {
    setLoadingNav(true);
    fetchReportBrands()
      .then((list) => {
        const items = Array.isArray(list) ? list : [];
        setBrands(items);
        if (items[0]?.id) setBrandId(items[0].id);
      })
      .catch((err) => setError(err.message ?? 'Could not load clients'))
      .finally(() => setLoadingNav(false));
  }, []);

  useEffect(() => {
    if (!brandId) {
      setCampaigns([]);
      setCampaignId('');
      return;
    }
    setLoadingNav(true);
    fetchReportBrandCampaigns(brandId)
      .then((list) => {
        const items = Array.isArray(list) ? list : [];
        setCampaigns(items);
        setCampaignId(items[0]?.id ?? '');
      })
      .catch((err) => {
        setCampaigns([]);
        setCampaignId('');
        setError(err.message ?? 'Could not load campaigns');
      })
      .finally(() => setLoadingNav(false));
  }, [brandId]);

  useEffect(() => {
    if (!campaignId) {
      setCyclesPayload(null);
      setCycleId('');
      return;
    }
    setLoadingNav(true);
    fetchReportCampaignCycles(campaignId)
      .then((payload) => {
        setCyclesPayload(payload);
        setCycleId(defaultReportCycleId(payload?.cycles, payload?.current_cycle));
      })
      .catch((err) => {
        setCyclesPayload(null);
        setCycleId('');
        setError(err.message ?? 'Could not load cycles');
      })
      .finally(() => setLoadingNav(false));
  }, [campaignId]);

  const loadReport = useCallback((id) => {
    if (!id) {
      setReport(null);
      return;
    }
    setLoadingReport(true);
    fetchCycleReport(id)
      .then((data) => {
        setReport(data);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err.message ?? 'Could not load report');
      })
      .finally(() => setLoadingReport(false));
  }, []);

  useEffect(() => {
    loadReport(cycleId);
  }, [cycleId, loadReport]);

  const hero = report?.hero;
  const stats = report?.stats;
  const heroHealth = hero?.cycle_health ?? 'not_set';
  const heroHasHealth = heroHealth !== 'not_set';
  const heroPct = hero?.achievement_pct != null ? Math.round(Number(hero.achievement_pct)) : null;

  if (loadingNav && !brands.length && !error) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center text-sm text-ink-secondary">
        Loading report…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={MODULES.reporting.pageTitle}
        subtitle={MODULES.reporting.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary opacity-60"
              disabled
              title="Coming soon"
            >
              Export PDF
            </button>
            <button
              type="button"
              className="btn-primary opacity-60"
              disabled
              title="Coming soon"
            >
              Shareable link
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-2xs text-amber-900">
        Client-facing reports exclude agreed fee, internal ratings, and internal notes.
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap gap-4">
          <DrillDownSelect
            label="Client"
            value={brandId}
            onChange={setBrandId}
            disabled={loadingNav}
            options={brands.map((b) => ({ value: b.id, label: b.brand_name }))}
          />
          <DrillDownSelect
            label="Campaign"
            value={campaignId}
            onChange={setCampaignId}
            disabled={loadingNav || !brandId}
            options={campaigns.map((c) => ({ value: c.id, label: c.campaign_name }))}
          />
          <DrillDownSelect
            label="Cycle"
            value={cycleId}
            onChange={setCycleId}
            disabled={loadingNav || !campaignId || !selectableCycles.length}
            options={selectableCycles.map((c) => ({
              value: c.id,
              label: formatCycleSelectorLabel(c, {
                campaignType: selectedCampaign?.campaign_type,
                termMonths: selectedCampaign?.term_months,
              }),
            }))}
            hint={
              currentCycleId && cycleId === currentCycleId ? 'Current cycle' : undefined
            }
          />
        </div>
      </Card>

      {loadingReport && !report && (
        <div className="py-8 text-center text-sm text-ink-secondary">Loading cycle report…</div>
      )}

      {report && (
        <>
          <section className="space-y-2">
            <div className="px-0.5">
              <h2 className="text-base font-semibold text-ink">{report.campaign.campaign_name}</h2>
              <p className="text-sm text-ink-secondary">
                {report.brand.brand_name}
                {' · '}
                {formatCycleSelectorLabel(report.cycle, {
                  campaignType: report.campaign.campaign_type,
                  termMonths: report.campaign.term_months,
                })}
              </p>
            </div>

            <div className="campaign-glass-tile flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">
                  Collaborations complete vs target
                </p>
                <p className="mt-1 tabular-nums text-3xl font-semibold leading-none text-ink">
                  {hero?.completed_collaborations ?? 0}
                  <span className="text-xl font-medium text-ink-tertiary"> / </span>
                  {hero?.target ?? '—'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {heroPct != null && (
                  <p className="tabular-nums text-lg font-medium text-ink">{heroPct}% achieved</p>
                )}
                {heroHasHealth && <HealthBadge health={heroHealth} variant="pill" />}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <MetricTile
              label="Collaborations complete (this cycle)"
              value={stats?.collaborations_complete ?? 0}
            />
            <MetricTile
              label="Deliverables awaited (this cycle)"
              value={stats?.deliverables_awaited ?? 0}
            />
            <MetricTile
              label="Successful visits completed (this cycle)"
              value={stats?.visits_completed ?? 0}
            />
          </div>

          <ReportSection title="Proof of delivery">
            {(report.collaborations ?? []).length === 0 ? (
              <p className="text-2xs text-ink-tertiary">
                No completed collaborations in this cycle.
              </p>
            ) : (
              <ul className="space-y-4">
                {report.collaborations.map((collab) => (
                  <li
                    key={collab.id}
                    className="rounded-lg border border-line bg-canvas px-4 py-3"
                  >
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{collab.contact_name}</p>
                      {collab.completed_at_ist && (
                        <p className="text-2xs text-ink-tertiary">
                          Completed {formatDate(collab.completed_at_ist)}
                        </p>
                      )}
                    </div>
                    <DeliverableProofList proofItems={collab.proof} />
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

          <ReportSection title="Campaign manager notes">
            <textarea
              className="input-field min-h-[96px] py-2 opacity-60"
              placeholder="Manager notes — coming soon"
              disabled
              readOnly
            />
          </ReportSection>
        </>
      )}

      {!loadingNav && !loadingReport && !report && !error && (
        <p className="py-8 text-center text-sm text-ink-secondary">
          Select a client, campaign, and cycle to view the report.
        </p>
      )}
    </div>
  );
}

function DrillDownSelect({ label, value, onChange, options, disabled, hint }) {
  return (
    <label className="min-w-[160px] flex-1 text-2xs text-ink-secondary">
      {label}
      <select
        className="input-field mt-1 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
      >
        {options.length === 0 ? (
          <option value="">None available</option>
        ) : (
          options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))
        )}
      </select>
      {hint && <span className="mt-0.5 block text-[10px] text-brand">{hint}</span>}
    </label>
  );
}

function ReportSection({ title, children }) {
  return (
    <Card className="!p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}
