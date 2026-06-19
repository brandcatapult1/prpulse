import {
  MOCK_CAMPAIGNS,
  MOCK_CONTACTS,
  MOCK_DASHBOARD,
  MOCK_DELIVERABLES_BY_ENGAGEMENT,
  MOCK_ENGAGEMENTS_BY_CAMPAIGN,
  MOCK_ENGAGEMENTS_BY_ID,
  MOCK_TIMELINE_BY_ENGAGEMENT,
} from '../data/mock.js';
import {
  getDeliverablesOverride,
  mergeEngagementRecord,
  mergeEngagementRow,
  saveDeliverablesOverride,
  saveEngagementOverride,
} from './demoStore.js';

export { saveEngagementOverride, saveDeliverablesOverride };

/** Use mock rows when the API returns an empty list (or the call failed). */
export function pickList(apiRows, mockRows) {
  return Array.isArray(apiRows) && apiRows.length > 0 ? apiRows : mockRows;
}

/** Use mock record when the API returned nothing useful. */
export function pickRecord(apiRow, mockRow) {
  if (apiRow && (apiRow.id || apiRow.campaign_name || apiRow.contact_name)) return apiRow;
  return mockRow;
}

export function getDemoCampaign(id) {
  return MOCK_CAMPAIGNS.find((c) => c.id === id) ?? MOCK_CAMPAIGNS[0];
}

export function getDemoEngagementsForCampaign(campaignId) {
  const base = MOCK_ENGAGEMENTS_BY_CAMPAIGN[campaignId] ?? MOCK_ENGAGEMENTS_BY_CAMPAIGN.c1;
  return base.map(mergeEngagementRow);
}

export function getDemoEngagement(id) {
  const base = MOCK_ENGAGEMENTS_BY_ID[id] ?? Object.values(MOCK_ENGAGEMENTS_BY_ID)[0];
  return mergeEngagementRecord({ ...base });
}

export function getDemoDeliverables(engagementId) {
  return getDeliverablesOverride(engagementId)
    ?? MOCK_DELIVERABLES_BY_ENGAGEMENT[engagementId]
    ?? [];
}

export function getDemoTimeline(engagementId) {
  return MOCK_TIMELINE_BY_ENGAGEMENT[engagementId] ?? [];
}

/** Merge dashboard API payload with sample widgets that would otherwise be empty. */
export function mergeDashboard(apiData) {
  if (!apiData) return { ...MOCK_DASHBOARD, _demo: true };

  const merged = {
    follow_ups_due: pickList(apiData.follow_ups_due, MOCK_DASHBOARD.follow_ups_due),
    overdue_deliverables: pickList(apiData.overdue_deliverables, MOCK_DASHBOARD.overdue_deliverables),
    deliverables_due: pickList(apiData.deliverables_due, MOCK_DASHBOARD.deliverables_due),
    upcoming_visits: pickList(apiData.upcoming_visits, MOCK_DASHBOARD.upcoming_visits),
    stalled_engagements: pickList(apiData.stalled_engagements, MOCK_DASHBOARD.stalled_engagements),
    active_campaigns: pickList(apiData.active_campaigns, MOCK_DASHBOARD.active_campaigns),
  };

  const usingDemo =
    !apiData.follow_ups_due?.length ||
    !apiData.active_campaigns?.length;

  return { ...merged, _demo: usingDemo };
}

export function isDemoList(apiRows) {
  return !Array.isArray(apiRows) || apiRows.length === 0;
}

export { MOCK_CAMPAIGNS, MOCK_CONTACTS, MOCK_DASHBOARD };
