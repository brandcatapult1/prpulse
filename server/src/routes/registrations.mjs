import { Router } from 'express';
import { pool, withUserTransaction } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireSeniorOrAdmin } from '../middleware/permissions.mjs';

export const registrationsRouter = Router();

const SELECT_FIELDS = `
  id, full_name, mobile_number, email, city, instagram_link, youtube_link,
  category, paid_preference, barter_preference, reel_rate, story_rate,
  portfolio_links, notes, status, linked_contact_id, created_at, reviewed_at
`;

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
  } = req.body ?? {};

  if (!full_name?.trim() || !mobile_number?.trim()) {
    return res.status(400).json({ error: 'Full name and mobile number are required' });
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
        mobile_number.trim(),
        email ?? null,
        city ?? null,
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
    res.json([]);
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
      const { rows: updated } = await client.query(
        `UPDATE registration_submissions
         SET status = $1,
             linked_contact_id = $2,
             reviewed_by = $3,
             reviewed_at = now()
         WHERE id = $4
         RETURNING ${SELECT_FIELDS}`,
        [status, linked_contact_id ?? null, req.user.id, req.params.id],
      );
      if (!updated[0]) return null;

      if (status === 'approved' && !linked_contact_id) {
        const sub = updated[0];
        const { rows: created } = await client.query(
          `INSERT INTO contacts (
            full_name, mobile_number, email, city, instagram_url, source, created_by
          ) VALUES ($1,$2,$3,$4,$5,'signup_form',$6)
          RETURNING id`,
          [
            sub.full_name,
            sub.mobile_number,
            sub.email,
            sub.city,
            sub.instagram_link,
            req.user.id,
          ],
        );
        await client.query(
          'UPDATE registration_submissions SET linked_contact_id = $1 WHERE id = $2',
          [created[0].id, sub.id],
        );
        updated[0].linked_contact_id = created[0].id;
      }

      return updated[0];
    });

    if (!row) return res.status(404).json({ error: 'Registration not found' });
    res.json(row);
  } catch (err) {
    console.warn('Registration update failed:', err.message ?? err);
    res.status(503).json({ error: 'Update failed' });
  }
});
