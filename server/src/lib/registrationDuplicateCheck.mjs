import { findContactByMobile } from './mobileNumber.mjs';

export const DUPLICATE_SIGNUP_APPROVED_MESSAGE =
  "You're already part of our creator network — our team will reach out for relevant collaboration opportunities.";

export const DUPLICATE_SIGNUP_PENDING_MESSAGE =
  'Your profile is already submitted and under review — no need to resubmit.';

/**
 * V1: mobile-only duplicate signup check (E.164 after normalization).
 * V2 will gate the status reveal behind additional verification (mobile+email
 * or a phone code) — upgrade only this function when adding that gate.
 *
 * @returns {{ duplicate: false } | { duplicate: true, outcome: 'approved' | 'pending_review', message: string }}
 */
export async function checkExistingRegistrationByMobile(client, e164, defaultCountry) {
  const { contact } = await findContactByMobile(client, e164, defaultCountry);
  if (contact) {
    return {
      duplicate: true,
      outcome: 'approved',
      message: DUPLICATE_SIGNUP_APPROVED_MESSAGE,
    };
  }

  const { rows } = await client.query(
    `SELECT id FROM registration_submissions
     WHERE mobile_number = $1
       AND status IN ('new', 'pending_review')
     LIMIT 1`,
    [e164],
  );

  if (rows[0]) {
    return {
      duplicate: true,
      outcome: 'pending_review',
      message: DUPLICATE_SIGNUP_PENDING_MESSAGE,
    };
  }

  return { duplicate: false };
}
