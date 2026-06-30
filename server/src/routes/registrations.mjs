import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin } from '../middleware/permissions.mjs';
import { normalizeMobileToE164 } from '../lib/mobileNumber.mjs';
import { createContactDeduped } from '../lib/contactCreate.mjs';
import { assertValidCity, loadCities } from '../lib/cities.mjs';
import { assertValidCategoryId, loadCategories } from '../lib/categories.mjs';
import { collaborationPreferenceError } from '../lib/collaborationPrefs.mjs';
import { profileLinkError } from '../lib/registrationValidation.mjs';
import {
  checkExistingRegistrationByMobile,
} from '../lib/registrationDuplicateCheck.mjs';

export const registrationsRouter = Router();

const SELECT_FIELDS = `
  id, full_name, mobile_number, email, country_code, city, instagram_link, youtube_link,
  category, primary_category_id, paid_preference, barter_preference, reel_rate, story_rate,
  portfolio_links, notes, status, linked_contact_id, created_at, reviewed_at
`;

const LIST_SELECT = `
  r.id, r.full_name, r.mobile_number, r.email, r.country_code, r.city, r.instagram_link, r.youtube_link,
  r.category, r.primary_category_id, cat.name AS primary_category_name,
  r.paid_preference, r.barter_preference, r.reel_rate, r.story_rate,
  r.portfolio_links, r.notes, r.status, r.linked_contact_id, r.created_at, r.reviewed_at
`;

/** Public — org logo for creator signup (same org_settings.logo_url as dashboard). */
registrationsRouter.get('/branding', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT logo_url FROM org_settings WHERE id = 1');
    res.json({ logo_url: rows[0]?.logo_url ?? null });
  } catch (err) {
    if (err.code === '42P01') return res.json({ logo_url: null });
    res.status(503).json({ error: 'Could not load branding' });
  }
});

/** Public — curated city list for signup (same source as internal lookup). */
registrationsRouter.get('/cities', async (req, res) => {
  try {
    const cities = await loadCities(pool, { country: req.query.country });
    res.json(cities);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load cities' });
  }
});

/** Public — admin-managed category list for signup (same source as internal lookup). */
registrationsRouter.get('/categories', async (_req, res) => {
  try {
    const categories = await loadCategories(pool);
    res.json(categories);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load categories' });
  }
});

async function applyPrimaryCategoryToContact(client, contactId, primaryCategoryId) {
  if (!primaryCategoryId || !contactId) return;
  await client.query(
    `UPDATE contacts SET primary_category_id = $1 WHERE id = $2`,
    [primaryCategoryId, contactId],
  );
}

/** Public — creator signup (no login). */
registrationsRouter.post('/', async (req, res) => {
  const {
    full_name,
    mobile_number,
    email,
    city,
    instagram_link,
    youtube_link,
    category,
    primary_category_id,
    paid_preference,
    barter_preference,
    reel_rate,
    story_rate,
    portfolio_links,
    notes,
    country_code,
  } = req.body ?? {};

  if (!full_name?.trim() || !mobile_number?.trim()) {
    return res.status(400).json({ error: 'Full name and mobile number are required' });
  }

  if (!primary_category_id) {
    return res.status(400).json({ error: 'Primary category is required' });
  }

  const prefError = collaborationPreferenceError(paid_preference, barter_preference);
  if (prefError) {
    return res.status(400).json({ error: prefError });
  }

  const linkError = profileLinkError(instagram_link, youtube_link);
  if (linkError) {
    return res.status(400).json({ error: linkError });
  }

  if (!country_code?.trim()) {
    return res.status(400).json({ error: 'Country is required' });
  }

  if (!city?.trim()) {
    return res.status(400).json({ error: 'City is required' });
  }

  const e164 = normalizeMobileToE164(mobile_number, country_code ?? undefined);
  if (!e164) {
    return res.status(400).json({ error: 'Enter a valid mobile number for the selected country' });
  }

  const duplicateCheck = await checkExistingRegistrationByMobile(
    pool,
    e164,
    country_code ?? undefined,
  );
  if (duplicateCheck.duplicate) {
    return res.status(409).json({
      code: 'duplicate_signup',
      outcome: duplicateCheck.outcome,
      message: duplicateCheck.message,
    });
  }

  let categoryRow;
  try {
    categoryRow = await assertValidCategoryId(pool, primary_category_id);
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message ?? 'Invalid category' });
  }

  let storedCity;
  try {
    const row = await assertValidCity(pool, city, country_code ?? 'IN');
    storedCity = row.name;
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message ?? 'Invalid city' });
  }

  const legacyCategoryText = category?.trim() || categoryRow.name;

  try {
    const { rows } = await pool.query(
      `INSERT INTO registration_submissions (
        full_name, mobile_number, email, country_code, city, instagram_link, youtube_link,
        category, primary_category_id, paid_preference, barter_preference, reel_rate, story_rate,
        portfolio_links, notes, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'new')
      RETURNING ${SELECT_FIELDS}`,
      [
        full_name.trim(),
        e164,
        email ?? null,
        country_code ?? 'IN',
        storedCity,
        instagram_link ?? null,
        youtube_link ?? null,
        legacyCategoryText,
        categoryRow.id,
        paid_preference ?? null,
        barter_preference ?? null,
        paid_preference ? reel_rate ?? null : null,
        paid_preference ? story_rate ?? null : null,
        JSON.stringify(Array.isArray(portfolio_links) ? portfolio_links : []),
        notes ?? null,
      ],
    );
    res.status(201).json({ ...rows[0], primary_category_name: categoryRow.name });
  } catch (err) {
    console.warn('Registration submit failed:', err.message ?? err);
    res.status(503).json({ error: 'Registration unavailable — try again later' });
  }
});

registrationsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${LIST_SELECT}
       FROM registration_submissions r
       LEFT JOIN categories cat ON cat.id = r.primary_category_id
       ORDER BY r.created_at DESC
       LIMIT 200`,
    );
    res.json(rows);
  } catch (err) {
    console.warn('Registration list failed:', err.message ?? err);
    res.status(503).json({ error: 'Registration list unavailable' });
  }
});

registrationsRouter.patch('/:id', requireAuth, requireSeniorOrAdmin, async (req, res) => {
  const { status, linked_contact_id } = req.body ?? {};
  const allowed = ['pending_review', 'approved', 'rejected', 'duplicate'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const row = await withUserTransaction(req.user.id, async (client) => {
      const current = await client.query(
        `SELECT * FROM registration_submissions WHERE id = $1`,
        [req.params.id],
      );
      if (!current.rows[0]) return null;

      const sub = current.rows[0];
      let finalStatus = status;
      let finalLinkedId = linked_contact_id ?? null;

      if (status === 'approved') {
        const e164 = normalizeMobileToE164(sub.mobile_number);
        if (!e164) {
          throw Object.assign(new Error('Invalid mobile number on registration'), { status: 400 });
        }

        if (finalLinkedId) {
          const linked = await client.query('SELECT id FROM contacts WHERE id = $1', [finalLinkedId]);
          if (!linked.rows[0]) {
            throw Object.assign(new Error('Linked contact not found'), { status: 404 });
          }
        } else {
          const country = sub.country_code ?? null;

          // Approve never mints a duplicate: a mobile match links to the existing
          // record (status 'duplicate'); otherwise a new contact is created.
          try {
            const created = await createContactDeduped(client, {
              full_name: sub.full_name,
              mobile_number: sub.mobile_number,
              email: sub.email,
              city: sub.city,
              country,
              instagram_url: sub.instagram_link,
              youtube_url: sub.youtube_link,
              primary_category_id: sub.primary_category_id,
              open_to_paid: Boolean(sub.paid_preference),
              open_to_barter: Boolean(sub.barter_preference),
              reel_rate: sub.reel_rate,
              story_rate: sub.story_rate,
              notes: sub.notes,
              source: 'signup_form',
              created_by: req.user.id,
            });
            finalLinkedId = created.id;
          } catch (dupErr) {
            if (dupErr.code === 'duplicate_contact' && dupErr.existing) {
              finalStatus = 'duplicate';
              finalLinkedId = dupErr.existing.id;
            } else {
              throw dupErr;
            }
          }
        }

        if (finalLinkedId) {
          await applyPrimaryCategoryToContact(client, finalLinkedId, sub.primary_category_id);
        }
      }

      const { rows: updated } = await client.query(
        `UPDATE registration_submissions
         SET status = $1,
             linked_contact_id = $2,
             reviewed_by = $3,
             reviewed_at = now()
         WHERE id = $4
         RETURNING ${SELECT_FIELDS}`,
        [finalStatus, finalLinkedId, req.user.id, req.params.id],
      );

      const enriched = await client.query(
        `SELECT ${LIST_SELECT}
         FROM registration_submissions r
         LEFT JOIN categories cat ON cat.id = r.primary_category_id
         WHERE r.id = $1`,
        [req.params.id],
      );
      return enriched.rows[0] ?? updated[0];
    });

    if (!row) return res.status(404).json({ error: 'Registration not found' });
    res.json(row);
  } catch (err) {
    const httpStatus = err.status ?? 503;
    res.status(httpStatus).json({ error: err.message ?? 'Update failed' });
  }
});
