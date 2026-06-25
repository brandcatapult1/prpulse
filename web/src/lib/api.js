export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? res.statusText);
    err.status = res.status;
    err.data = body;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const authApi = {
  me: () => api('/auth/me'),
  status: () => api('/auth/status'),
  logout: () => api('/auth/logout', { method: 'POST' }),
};

export const dashboardApi = {
  get: () => api('/dashboard'),
  workspace: () => api('/dashboard/workspace'),
};

export const contactsApi = {
  list: ({ includeArchived = false } = {}) =>
    api(`/contacts${includeArchived ? '?include_archived=true' : ''}`),
  get: (id) => api(`/contacts/${id}`),
  engagements: (id) => api(`/contacts/${id}/engagements`),
  update: (id, body) => api(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  create: (body) => api('/contacts/quick-add', { method: 'POST', body: JSON.stringify(body) }),
  quickAdd: (body) => api('/contacts/quick-add', { method: 'POST', body: JSON.stringify(body) }),
  batchSetStatus: (contactIds, status) =>
    api('/contacts/batch/set-status', {
      method: 'POST',
      body: JSON.stringify({ contact_ids: contactIds, status }),
    }),
  batchAddTag: (contactIds, tagId) =>
    api('/contacts/batch/add-tag', {
      method: 'POST',
      body: JSON.stringify({ contact_ids: contactIds, tag_id: tagId }),
    }),
  lookupMobile: (mobile, countryCode) => {
    const q = countryCode ? `?country=${encodeURIComponent(countryCode)}` : '';
    return api(`/contacts/lookup/mobile/${encodeURIComponent(mobile)}${q}`);
  },
  populationForCampaign: (campaignId) =>
    api(`/contacts/population/campaign/${campaignId}`),
  blacklist: (id, reason) =>
    api(`/contacts/${id}/blacklist`, { method: 'POST', body: JSON.stringify({ reason }) }),
  clearBlacklist: (id) => api(`/contacts/${id}/blacklist`, { method: 'DELETE' }),
};

export const campaignsApi = {
  list: () => api('/campaigns'),
  assignableManagers: () => api('/campaigns/assignable-managers'),
  create: (body) => api('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  get: (id) => api(`/campaigns/${id}`),
  update: (id, body) => api(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  populate: (id, body) =>
    api(`/campaigns/${id}/populate`, { method: 'POST', body: JSON.stringify(body) }),
};

export const engagementsApi = {
  byCampaign: (campaignId) => api(`/engagements/campaign/${campaignId}`),
  assignedToMe: () => api('/engagements/assigned/me'),
  get: (id) => api(`/engagements/${id}`),
  update: (id, body) => api(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deliverables: (id) => api(`/engagements/${id}/deliverables`),
  createDeliverable: (id, body) =>
    api(`/engagements/${id}/deliverables`, { method: 'POST', body: JSON.stringify(body) }),
  updateDeliverable: (engagementId, deliverableId, body) =>
    api(`/engagements/${engagementId}/deliverables/${deliverableId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteDeliverable: (engagementId, deliverableId) =>
    api(`/engagements/${engagementId}/deliverables/${deliverableId}`, { method: 'DELETE' }),
  feedback: (id) => api(`/engagements/${id}/feedback`),
  saveFeedback: (id, body) =>
    api(`/engagements/${id}/feedback`, { method: 'PUT', body: JSON.stringify(body) }),
  timeline: (id) => api(`/engagements/${id}/timeline`),
  visitReminder: (id, body) =>
    api(`/engagements/${id}/visit-reminder`, { method: 'POST', body: JSON.stringify(body) }),
  schedule: (id, body) =>
    api(`/engagements/${id}/schedule`, { method: 'POST', body: JSON.stringify(body) }),
};

export const registrationsApi = {
  list: () => api('/registrations'),
  cities: (country) =>
    api(`/registrations/cities${country ? `?country=${encodeURIComponent(country)}` : ''}`),
  categories: () => api('/registrations/categories'),
  submit: (body) => api('/registrations', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/registrations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

export const brandsApi = {
  list: () => api('/brands'),
  create: (body) => api('/brands', { method: 'POST', body: JSON.stringify(body) }),
  get: (id) => api(`/brands/${id}`),
  accountManagers: () => api('/brands/account-managers/list'),
  update: (id, body) => api(`/brands/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

export const importApi = {
  contacts: (rows) => api('/import/contacts', { method: 'POST', body: JSON.stringify(rows) }),
  campaigns: (rows) => api('/import/campaigns', { method: 'POST', body: JSON.stringify(rows) }),
};

export const adminApi = {
  users: () => api('/admin/users'),
  updateUser: (id, body) => api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  auditLog: (entityType) => {
    const q = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : '';
    return api(`/admin/audit-log${q}`);
  },
  orgBranding: () => api('/admin/org-branding'),
  updateOrgBranding: (body) =>
    api('/admin/org-branding', { method: 'PATCH', body: JSON.stringify(body) }),
  createCity: (body) => api('/admin/cities', { method: 'POST', body: JSON.stringify(body) }),
  deleteCity: (id) => api(`/admin/cities/${id}`, { method: 'DELETE' }),
  seedDemo: (reset = false) =>
    api('/admin/seed-demo', { method: 'POST', body: JSON.stringify({ reset }) }),
};

export const orgBrandingApi = {
  get: () => api('/org/branding'),
  update: (body) => api('/admin/org-branding', { method: 'PATCH', body: JSON.stringify(body) }),
};

export const reportsApi = {
  campaign: (campaignId, period) =>
    api(`/reports/campaign/${campaignId}?period=${encodeURIComponent(period)}`),
  periods: () => api('/reports/periods'),
};

export const lookupApi = {
  tags: () => api('/lookup/tags'),
  categories: () => api('/lookup/categories'),
  cities: (country) =>
    api(`/lookup/cities${country ? `?country=${encodeURIComponent(country)}` : ''}`),
};
