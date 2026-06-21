import { getCachedContact } from './contactsCache.js';

export function isContactBlacklisted(contactId) {
  const contact = getCachedContact(contactId);
  return Boolean(contact?.is_blacklisted);
}
