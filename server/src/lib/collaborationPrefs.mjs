export const COLLABORATION_PREFERENCE_ERROR =
  'Select at least one: open to paid and/or barter';

export const INDICATIVE_RATE_FIELDS = ['reel_rate', 'story_rate', 'post_rate', 'other_rate'];

function parseOptionalRate(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw Object.assign(new Error('Rates must be non-negative numbers'), { status: 400 });
  }
  return n;
}

/** Null out stored rates when not open to paid (create/save payloads). */
export function indicativeRatesForStorage(openToPaid, fields) {
  if (!openToPaid) {
    return Object.fromEntries(INDICATIVE_RATE_FIELDS.map((key) => [key, null]));
  }
  return Object.fromEntries(
    INDICATIVE_RATE_FIELDS.map((key) => [key, parseOptionalRate(fields[key])]),
  );
}

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
