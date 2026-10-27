/**
 * Optional Instagram "Connect" using Instagram API with Instagram Login (no Facebook Page needed).
 * The creator signs in with their Instagram account and approves read access once; the stored
 * long-lived token lets us read insights (reach, saves, shares, reposts…) for their own posts.
 *
 * Env: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET (the *Instagram* app id/secret shown under
 *      Use case → API setup with Instagram login), APP_URL (public base URL),
 *      optional META_TOKEN_KEY (token encryption key; defaults to SESSION_SECRET),
 *      META_GRAPH_VERSION (default v23.0).
 * Scopes: instagram_business_basic, instagram_business_manage_insights.
 * Register  {APP_URL}/api/instagram/callback  under "Business login settings" → OAuth redirect URIs.
 * Until the app is Live with advanced access, each creator must be an Instagram Tester of the app.
 */
import crypto from 'node:crypto';

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
export const IG_GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;
const SCOPES = 'instagram_business_basic,instagram_business_manage_insights';
const STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function connectConfigured() {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
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

export function instagramAuthUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
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

/* ── Instagram API calls ── */
async function igJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error || body?.error_message) {
    throw new Error(body?.error?.message ?? body?.error_message ?? `HTTP ${res.status}`);
  }
  return body;
}

/** The short-lived token response comes back either flat or wrapped in a `data` array. */
export function parseTokenResponse(body) {
  const row = Array.isArray(body?.data) ? body.data[0] : body;
  if (!row?.access_token) throw new Error('Instagram did not return an access token');
  return { accessToken: row.access_token, userId: row.user_id != null ? String(row.user_id) : null };
}

/** Code (valid 1 hour, single use) → short-lived token → long-lived token (~60 days). */
export async function exchangeCodeForLongLivedToken(code) {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code: String(code).replace(/#_$/, ''),
  });
  const short = parseTokenResponse(await igJson('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: form,
  }));
  const long = await igJson(`https://graph.instagram.com/access_token?${new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    access_token: short.accessToken,
  })}`);
  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000) : null,
    userId: short.userId,
  };
}

/** Long-lived tokens refresh for another ~60 days (token must be 24h+ old and not expired). */
export async function refreshToken(token) {
  const r = await igJson(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token,
  })}`);
  return {
    token: r.access_token,
    expiresAt: r.expires_in ? new Date(Date.now() + Number(r.expires_in) * 1000) : null,
  };
}

/** Who approved: the Instagram account id and username behind the token. */
export async function fetchInstagramIdentity(token) {
  const me = await igJson(`${IG_GRAPH}/me?${new URLSearchParams({
    fields: 'user_id,username,account_type',
    access_token: token,
  })}`);
  return { igUserId: String(me.user_id ?? me.id), username: me.username ?? null, accountType: me.account_type ?? null };
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

/** Handle from an Instagram profile URL (https://instagram.com/name/ → name), or null. */
export function handleFromUrl(url) {
  const m = String(url ?? '').trim().match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const h = m?.[1]?.toLowerCase();
  return h && !['p', 'reel', 'reels', 'stories', 'explore', 'tv'].includes(h) ? h : null;
}

/**
 * The approving account must be the creator's own. If the contact has no Instagram link we can't
 * tell, so it's allowed; otherwise the handles have to match (case-insensitive).
 */
export function accountMatchesContact(connectedUsername, contactInstagramUrl) {
  const expected = handleFromUrl(contactInstagramUrl);
  if (!expected || !connectedUsername) return true;
  return expected === String(connectedUsername).toLowerCase();
}

/* ── request message (WhatsApp / email) ── */
export function buildRequestMessage({ name, link }) {
  const first = String(name ?? '').trim().split(/\s+/)[0] || 'there';
  return (
    `Hi ${first}, this is Brand Catapult. To show your post performance (reach, saves, shares) `
    + `in the campaign report, we need read-only access to your Instagram insights.\n\n`
    + `Please tap this link and approve (takes 30 seconds, you can remove access any time):\n${link}\n\n`
    + `You'll sign in with your Instagram (it must be a Business or Creator account). Thank you!`
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
