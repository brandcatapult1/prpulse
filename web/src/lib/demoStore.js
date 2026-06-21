import { MOCK_ENGAGEMENTS_BY_CAMPAIGN, MOCK_ENGAGEMENTS_BY_ID } from '../data/mock.js';

const STORAGE_KEY = 'prpulse-demo-session';

const PERSISTED_ENGAGEMENT_FIELDS = [
  'conversation_status',
  'interest_level',
  'next_follow_up_date',
  'last_contact_date',
  'visit_date',
  'visit_time',
  'visit_outlet',
  'visit_notes',
  'notes',
  'agreed_fee',
  'collaboration_type',
  'primary_collaboration_reason',
  'no_reply_count',
  'last_contact_log_type',
  'visit_completed_date',
  'dropped_from',
  'drop_failed_at_stage',
  'initial_contact_date',
];

function loadStore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { engagements: {}, deliverables: {}, feedback: {}, blacklist: {}, registrations: {}, registrationAdds: [], brands: {}, contactAdds: [], campaignAdds: [], engagementAdds: [], contactProfiles: {}, users: {}, activityEvents: [], orgSettings: null };
    const parsed = JSON.parse(raw);
    return {
      engagements: parsed.engagements ?? {},
      deliverables: parsed.deliverables ?? {},
      feedback: parsed.feedback ?? {},
      blacklist: parsed.blacklist ?? {},
      registrations: parsed.registrations ?? {},
      registrationAdds: parsed.registrationAdds ?? [],
      brands: parsed.brands ?? {},
      contactAdds: parsed.contactAdds ?? [],
      campaignAdds: parsed.campaignAdds ?? [],
      engagementAdds: parsed.engagementAdds ?? [],
      contactProfiles: parsed.contactProfiles ?? {},
      users: parsed.users ?? {},
      activityEvents: Array.isArray(parsed.activityEvents) ? parsed.activityEvents : [],
      orgSettings: parsed.orgSettings ?? null,
    };
  } catch {
    return { engagements: {}, deliverables: {}, feedback: {}, blacklist: {}, registrations: {}, registrationAdds: [], brands: {}, contactAdds: [], campaignAdds: [], engagementAdds: [], contactProfiles: {}, users: {}, activityEvents: [], orgSettings: null };
  }
}

