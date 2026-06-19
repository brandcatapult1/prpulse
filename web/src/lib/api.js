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
};

export const contactsApi = {
  list: () => api('/contacts'),
  get: (id) => api(`/contacts/${id}`),
  quickAdd: (body) => api('/contacts/quick-add', { method: 'POST', body: JSON.stringify(body) }),
  lookupMobile: (mobile) =>
    api(`/contacts/lookup/mobile/${encodeURIComponent(mobile)}`),
};

export const campaignsApi = {
  list: () => api('/campaigns'),
  get: (id) => api(`/campaigns/${id}`),
  populate: (id, body) =>
    api(`/campaigns/${id}/populate`, { method: 'POST', body: JSON.stringify(body) }),
};

export const engagementsApi = {
  byCampaign: (campaignId) => api(`/engagements/campaign/${campaignId}`),
  get: (id) => api(`/engagements/${id}`),
  update: (id, body) => api(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deliverables: (id) => api(`/engagements/${id}/deliverables`),
};

export const registrationsApi = {
  list: () => api('/registrations'),
  submit: (body) => api('/registrations', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/registrations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

export const brandsApi = {
  list: () => api('/brands'),
  get: (id) => api(`/brands/${id}`),
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
};
