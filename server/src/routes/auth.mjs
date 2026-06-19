import { OAuth2Client } from 'google-auth-library';
import { Router } from 'express';
import { pool } from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

export const authRouter = Router();

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL ?? 'http://localhost:8080';
  if (!clientId || !clientSecret) return null;
  return new OAuth2Client(clientId, clientSecret, `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`);
}

function sessionUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
  };
}

authRouter.get('/google', (req, res) => {
  const client = getOAuthClient();
  if (!client) {
    return res.status(503).json({
      error: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Render.',
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

    const { rows: countRows } = await pool.query('SELECT count(*)::int AS n FROM users');
    const isFirstUser = countRows[0].n === 0;

    const { rows } = await pool.query(
      `INSERT INTO users (google_sub, email, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET google_sub = EXCLUDED.google_sub,
             full_name = EXCLUDED.full_name,
             updated_at = now()
       RETURNING id, email, full_name, role, is_active`,
      [payload.sub, payload.email, payload.name ?? payload.email, isFirstUser ? 'admin' : 'campaign_manager'],
    );

    const user = rows[0];
    if (!user.is_active) return res.redirect('/login?error=account_inactive');

    req.session.user = sessionUser(user);
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

authRouter.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Sign in required' });
  res.json(req.session.user);
});

authRouter.get('/status', (_req, res) => {
  res.json({ google_configured: Boolean(getOAuthClient()) });
});
