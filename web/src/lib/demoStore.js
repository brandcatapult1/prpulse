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
  'primary_collaboration_reason',
];

function loadStore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { engagements: {}, deliverables: {}, feedback: {}, blacklist: {}, registrations: {}, registrationAdds: [], brands: {} };
    const parsed = JSON.parse(raw);
    return {
      engagements: parsed.engagements ?? {},
      deliverables: parsed.deliverables ?? {},
      feedback: parsed.feedback ?? {},
      blacklist: parsed.blacklist ?? {},
      registrations: parsed.registrations ?? {},
      registrationAdds: parsed.registrationAdds ?? [],
      brands: parsed.brands ?? {},
    };
  } catch {
    return { engagements: {}, deliverables: {}, feedback: {}, blacklist: {}, registrations: {}, registrationAdds: [], brands: {} };
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
