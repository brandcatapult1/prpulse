/** Senior Manager / Admin only — mark Didn't Deliver from Awaiting (PRD). */
export function canMarkDidntDeliver(role) {
  return role === 'admin' || role === 'senior_manager';
}

/** Senior Manager / Admin only — reopen Collaboration Complete. */
export function canReopenComplete(role) {
  return role === 'admin' || role === 'senior_manager';
}

/** Admin only — change monthly retainer length (term_months). */
export function canEditCampaignTermMonths(role) {
  return role === 'admin';
}
