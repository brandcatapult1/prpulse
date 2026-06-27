/** Indicative rate fields on contacts (current rates only — not historical). */
export const INDICATIVE_RATE_FIELDS = ['reel_rate', 'story_rate', 'post_rate', 'other_rate'];

/** Rate fields captured on public registration signup. */
export const REGISTRATION_RATE_FIELDS = ['reel_rate', 'story_rate'];

export function emptyIndicativeRates() {
  return Object.fromEntries(INDICATIVE_RATE_FIELDS.map((key) => [key, '']));
}

export function emptyRegistrationRates() {
  return Object.fromEntries(REGISTRATION_RATE_FIELDS.map((key) => [key, '']));
}

/** Whether indicative rate inputs should be visible for the given open-to-paid flag. */
export function showIndicativeRates(openToPaid) {
  return Boolean(openToPaid);
}

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

/** Draft patch after toggling open-to-paid — clears rates when paid is off. */
export function draftWithOpenToPaid(draft, openToPaid) {
  return {
    ...draft,
    open_to_paid: openToPaid,
    ...(openToPaid ? {} : emptyIndicativeRates()),
  };
}

/** Registration form patch after toggling paid preference — clears rates when paid is off. */
export function formWithPaidPreference(form, paidPreference) {
  return {
    ...form,
    paid_preference: paidPreference,
    ...(paidPreference ? {} : emptyRegistrationRates()),
  };
}

/** Null out stored rates when not open to paid (save/submit payloads). */
export function indicativeRatesPayload(openToPaid, draft, rateToPayload) {
  if (!openToPaid) {
    return Object.fromEntries(INDICATIVE_RATE_FIELDS.map((key) => [key, null]));
  }
  return Object.fromEntries(
    INDICATIVE_RATE_FIELDS.map((key) => [key, rateToPayload(draft[key])]),
  );
}

/** Null out registration rates when paid preference is off. */
export function registrationRatesPayload(paidPreference, form) {
  if (!paidPreference) {
    return Object.fromEntries(REGISTRATION_RATE_FIELDS.map((key) => [key, null]));
  }
  return Object.fromEntries(
    REGISTRATION_RATE_FIELDS.map((key) => {
      const raw = form[key];
      if (raw === '' || raw == null) return [key, null];
      const n = Number(raw);
      return [key, Number.isFinite(n) ? n : null];
    }),
  );
}
