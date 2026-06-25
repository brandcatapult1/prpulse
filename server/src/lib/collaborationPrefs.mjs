export const COLLABORATION_PREFERENCE_ERROR =
  'Select at least one: open to paid and/or barter';

export function hasCollaborationPreference(openToPaid, openToBarter) {
  return Boolean(openToPaid) || Boolean(openToBarter);
}

export function collaborationPreferenceError(openToPaid, openToBarter) {
  return hasCollaborationPreference(openToPaid, openToBarter)
    ? null
    : COLLABORATION_PREFERENCE_ERROR;
}

export function assertCollaborationPreference(openToPaid, openToBarter) {
  if (!hasCollaborationPreference(openToPaid, openToBarter)) {
    throw Object.assign(new Error(COLLABORATION_PREFERENCE_ERROR), { status: 400 });
  }
}

/** Resolve effective prefs when a PATCH may update only one field. */
export function effectiveCollaborationPreference(existing, patchScalars) {
  const openToPaid = Object.prototype.hasOwnProperty.call(patchScalars, 'open_to_paid')
    ? Boolean(patchScalars.open_to_paid)
    : Boolean(existing?.open_to_paid);
  const openToBarter = Object.prototype.hasOwnProperty.call(patchScalars, 'open_to_barter')
    ? Boolean(patchScalars.open_to_barter)
    : Boolean(existing?.open_to_barter);
  return { openToPaid, openToBarter };
}
