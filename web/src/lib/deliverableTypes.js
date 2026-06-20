import { addDaysIso } from './dates.js';

export const DELIVERABLE_TYPES = [
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'post', label: 'Post' },
  { value: 'video', label: 'Video' },
];

export function buildNewDeliverable({ type, quantity, dueDate }) {
  return {
    id: `d-${Date.now()}`,
    deliverable_type: type,
    quantity: Number(quantity) || 1,
    due_date: dueDate || addDaysIso(7),
    status: 'pending',
    is_overdue: false,
    content_link: null,
    screenshots: [],
    brief_compliance: null,
    brand_tag_verified: null,
    internal_rating: null,
  };
}