function saveStore(store) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function pickEngagementFields(data) {
  const out = {};
  for (const key of PERSISTED_ENGAGEMENT_FIELDS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

export function getEngagementOverride(id) {
  return loadStore().engagements[id] ?? null;
}

export function saveEngagementOverride(id, data) {
  const store = loadStore();
  store.engagements[id] = {
    ...(store.engagements[id] ?? {}),
    ...pickEngagementFields(data),
  };
  saveStore(store);
}

export function getDeliverablesOverride(engagementId) {
  const list = loadStore().deliverables[engagementId];
  return Array.isArray(list) ? list : null;
}

export function saveDeliverablesOverride(engagementId, list) {
  const store = loadStore();
  store.deliverables[engagementId] = list;
  saveStore(store);
}

function normalizeTerminalFields(record) {
  if (
    record.conversation_status === 'collaboration_complete'
    || record.conversation_status?.startsWith('dropped_')
  ) {
    return { ...record, next_follow_up_date: null };
  }
  return record;
}

export function mergeEngagementRow(row) {
  if (!row?.id) return row;
  const override = getEngagementOverride(row.id);
  const merged = override ? { ...row, ...override } : row;
  return normalizeTerminalFields(merged);
}

export function mergeEngagementRecord(base) {
  if (!base?.id) return base;
  const override = getEngagementOverride(base.id);
  const merged = override ? { ...base, ...override } : { ...base };
  return normalizeTerminalFields(merged);
}

export function getFeedbackOverride(engagementId) {
  return loadStore().feedback[engagementId] ?? null;
}

export function saveFeedbackOverride(engagementId, record) {
  const store = loadStore();
  store.feedback[engagementId] = record;
  saveStore(store);
}

export function getBlacklistOverride(contactId) {
  return loadStore().blacklist[contactId] ?? null;
}

export function saveBlacklistOverride(contactId, record) {
  const store = loadStore();
  store.blacklist[contactId] = record;
  saveStore(store);
}

export function clearBlacklistOverride(contactId) {
  const store = loadStore();
  delete store.blacklist[contactId];
  saveStore(store);
}

export function getRegistrationOverride(id) {
  return loadStore().registrations[id] ?? null;
}

export function saveRegistrationOverride(id, patch) {
  const store = loadStore();
  store.registrations[id] = { ...(store.registrations[id] ?? {}), ...patch };
  saveStore(store);
}

export function getRegistrationAdds() {
  return loadStore().registrationAdds ?? [];
}

export function addRegistrationSubmission(record) {
  const store = loadStore();
  store.registrationAdds = [...(store.registrationAdds ?? []), record];
  saveStore(store);
}

export function getBrandOverride(id) {
  return loadStore().brands[id] ?? null;
}

export function saveBrandOverride(id, patch) {
  const store = loadStore();
  store.brands[id] = { ...(store.brands[id] ?? {}), ...patch };
  saveStore(store);
}

export function getContactAdds() {
  return loadStore().contactAdds ?? [];
}

export function addContactImports(contacts) {
  const store = loadStore();
  store.contactAdds = [...(store.contactAdds ?? []), ...contacts];
  saveStore(store);
}

export function getCampaignAdds() {
  return loadStore().campaignAdds ?? [];
}

export function addCampaignImports(campaigns) {
  const store = loadStore();
  store.campaignAdds = [...(store.campaignAdds ?? []), ...campaigns];
  saveStore(store);
}

export function getEngagementAdds() {
  return loadStore().engagementAdds ?? [];
}

/** Contact IDs already on a campaign (mock seed + session adds). */
export function contactIdsInCampaign(campaignId) {
  const ids = new Set();
  for (const row of MOCK_ENGAGEMENTS_BY_CAMPAIGN[campaignId] ?? []) {
    const contactId = MOCK_ENGAGEMENTS_BY_ID[row.id]?.contact_id;
    if (contactId != null) ids.add(String(contactId));
  }
  for (const added of getEngagementAdds()) {
    if (added.campaign_id === campaignId && added.contact_id != null) {
      ids.add(String(added.contact_id));
    }
  }
  return ids;
}

export function isContactInCampaign(campaignId, contactId) {
  if (!campaignId || contactId == null) return false;
  return contactIdsInCampaign(campaignId).has(String(contactId));
}

export function addEngagementImport({ contactId, contactName, campaignId, campaignName, ownerName }) {
  if (isContactInCampaign(campaignId, contactId)) {
    return { added: false, skipped: true, row: null };
  }

  const store = loadStore();
  const row = {
    id: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    campaign_id: campaignId,
    contact_id: contactId,
    contact_name: contactName,
    campaign_name: campaignName,
    owner_name: ownerName ?? 'You',
    conversation_status: 'not_contacted',
    interest_level: null,
    next_follow_up_date: null,
    agreed_fee: null,
  };
  store.engagementAdds = [...(store.engagementAdds ?? []), row];
  saveStore(store);
  return { added: true, skipped: false, row };
}

export function getContactProfileOverride(id) {
  return loadStore().contactProfiles?.[id] ?? null;
}

export function saveContactProfileOverride(id, patch) {
  const store = loadStore();
  store.contactProfiles = {
    ...(store.contactProfiles ?? {}),
    [id]: { ...(store.contactProfiles?.[id] ?? {}), ...patch },
  };
  saveStore(store);
}

export function getUserOverride(id) {
  return loadStore().users[id] ?? null;
}

export function saveUserOverride(id, patch) {
  const store = loadStore();
  store.users[id] = { ...(store.users[id] ?? {}), ...patch };
  saveStore(store);
}

export function getActivityEvents() {
  return loadStore().activityEvents ?? [];
}

export function appendActivityEvent(event) {
  const store = loadStore();
  store.activityEvents = [...(store.activityEvents ?? []), event];
  saveStore(store);
  return event;
}

export function getOrgSettingsOverride() {
  return loadStore().orgSettings ?? null;
}

export function saveOrgSettingsOverride(patch) {
  const store = loadStore();
  store.orgSettings = { ...(store.orgSettings ?? {}), ...patch };
  saveStore(store);
}
