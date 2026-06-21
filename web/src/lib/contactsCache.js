/** In-memory contact cache keyed by contact id — populated when contacts are loaded. */

let byId = {};

export function setContactsCache(contacts) {
  const map = {};
  for (const c of contacts ?? []) {
    if (c?.id) map[c.id] = c;
  }
  byId = map;
}

export function mergeContactsCache(contacts) {
  for (const c of contacts ?? []) {
    if (c?.id) byId = { ...byId, [c.id]: { ...byId[c.id], ...c } };
  }
}

export function getCachedContact(contactId) {
  return byId[contactId] ?? null;
}

export function updateCachedContact(contactId, patch) {
  if (!contactId) return;
  byId = { ...byId, [contactId]: { ...byId[contactId], ...patch, id: contactId } };
}
