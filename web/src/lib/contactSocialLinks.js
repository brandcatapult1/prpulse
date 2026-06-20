import { getDemoContact } from './demo.js';
import { getContactProfileExtras } from './contactProfile.js';

function fallbackHandleLabel(engagement) {
  const contact = engagement?.contact_id ? getDemoContact(engagement.contact_id) : null;
  const ig = contact ? getContactProfileExtras(contact.id).instagram_url : null;
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
  const contact = engagement?.contact_id ? getDemoContact(engagement.contact_id) : null;
  const extras = contact ? getContactProfileExtras(contact.id) : {};
  const instagramUrl = extras.instagram_url || contact?.instagram_url || null;
  const youtubeUrl = extras.youtube_url || contact?.youtube_url || null;

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
