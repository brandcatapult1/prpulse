import { useMemo, useState } from 'react';
import { Card } from '../components/ui/Primitives.jsx';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Pill } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import {
  MOCK_CAMPAIGNS,
  MOCK_DELIVERABLES_BY_ENGAGEMENT,
  MOCK_ENGAGEMENTS_BY_ID,
} from '../data/mock.js';

const PERIODS = [
  { value: '2026-06', label: 'Jun 2026' },
  { value: '2026-05', label: 'May 2026' },
];

export function ReportsPage() {
  const [campaignId, setCampaignId] = useState('c1');
  const [period, setPeriod] = useState('2026-06');
  const [managerNotes] = useState('');

  const campaign = MOCK_CAMPAIGNS.find((c) => c.id === campaignId) ?? MOCK_CAMPAIGNS[0];
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;

  const report = useMemo(() => buildReport(campaignId, period), [campaignId, period]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={MODULES.reporting.pageTitle}
        subtitle={MODULES.reporting.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled title="Coming soon">
              Export PDF
            </button>
            <button type="button" className="btn-primary" disabled title="Coming soon">
              Shareable link
            </button>
          </div>
        }
      />

      <DemoBanner show />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-2xs text-amber-900">
        Client-facing reports exclude agreed fee, internal ratings, and internal notes.
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap gap-3">
          <label className="text-2xs text-ink-secondary">
            Campaign
            <select className="input-field ml-2 mt-1 min-w-[180px]" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {MOCK_CAMPAIGNS.map((c) => (
                <option key={c.id} value={c.id}>{c.campaign_name}</option>
              ))}
            </select>
          </label>
          <label className="text-2xs text-ink-secondary">
            Period
            <select className="input-field ml-2 mt-1 min-w-[140px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <ReportSection title="Campaign Summary">
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div><dt className="text-2xs text-ink-tertiary">Campaign</dt><dd className="font-medium text-ink">{campaign.campaign_name}</dd></div>
          <div><dt className="text-2xs text-ink-tertiary">Brand</dt><dd className="font-medium text-ink">{campaign.brand_name}</dd></div>
          <div><dt className="text-2xs text-ink-tertiary">Period</dt><dd className="font-medium text-ink">{periodLabel}</dd></div>
        </dl>
      </ReportSection>

      <ReportSection title="Performance Summary">
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div><dt className="text-2xs text-ink-tertiary">Target</dt><dd className="font-medium text-ink">{campaign.target_collaborations ?? 'Not set'}</dd></div>
          <div><dt className="text-2xs text-ink-tertiary">Completed</dt><dd className="font-medium text-ink">{report.completedCount}</dd></div>
          <div><dt className="text-2xs text-ink-tertiary">Achievement</dt><dd className="font-medium text-ink">{report.achievementPct != null ? `${report.achievementPct}%` : '—'}</dd></div>
        </dl>
      </ReportSection>

      <ReportSection title="Deliverable Breakdown">
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(report.byType).map(([type, count]) => (
            <li key={type} className="flex items-center justify-between rounded-md border border-line bg-canvas px-3 py-2 text-sm">
              <span className="capitalize text-ink">{type}</span>
              <Pill tone="info">{count} posted</Pill>
            </li>
          ))}
        </ul>
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
                {item.screenshots?.length > 0 && (
                  <span className="ml-2 text-ink-tertiary">📎 {item.screenshots.length} screenshot(s)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title="Influencer Summary">
        <ul className="divide-y divide-line">
          {report.influencers.map((inf) => (
            <li key={inf.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium text-ink">{inf.contact_name}</span>
              <span className="text-2xs text-ink-tertiary">{inf.deliverables} deliverable(s) posted</span>
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="Campaign Manager Notes">
        <textarea
          className="input-field min-h-[96px] py-2 opacity-60"
          placeholder="Manager notes — coming soon"
          value={managerNotes}
          disabled
          readOnly
        />
      </ReportSection>

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

function buildReport(campaignId, period) {
  const engagements = Object.values(MOCK_ENGAGEMENTS_BY_ID).filter(
    (e) => e.campaign_id === campaignId && e.conversation_status === 'collaboration_complete',
  );

  const completedCount = engagements.length;
  const campaign = MOCK_CAMPAIGNS.find((c) => c.id === campaignId);
  const achievementPct = campaign?.target_collaborations
    ? Math.round((completedCount / campaign.target_collaborations) * 100)
    : null;

  const byType = {};
  const gallery = [];
  const influencerMap = {};

  for (const eng of engagements) {
    const dels = MOCK_DELIVERABLES_BY_ENGAGEMENT[eng.id] ?? [];
    const posted = dels.filter((d) => d.status === 'posted');
    if (posted.length) {
      influencerMap[eng.id] = {
        id: eng.id,
        contact_name: eng.contact_name,
        deliverables: posted.length,
      };
    }
    for (const d of posted) {
      byType[d.deliverable_type] = (byType[d.deliverable_type] ?? 0) + 1;
      if (d.content_link || d.screenshots?.length) {
        gallery.push({ ...d, contact_name: eng.contact_name });
      }
    }
  }

  return {
    completedCount,
    achievementPct,
    byType,
    gallery,
    influencers: Object.values(influencerMap),
  };
}
