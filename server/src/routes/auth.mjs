import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { ensureDevSession } from '../middleware/devAuth.mjs';
import {
  getOAuthClient,
  isDevAuthEnabled,
  isGoogleConfigured,
  sessionUser,
} from '../lib/authConfig.mjs';
import { normalizeUserEmail } from '../lib/userAdmin.mjs';

export const authRouter = Router();

authRouter.get('/google', (req, res) => {
  const client = getOAuthClient();
  if (!client) {
    return res.status(503).json({
      error: 'Google sign-in is not configured yet. Dev mode is active — use the app directly.',
    });
  }
  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  const client = getOAuthClient();
  if (!client) return res.redirect('/login?error=auth_not_configured');

  try {
    const { tokens } = await client.getToken(String(req.query.code ?? ''));
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error('Google account missing email');

    const verifiedEmail = normalizeUserEmail(payload.email);
    const googleName = String(payload.name ?? '').trim() || verifiedEmail;

    const { rows: existingRows } = await pool.query(
      `SELECT id, email, full_name, role, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [verifiedEmail],
    );

    const existing = existingRows[0];
    if (!existing) return res.redirect('/login?error=not_allowlisted');
    if (!existing.is_active) return res.redirect('/login?error=account_inactive');

    const { rows } = await pool.query(
      `UPDATE users
       SET google_sub = $2,
           full_name = CASE WHEN trim(full_name) = '' THEN $3 ELSE full_name END,
           updated_at = now()
       WHERE id = $1
       RETURNING id, email, full_name, role, is_active`,
      [existing.id, payload.sub, googleName],
    );

    req.session.user = sessionUser(rows[0]);
    res.redirect('/');
  } catch (err) {
    console.error('Google auth failed:', err.message ?? err);
    res.redirect('/login?error=sign_in_failed');
  }
});

authRouter.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

authRouter.get('/me', async (req, res) => {
  if (isDevAuthEnabled()) {
    await ensureDevSession(req);
  }
  if (!req.session?.user) return res.status(401).json({ error: 'Sign in required' });
  res.json(req.session.user);
});

/** Signed-in users only: helps find why a session ends early (no secrets returned). */
authRouter.get('/session-debug', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Sign in required' });
  let stored = null;
  try {
    const { rows } = await pool.query(
      'SELECT expires_at, (SELECT count(*)::int FROM http_sessions WHERE expires_at > now()) AS live FROM http_sessions WHERE sid = $1',
      [req.sessionID],
    );
    stored = rows[0] ?? null;
  } catch (err) { stored = { error: err.message }; }
  res.json({
    pid: process.pid,
    sid_prefix: req.sessionID.slice(0, 6),
    node_env: process.env.NODE_ENV ?? null,
    cookie_secure: Boolean(req.session.cookie.secure),
    cookie_expires: req.session.cookie.expires,
    secure_request: req.secure,
    stored_in_database: Boolean(stored && !stored.error),
    store: stored,
  });
});

/**
 * Dev mode only (no Google sign-in): switch the session to another user to test each role.
 * Both routes answer 404 wherever Google sign-in is configured, as on production.
 */
function devOnly(_req, res, next) {
  if (!isDevAuthEnabled()) return res.status(404).json({ error: 'Not found' });
  next();
}

authRouter.get('/dev-users', devOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, role FROM users WHERE is_active ORDER BY full_name`,
    );
    res.json(rows);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not load users' });
  }
});

authRouter.post('/dev-switch', devOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role FROM users WHERE id::text = $1 AND is_active`,
      [String(req.body?.user_id ?? '')],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    req.session.user = sessionUser(rows[0]);
    res.json(req.session.user);
  } catch (err) {
    res.status(503).json({ error: err.message ?? 'Could not switch user' });
  }
});

authRouter.get('/status', (_req, res) => {
  res.json({
    google_configured: isGoogleConfigured(),
    dev_mode: isDevAuthEnabled(),
  });
});
