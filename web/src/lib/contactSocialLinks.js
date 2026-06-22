import { getCachedContact } from './contactsCache.js';

/** Prefer contact fields joined on the engagement row; cache is legacy fallback only. */
export function contactFromEngagement(engagement) {
  if (!engagement?.contact_id) return null;

  const hasEmbedded =
    Object.prototype.hasOwnProperty.call(engagement, 'contact_mobile_number')
    || Object.prototype.hasOwnProperty.call(engagement, 'contact_instagram_url')
    || Object.prototype.hasOwnProperty.call(engagement, 'contact_youtube_url')
    || Object.prototype.hasOwnProperty.call(engagement, 'contact_email')
    || Object.prototype.hasOwnProperty.call(engagement, 'contact_city');

  if (hasEmbedded) {
    return {
      id: engagement.contact_id,
      mobile_number: engagement.contact_mobile_number ?? null,
      instagram_url: engagement.contact_instagram_url ?? null,
      youtube_url: engagement.contact_youtube_url ?? null,
      email: engagement.contact_email ?? null,
      city: engagement.contact_city ?? null,
    };
  }

  return getCachedContact(engagement.contact_id);
}

function fallbackHandleLabel(engagement) {
  const contact = contactFromEngagement(engagement);
  const ig = contact?.instagram_url ?? null;
  if (ig) {
    const match = ig.match(/instagram\.com\/([^/?]+)/i);
    if (match) return `@${match[1].replace(/^@/, '')}`;
  }
  const slug = (engagement.contact_name ?? 'creator')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  return `@${slug || 'creator'}`;
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** wa.me path: country code + digits only (default +91 for 10-digit IN numbers). */
export function whatsAppWaMeNumber(mobile) {
  const digits = digitsOnly(mobile);
  if (!digits) return null;
  if (digits.length >= 11) return digits;
  if (digits.length === 10) return `91${digits}`;
  return null;
}

export function whatsAppUrl(mobile) {
  const n = whatsAppWaMeNumber(mobile);
  return n ? `https://wa.me/${n}` : null;
}

function instagramProfileFromUrl(url) {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/instagram\.com\/([^/?#]+)/i);
  if (!match) return trimmed.startsWith('http') ? { profileUrl: trimmed, handleLabel: null } : null;
  const handle = match[1].replace(/^@/, '').replace(/\/$/, '');
  if (!handle || ['p', 'reel', 'reels', 'stories', 'explore'].includes(handle.toLowerCase())) {
    return trimmed.startsWith('http') ? { profileUrl: trimmed, handleLabel: null } : null;
  }
  return {
    profileUrl: `https://instagram.com/${handle}`,
    handleLabel: `@${handle}`,
  };
}

function youtubeProfileFromUrl(url) {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return null;
  const atMatch = trimmed.match(/youtube\.com\/@([^/?#]+)/i);
  if (atMatch) {
    const handle = atMatch[1].replace(/\/$/, '');
    return {
      profileUrl: `https://www.youtube.com/@${handle}`,
      handleLabel: `@${handle}`,
    };
  }
  if (/youtube\.com\/(?:channel|c|user)\/[^/?#]+/i.test(trimmed)) {
    return {
      profileUrl: trimmed.split('?')[0],
      handleLabel: 'YouTube',
    };
  }
  return trimmed.startsWith('http') ? { profileUrl: trimmed, handleLabel: 'YouTube' } : null;
}

/**
 * Social handle + link for a campaign card, from the linked contact record.
 * profileUrl null → handle renders as plain text.
 */
export function getCreatorCardIdentity(engagement) {
  const contact = contactFromEngagement(engagement);
  const instagramUrl = contact?.instagram_url ?? null;
  const youtubeUrl = contact?.youtube_url ?? null;

  const instagram = instagramUrl ? instagramProfileFromUrl(instagramUrl) : null;
  const youtube = !instagram?.profileUrl && youtubeUrl ? youtubeProfileFromUrl(youtubeUrl) : null;
  const social = instagram?.profileUrl ? instagram : youtube;

  const handleLabel = social?.handleLabel ?? fallbackHandleLabel(engagement);
  const profileUrl = social?.profileUrl ?? null;

  return {
    handleLabel,
    profileUrl,
    whatsAppUrl: contact?.mobile_number ? whatsAppUrl(contact.mobile_number) : null,
  };
}

export function formatMobileDisplay(mobile) {
  if (!mobile) return null;
  const normalized = whatsAppWaMeNumber(mobile) ?? digitsOnly(mobile);
  if (!normalized) return null;
  if (normalized.startsWith('91') && normalized.length === 12) {
    return `+91 ${normalized.slice(2, 7)} ${normalized.slice(7)}`;
  }
  return mobile.trim().startsWith('+') ? mobile.trim() : `+${normalized}`;
}

export function telUrl(mobile) {
  const normalized = whatsAppWaMeNumber(mobile) ?? digitsOnly(mobile);
  return normalized ? `tel:+${normalized}` : null;
}

/** Contact identity for the campaign quick-edit drawer. */
export function getDrawerContactIdentity(engagement) {
  const contact = contactFromEngagement(engagement);
  const social = getCreatorCardIdentity(engagement);
  const mobile = contact?.mobile_number ?? null;

  return {
    contactId: engagement?.contact_id ?? contact?.id ?? null,
    handleLabel: social.handleLabel,
    profileUrl: social.profileUrl,
    whatsAppUrl: social.whatsAppUrl,
    mobile,
    mobileDisplay: formatMobileDisplay(mobile),
    telUrl: telUrl(mobile),
    email: contact?.email ?? null,
  };
}
