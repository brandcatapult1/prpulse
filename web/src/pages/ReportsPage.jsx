import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { campaignsApi } from '../lib/api.js';
import { fetchCampaignReport, fetchReportPeriods } from '../lib/persistence.js';

export function ReportsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [period, setPeriod] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([campaignsApi.list(), fetchReportPeriods()])
      .then(([camps, p]) => {
        const list = Array.isArray(camps) ? camps : [];
        setCampaigns(list);
        setPeriods(Array.isArray(p) && p.length ? p : [new Date().toISOString().slice(0, 7)]);
        if (list[0]?.id) setCampaignId(list[0].id);
        if (p?.[0]) setPeriod(p[0]);
      })
      .catch((err) => setError(err.message ?? 'Could not load report options'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!campaignId || !period) return;
    setLoading(true);
    fetchCampaignReport(campaignId, period)
      .then(setReport)
      .catch((err) => {
        setReport(null);
        setError(err.message ?? 'Could not load report');
      })
      .finally(() => setLoading(false));
  }, [campaignId, period]);

  const periodLabel = useMemo(
    () => report?.period ?? period,
    [report?.period, period],
  );

  if (loading && !report && !error) {
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
            <button type="button" className="btn-secondary" disabled title="Coming in a future release">
              Export PDF
            </button>
            <button type="button" className="btn-primary" disabled title="Coming in a future release">
              Shareable link
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-2xs text-red-800">{error}</div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-2xs text-amber-900">
        Client-facing reports exclude agreed fee, internal ratings, and internal notes.
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap gap-3">
          <label className="text-2xs text-ink-secondary">
            Campaign
            <select
              className="input-field ml-2 mt-1 min-w-[180px]"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.campaign_name}</option>
              ))}
            </select>
          </label>
          <label className="text-2xs text-ink-secondary">
            Period
            <select
              className="input-field ml-2 mt-1 min-w-[140px]"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {report && (
        <>
          <ReportSection title="Campaign Summary">
            <dl className="grid gap-3 sm:grid-cols-3 text-sm">
              <div><dt className="text-2xs text-ink-tertiary">Campaign</dt><dd className="font-medium text-ink">{report.campaign.campaign_name}</dd></div>
              <div><dt className="text-2xs text-ink-tertiary">Brand</dt><dd className="font-medium text-ink">{report.campaign.brand_name}</dd></div>
              <div><dt className="text-2xs text-ink-tertiary">Period</dt><dd className="font-medium text-ink">{periodLabel}</dd></div>
            </dl>
          </ReportSection>

          <ReportSection title="Performance Summary">
            <dl className="grid gap-3 sm:grid-cols-3 text-sm">
              <div><dt className="text-2xs text-ink-tertiary">Target</dt><dd className="font-medium text-ink">{report.campaign.target_collaborations ?? 'Not set'}</dd></div>
              <div><dt className="text-2xs text-ink-tertiary">Completed</dt><dd className="font-medium text-ink">{report.completedCount}</dd></div>
              <div><dt className="text-2xs text-ink-tertiary">Achievement</dt><dd className="font-medium text-ink">{report.achievementPct != null ? `${report.achievementPct}%` : '—'}</dd></div>
            </dl>
          </ReportSection>

          <ReportSection title="Deliverable Breakdown">
            {Object.keys(report.byType).length === 0 ? (
              <p className="text-2xs text-ink-tertiary">No posted deliverables in this period.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(report.byType).map(([type, count]) => (
                  <li key={type} className="flex items-center justify-between rounded-md border border-line bg-canvas px-3 py-2 text-sm">
                    <span className="capitalize text-ink">{type.replace(/_/g, ' ')}</span>
                    <Pill tone="info">{count} posted</Pill>
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

          <ReportSection title="Content Gallery">
            {report.gallery.length === 0 ? (
              <p className="text-2xs text-ink-tertiary">No posted content with links or screenshots in this period.</p>
            ) : (
              <ul className="space-y-2">
                {report.gallery.map((item) => (
                  <li key={item.id} className="rounded-md border border-line bg-canvas px-3 py-2 text-2xs">
                    <div className="font-medium text-ink">{item.contact_name} · {item.deliverable_type} ×{item.quantity}</div>
                    {item.content_link && (
                      <a href={item.content_link} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {item.content_link}
                      </a>
                    )}
                    {item.screenshot_count > 0 && (
                      <span className="ml-2 text-ink-tertiary">📎 {item.screenshot_count} screenshot(s)</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

          <ReportSection title="Influencer Summary">
            {report.influencers.length === 0 ? (
              <p className="text-2xs text-ink-tertiary">No completed collaborations in this period.</p>
            ) : (
              <ul className="divide-y divide-line">
                {report.influencers.map((inf) => (
                  <li key={inf.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="font-medium text-ink">{inf.contact_name}</span>
                    <span className="text-2xs text-ink-tertiary">{inf.deliverables} deliverable(s) posted</span>
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

          <ReportSection title="Campaign Manager Notes">
            <textarea
              className="input-field min-h-[96px] py-2 opacity-60"
              placeholder="Manager notes — coming in a future release"
              disabled
              readOnly
            />
          </ReportSection>
        </>
      )}
    </div>
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
