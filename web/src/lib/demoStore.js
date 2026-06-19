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
    if (!raw) return { engagements: {}, deliverables: {} };
    const parsed = JSON.parse(raw);
    return {
      engagements: parsed.engagements ?? {},
      deliverables: parsed.deliverables ?? {},
    };
  } catch {
    return { engagements: {}, deliverables: {} };
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

export function mergeEngagementRow(row) {
  if (!row?.id) return row;
  const override = getEngagementOverride(row.id);
  return override ? { ...row, ...override } : row;
}

export function mergeEngagementRecord(base) {
  if (!base?.id) return base;
  const override = getEngagementOverride(base.id);
  return override ? { ...base, ...override } : base;
}
