import { pool } from '../db.mjs';
import { isDevAuthEnabled, sessionUser } from '../lib/authConfig.mjs';

const DEV_EMAIL = 'dev@brandcatapult.local';

export async function getOrCreateDevUser() {
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, role, google_sub)
     VALUES ($1, 'Dev User', 'admin', 'dev-local-session')
     ON CONFLICT (email) DO UPDATE SET updated_at = now()
     RETURNING id, email, full_name, role, is_active`,
    [DEV_EMAIL],
  );
  return rows[0];
}

export async function ensureDevSession(req) {
  if (!isDevAuthEnabled() || req.session?.user) return req.session?.user ?? null;

  const user = await getOrCreateDevUser();
  req.session.user = sessionUser(user);
  req.user = req.session.user;
  return req.session.user;
}

export async function devAuthMiddleware(req, _res, next) {
  if (!isDevAuthEnabled() || req.session?.user) return next();
  try {
    await ensureDevSession(req);
  } catch (err) {
    console.warn('Dev auth fallback — database unavailable:', err.message ?? err);
    req.session.user = sessionUser({
      id: '00000000-0000-0000-0000-000000000001',
      email: DEV_EMAIL,
      full_name: 'Dev User',
      role: 'admin',
    });
    req.user = req.session.user;
  }
  next();
}
