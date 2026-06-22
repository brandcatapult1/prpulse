import { pool, isDatabaseConfigured } from '../db.mjs';
import { isDevAuthEnabled, sessionUser } from '../lib/authConfig.mjs';

const DEV_EMAIL = 'dev@brandcatapult.local';
export const DEV_PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000001';

function isPlaceholderDevUser(user) {
  return user?.id === DEV_PLACEHOLDER_USER_ID;
}

export async function getOrCreateDevUser() {
  if (!pool) {
    throw new Error('Database not configured');
  }
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
  if (!isDevAuthEnabled()) return req.session?.user ?? null;

  const needsRealUser =
    !req.session?.user
    || (isDatabaseConfigured() && isPlaceholderDevUser(req.session.user));

  if (!needsRealUser) return req.session.user;

  if (!isDatabaseConfigured()) {
    if (!req.session?.user) {
      req.session.user = sessionUser({
        id: DEV_PLACEHOLDER_USER_ID,
        email: DEV_EMAIL,
        full_name: 'Dev User',
        role: 'admin',
      });
      req.user = req.session.user;
    }
    return req.session.user;
  }

  const user = await getOrCreateDevUser();
  req.session.user = sessionUser(user);
  req.user = req.session.user;
  return req.session.user;
}

export async function devAuthMiddleware(req, _res, next) {
  if (!isDevAuthEnabled()) return next();
  try {
    await ensureDevSession(req);
  } catch (err) {
    console.warn('Dev auth fallback — database unavailable:', err.message ?? err);
    if (!req.session?.user) {
      req.session.user = sessionUser({
        id: DEV_PLACEHOLDER_USER_ID,
        email: DEV_EMAIL,
        full_name: 'Dev User',
        role: 'admin',
      });
      req.user = req.session.user;
    }
  }
  next();
}
