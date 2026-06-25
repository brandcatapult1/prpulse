import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin } from '../middleware/permissions.mjs';
import { normalizeMobileToE164 } from '../lib/mobileNumber.mjs';
import { createContactDeduped } from '../lib/contactCreate.mjs';
import { assertValidCity, loadCities } from '../lib/cities.mjs';

export const registrationsRouter = Router();

const SELECT_FIELDS = `
  id, full_name, mobile_number, email, city, instagram_link, youtube_link,
  category, paid_preference, barter_preference, reel_rate, story_rate,
  portfolio_links, notes, status, linked_contact_id, created_at, reviewed_at
`;

/** Public — curated city list for signup (same source as internal lookup). */
registrationsRouter.get('/cities', async (req, res) => {
  try {
    const cities = await loadCities(pool, { country: req.query.country });
    res.json(cities);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load cities' });
  }
});

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

  const e164 = normalizeMobileToE164(mobile_number, country_code ?? undefined);
  if (!e164) {
    return res.status(400).json({ error: 'Enter a valid mobile number for the selected country' });
  }

  let storedCity = null;
  if (city?.trim()) {
    try {
      const row = await assertValidCity(pool, city, country_code ?? 'IN');
      storedCity = row.name;
    } catch (err) {
      return res.status(err.status ?? 400).json({ error: err.message ?? 'Invalid city' });
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO registration_submissions (
        full_name, mobile_number, email, city, instagram_link, youtube_link,
        category, paid_preference, barter_preference, reel_rate, story_rate,
        portfolio_links, notes, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'new')
      RETURNING ${SELECT_FIELDS}`,
      [
        full_name.trim(),
        e164,
        email ?? null,
        storedCity,
        instagram_link ?? null,
        youtube_link ?? null,
        category ?? null,
        paid_preference ?? null,
        barter_preference ?? null,
        reel_rate ?? null,
        story_rate ?? null,
        JSON.stringify(Array.isArray(portfolio_links) ? portfolio_links : []),
        notes ?? null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.warn('Registration submit failed:', err.message ?? err);
    res.status(503).json({ error: 'Registration unavailable — try again later' });
  }
});

registrationsRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS}
       FROM registration_submissions
       ORDER BY created_at DESC
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
          let country = null;
          if (sub.city) {
            const cityRow = await client.query(
              'SELECT country FROM cities WHERE name = $1 LIMIT 1',
              [sub.city],
            );
            country = cityRow.rows[0]?.country ?? null;
          }

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
      return updated[0];
    });

    if (!row) return res.status(404).json({ error: 'Registration not found' });
    res.json(row);
  } catch (err) {
    const httpStatus = err.status ?? 503;
    res.status(httpStatus).json({ error: err.message ?? 'Update failed' });
  }
});
