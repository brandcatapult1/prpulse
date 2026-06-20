import { addDaysIso } from './dates.js';

/** PRD Module 6: Reel · Story · Post · Carousel */
export const DELIVERABLE_TYPES = [
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'post', label: 'Post' },
  { value: 'carousel', label: 'Carousel' },
];

const PLANNING_STATUSES = new Set(['in_conversation', 'scheduled', 'no_response']);

export function deliverableTypeLabel(type) {
  return DELIVERABLE_TYPES.find((t) => t.value === type)?.label
    ?? (type ?? '').replace(/_/g, ' ');
}

export function isDeliverablePlanningPhase(status) {
  return PLANNING_STATUSES.has(status);
}

export function buildNewDeliverable({ type, quantity = 1, dueDate, engagementStatus }) {
  const planning = isDeliverablePlanningPhase(engagementStatus);
  return {
    id: `d-${Date.now()}`,
    deliverable_type: type,
    quantity: Number(quantity) || 1,
    due_date: planning ? null : (dueDate || addDaysIso(7)),
    status: 'pending',
    is_overdue: false,
    content_link: null,
    screenshots: [],
    brief_compliance: null,
    brand_tag_verified: null,
    internal_rating: null,
  };
}
