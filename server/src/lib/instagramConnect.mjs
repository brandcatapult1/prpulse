/**
 * Optional Instagram "Connect" (Facebook Login) so a creator can let us read their own insights.
 * Env: META_APP_ID, META_APP_SECRET, APP_URL (public base URL), optional META_TOKEN_KEY,
 *      META_GRAPH_VERSION (default v23.0).
 * Scopes: instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement.
 * The creator's IG account must be Business/Creator and linked to a Facebook Page.
 * Register  {APP_URL}/api/instagram/callback  as a Valid OAuth Redirect URI in the Meta app.
 */
import crypto from 'node:crypto';

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SCOPES = 'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement';
const STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function connectConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function secret() {
  return process.env.META_TOKEN_KEY || process.env.SESSION_SECRET || 'dev-only-change-me';
}

export function appBase() {
  return (process.env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');
}

export function redirectUri() {
  return `${appBase()}/api/instagram/callback`;
}

/* ── signed state: carries the contact id through the OAuth round trip ── */
export function signState(contactId, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ c: contactId, e: now + STATE_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state, now = Date.now()) {
  const [body, sig] = String(state ?? '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { c, e } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return e > now ? c : null;
  } catch {
    return null;
  }
}

export function connectLink(contactId) {
  return `${appBase()}/api/instagram/connect?state=${encodeURIComponent(signState(contactId))}`;
}

export function facebookAuthUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: redirectUri(),
    state,
    scope: SCOPES,
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${q}`;
}

/* ── token encryption (AES-256-GCM) ── */
function key() {
  return crypto.createHash('sha256').update(secret()).digest();
}

export function encryptToken(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decryptToken(stored) {
  const [iv, tag, enc] = String(stored).split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/* ── Graph calls ── */
async function graph(path, params) {
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body;
}

export async function extendToken(token) {
  const long = await graph('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: token,
  });
  const expiresAt = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000) : null;
  return { token: long.access_token, expiresAt };
}

export async function exchangeCodeForLongLivedToken(code) {
  const short = await graph('/oauth/access_token', {
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: redirectUri(),
    code,
  });
  return extendToken(short.access_token);
}

/** First Facebook Page of the user that has an Instagram professional account. */
export async function findInstagramAccount(userToken) {
  const pages = await graph('/me/accounts', {
    fields: 'instagram_business_account{id,username}',
    access_token: userToken,
  });
  const hit = (pages.data ?? []).find((p) => p.instagram_business_account?.id);
  if (!hit) {
    throw new Error(
      'No Instagram Business/Creator account found. It must be linked to a Facebook Page you manage.',
    );
  }
  return {
    igUserId: hit.instagram_business_account.id,
    username: hit.instagram_business_account.username ?? null,
  };
}

export async function saveConnection(pool, contactId, { igUserId, username, token, expiresAt }) {
  await pool.query(
    `INSERT INTO creator_instagram_connections
       (contact_id, ig_user_id, ig_username, access_token_enc, token_expires_at, status, last_error)
     VALUES ($1,$2,$3,$4,$5,'connected',NULL)
     ON CONFLICT (contact_id) DO UPDATE SET
       ig_user_id = EXCLUDED.ig_user_id, ig_username = EXCLUDED.ig_username,
       access_token_enc = EXCLUDED.access_token_enc, token_expires_at = EXCLUDED.token_expires_at,
       status = 'connected', last_error = NULL, connected_at = now(), updated_at = now()`,
    [contactId, igUserId, username, encryptToken(token), expiresAt],
  );
}

export async function loadConnection(pool, contactId) {
  const { rows } = await pool.query(
    `SELECT contact_id, ig_user_id, ig_username, access_token_enc, token_expires_at, status, last_error, connected_at
     FROM creator_instagram_connections WHERE contact_id = $1`,
    [contactId],
  );
  return rows[0] ?? null;
}

export function publicConnection(row) {
  if (!row) return null;
  const { access_token_enc, ...safe } = row;
  return safe;
}

/* ── request message (WhatsApp / email) ── */
export function buildRequestMessage({ name, link }) {
  const first = String(name ?? '').trim().split(/\s+/)[0] || 'there';
  return (
    `Hi ${first}, this is Brand Catapult. To show your post performance (reach, saves, shares) `
    + `in the campaign report, we need read-only access to your Instagram insights.\n\n`
    + `Please tap this link and approve (takes 30 seconds, you can remove access any time):\n${link}\n\n`
    + `Your Instagram must be a Business or Creator account linked to a Facebook Page. Thank you!`
  );
}

export function whatsappUrl(mobile, message) {
  const digits = String(mobile ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function mailtoUrl(email, message) {
  if (!email) return null;
  const subject = 'Brand Catapult — approve Instagram insights access';
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
