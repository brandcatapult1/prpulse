import { findContactByMobile, normalizeMobileToE164 } from './mobileNumber.mjs';
import { assertValidCity } from './cities.mjs';
import { assertValidCategoryId } from './categories.mjs';
import { assertCollaborationPreference } from './collaborationPrefs.mjs';

/**
 * Raised when a create would collide with an existing contact's normalized mobile.
 * Callers should route the user to `existing` instead of minting a duplicate.
 */
export class DuplicateContactError extends Error {
  constructor(existing) {
    super('A contact with this mobile number already exists');
    this.status = 409;
    this.code = 'duplicate_contact';
    this.existing = existing ?? null;
  }
}

/**
 * Insert a contact while enforcing one-contact-per-mobile dedup.
 *
 * Default behaviour ALWAYS routes a detected match to the existing record by
 * throwing DuplicateContactError — it never silently mints a second contact
 * sharing a normalized mobile number. The DB-level unique index is the
 * structural backstop for races; this is the primary, message-friendly guard.
 *
 * @throws {DuplicateContactError} when a contact with the same E.164 exists.
 */
export async function createContactDeduped(client, fields) {
  const fullName = String(fields.full_name ?? '').trim();
  if (!fullName) {
    throw Object.assign(new Error('Full name is required'), { status: 400 });
  }

  const e164 = normalizeMobileToE164(fields.mobile_number, fields.mobile_country_code);
  if (!e164) {
    throw Object.assign(new Error('Enter a valid mobile number'), { status: 400 });
  }

  const { contact: dup } = await findContactByMobile(client, e164, fields.mobile_country_code);
  if (dup) {
    throw new DuplicateContactError({
      id: dup.id,
      full_name: dup.full_name,
      mobile_number: dup.mobile_number,
    });
  }

  if (!fields.source) {
    throw Object.assign(new Error('Contact source is required'), { status: 400 });
  }

  let city = fields.city ?? null;
  let country = fields.country ?? null;
  if (city) {
    const row = await assertValidCity(client, city, fields.country ?? fields.mobile_country_code);
    city = row.name;
    country = row.country;
  }

  let primaryCategoryId = null;
  if (fields.primary_category_id) {
    const cat = await assertValidCategoryId(client, fields.primary_category_id);
    primaryCategoryId = cat.id;
  }

  assertCollaborationPreference(fields.open_to_paid, fields.open_to_barter);

  try {
    const { rows } = await client.query(
      `INSERT INTO contacts (
         full_name, mobile_number, email, city, state, country,
         instagram_url, youtube_url, classification, primary_category_id,
         open_to_paid, open_to_barter, source, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        fullName,
        e164,
        fields.email ?? null,
        city,
        fields.state ?? null,
        country,
        fields.instagram_url ?? null,
        fields.youtube_url ?? null,
        fields.classification ?? null,
        primaryCategoryId,
        fields.open_to_paid ?? false,
        fields.open_to_barter ?? false,
        fields.source,
        fields.created_by ?? null,
      ],
    );
    return rows[0];
  } catch (err) {
    // Unique-index backstop for the rare concurrent-insert race.
    if (err.code === '23505') {
      throw new DuplicateContactError(null);
    }
    throw err;
  }
}
