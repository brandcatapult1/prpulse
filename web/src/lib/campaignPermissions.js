/** Senior Manager / Admin only — mark Didn't Deliver from Awaiting (PRD). */
export function canMarkDidntDeliver(role) {
  return role === 'admin' || role === 'senior_manager';
}
