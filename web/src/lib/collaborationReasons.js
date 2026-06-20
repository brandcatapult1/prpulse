/** PRD Module 5 — primary/secondary collaboration reason (schema: collaboration_reason). */
export const COLLABORATION_REASONS = [
  { value: 'virality', label: 'Virality' },
  { value: 'expert', label: 'Expert' },
  { value: 'positioning', label: 'Positioning' },
];

export function collaborationReasonLabel(value) {
  if (!value) return null;
  return COLLABORATION_REASONS.find((r) => r.value === value)?.label ?? null;
}

export function formatCollaborationReason(value) {
  return collaborationReasonLabel(value) ?? '—';
}
