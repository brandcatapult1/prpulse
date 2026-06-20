import { formatDate } from './format.jsx';

export function deliverableHasProof(deliverable) {
  const link = deliverable?.content_link?.trim();
  const shots = deliverable?.screenshots?.length ?? 0;
  return Boolean(link) || shots > 0;
}

export function deliverableProofEmphasis(type) {
  const normalized = (type ?? '').toLowerCase();
  if (normalized === 'story') {
    return {
      linkLabel: 'Post link (optional)',
      screenshotLabel: 'Screenshot — needed, stories expire',
      screenshotPrimary: true,
    };
  }
  return {
    linkLabel: 'Post link — needed',
    screenshotLabel: 'Screenshot (optional)',
    screenshotPrimary: false,
  };
}

export function canMarkDeliverablePosted({ contentLink, screenshots }) {
  const link = contentLink?.trim();
  const shots = screenshots?.length ?? 0;
  return Boolean(link) || shots > 0;
}

export function buildPostedDeliverablePatch(deliverable, { contentLink, screenshots, publishedDate }) {
  return {
    ...deliverable,
    status: 'posted',
    content_link: contentLink?.trim() || null,
    screenshots: screenshots ?? [],
    published_date: publishedDate,
    is_overdue: false,
  };
}

export function markDeliverablePostedToastMessage(deliverable) {
  const label = `${deliverable.deliverable_type} ×${deliverable.quantity}`;
  return `Logged ${label} — posted ${formatDate(deliverable.published_date)}`;
}
