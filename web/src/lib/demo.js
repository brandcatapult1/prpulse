import {
  MOCK_CAMPAIGNS,
  MOCK_CONTACTS,
  MOCK_DASHBOARD,
  MOCK_BRANDS,
  MOCK_TEAM,
  MOCK_USERS,
  MOCK_AUDIT_LOG,
  MOCK_DELIVERABLES_BY_ENGAGEMENT,
  MOCK_ENGAGEMENTS_BY_CAMPAIGN,
  MOCK_ENGAGEMENTS_BY_ID,
  MOCK_FEEDBACK_BY_ENGAGEMENT,
  MOCK_REGISTRATIONS,
  MOCK_TIMELINE_BY_ENGAGEMENT,
} from '../data/mock.js';
import {
  getDeliverablesOverride,
  getFeedbackOverride,
  getBlacklistOverride,
  getRegistrationAdds,
  getRegistrationOverride,
  addRegistrationSubmission,
  mergeEngagementRecord,
  mergeEngagementRow,
  saveDeliverablesOverride,
  saveEngagementOverride,
  saveFeedbackOverride,
  saveBlacklistOverride,
  clearBlacklistOverride,
  saveRegistrationOverride,
  saveBrandOverride,
  getBrandOverride,
  getContactAdds,
  getCampaignAdds,
  getEngagementAdds,
  addContactImports,
  addCampaignImports,
  addEngagementImport,
  getUserOverride,
  saveUserOverride,
  getActivityEvents,
} from './demoStore.js';
import {
  activityEventToTimelineEntry,
  getActivityEventsForEngagement,
  getActivityEventsForCampaign,
} from './activityLog.js';

export {
  saveEngagementOverride,
  saveDeliverablesOverride,
  saveFeedbackOverride,
  saveBlacklistOverride,
  clearBlacklistOverride,
  saveRegistrationOverride,
  saveBrandOverride,
  addRegistrationSubmission,
  addContactImports,
  addCampaignImports,
  addEngagementImport,
  saveUserOverride,
};

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
  return getDemoCampaigns().find((c) => c.id === id) ?? MOCK_CAMPAIGNS[0];
}

export function getDemoContacts() {
  return [...MOCK_CONTACTS, ...getContactAdds()];
}

export function getDemoContact(id) {
  return getDemoContacts().find((c) => c.id === id) ?? null;
}

export function getDemoCampaigns() {
  return [...MOCK_CAMPAIGNS, ...getCampaignAdds()];
}

export function getDemoBrands() {
  return MOCK_BRANDS.map((brand) => {
    const override = getBrandOverride(brand.id);
    const merged = override ? { ...brand, ...override } : { ...brand };
    const campaigns = MOCK_CAMPAIGNS.filter((c) => c.brand_id === brand.id);
    return { ...merged, campaign_count: campaigns.length };
  });
}

export function getDemoBrand(id) {
  return getDemoBrands().find((b) => b.id === id) ?? null;
}

export function getCampaignsForBrand(brandId) {
  return MOCK_CAMPAIGNS.filter((c) => c.brand_id === brandId);
}

export function mergeBrands(apiRows) {
  const demo = getDemoBrands();
  if (!Array.isArray(apiRows) || apiRows.length === 0) {
    return { rows: demo, _demo: true };
  }
  const byId = new Map(demo.map((b) => [b.id, b]));
  for (const row of apiRows) {
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? { ...existing, ...row } : row);
  }
  return { rows: [...byId.values()], _demo: false };
}

export function getDemoEngagementsForCampaign(campaignId) {
  const base = MOCK_ENGAGEMENTS_BY_CAMPAIGN[campaignId] ?? [];
  const added = getEngagementAdds().filter((e) => e.campaign_id === campaignId);
  return [...base, ...added].map(mergeEngagementRow);
}

export function getDemoEngagement(id) {
  const added = getEngagementAdds().find((e) => e.id === id);
  if (added) return mergeEngagementRecord({ ...added });
  const base = MOCK_ENGAGEMENTS_BY_ID[id] ?? Object.values(MOCK_ENGAGEMENTS_BY_ID)[0];
  return mergeEngagementRecord({ ...base });
}

export function getDemoDeliverables(engagementId) {
  return getDeliverablesOverride(engagementId)
    ?? MOCK_DELIVERABLES_BY_ENGAGEMENT[engagementId]
    ?? [];
}

export function getDemoTimeline(engagementId) {
  const fromEvents = getActivityEventsForEngagement(engagementId).map(activityEventToTimelineEntry);
  const seed = MOCK_TIMELINE_BY_ENGAGEMENT[engagementId] ?? [];
  return [...fromEvents, ...seed].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function getDemoActivityEventsForCampaign(campaignId) {
  return getActivityEventsForCampaign(campaignId);
}

export { getActivityEvents };

export function getDemoFeedback(engagementId) {
  return getFeedbackOverride(engagementId) ?? MOCK_FEEDBACK_BY_ENGAGEMENT[engagementId] ?? null;
}

export function isContactBlacklisted(contactId) {
  const override = getBlacklistOverride(contactId);
  if (override) return true;
  const contact = MOCK_CONTACTS.find((c) => c.id === contactId);
  return Boolean(contact?.is_blacklisted);
}

export function getDemoRegistrations() {
  const added = getRegistrationAdds();
  const base = [...MOCK_REGISTRATIONS, ...added];
  return base.map((row) => {
    const override = getRegistrationOverride(row.id);
    return override ? { ...row, ...override } : row;
  });
}

export function mergeRegistrations(apiRows) {
  const demo = getDemoRegistrations();
  if (!Array.isArray(apiRows) || apiRows.length === 0) {
    return { rows: demo, _demo: true };
  }
  const byId = new Map(demo.map((r) => [r.id, r]));
  for (const row of apiRows) {
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? { ...existing, ...row } : row);
  }
  return { rows: [...byId.values()], _demo: false };
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

export { MOCK_CAMPAIGNS, MOCK_CONTACTS, MOCK_DASHBOARD, MOCK_BRANDS, MOCK_TEAM, MOCK_USERS, MOCK_AUDIT_LOG };

export function mergeContacts(apiRows) {
  const demo = getDemoContacts();
  if (!Array.isArray(apiRows) || apiRows.length === 0) {
    return { rows: demo, _demo: true };
  }
  return { rows: apiRows, _demo: false };
}

export function getDemoUsers() {
  return MOCK_USERS.map((user) => {
    const override = getUserOverride(user.id);
    return override ? { ...user, ...override } : { ...user };
  });
}

export function mergeUsers(apiRows) {
  const demo = getDemoUsers();
  if (!Array.isArray(apiRows) || apiRows.length === 0) {
    return { rows: demo, _demo: true };
  }
  return { rows: apiRows, _demo: false };
}

export function getDemoAuditLog(entityType = null) {
  const base = [...MOCK_AUDIT_LOG];
  if (!entityType || entityType === 'all') return base;
  return base.filter((e) => e.entity_type === entityType);
}

export function mergeAuditLog(apiRows, entityType = null) {
  const demo = getDemoAuditLog(entityType);
  if (!Array.isArray(apiRows) || apiRows.length === 0) {
    return { rows: demo, _demo: true };
  }
  return { rows: apiRows, _demo: false };
}
