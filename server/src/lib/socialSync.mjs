/**
 * Social stats + post metrics sync.
 *
 * Instagram: Meta Graph "Business Discovery" (public Business/Creator accounts), run
 *   through one of our own IG Business accounts.
 *   Env: META_ACCESS_TOKEN, META_IG_USER_ID. Gives followers/following/posts and
 *   per-post likes + comments. Reach, shares, reposts and saves are NOT exposed for
 *   other accounts — those stay manual (source = 'manual').
 *
 * Without credentials, sync reports "not configured" and manual entry still works.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

export function syncProviders() {
  return {
    instagram: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID),
  };
}

function normalizeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function detectPlatform(url) {
  const u = normalizeUrl(url);
  if (!u) return null;
  if (/instagram\.com/i.test(u)) return 'instagram';
  return null;
}

export function instagramHandle(url) {
  const u = normalizeUrl(url);
  if (!u) return null;
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean)[0];
    if (!seg || ['p', 'reel', 'reels', 'stories', 'explore', 'tv'].includes(seg)) return null;
    return seg.replace(/^@/, '');
  } catch {
    return null;
  }
}

export function instagramShortcode(url) {
  const m = String(url ?? '').match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

const num = (v) => (v == null || v === '' ? null : Number(v));

/** Followers/following/posts + a map shortcode → {likes, comments} for recent media. */
export async function fetchInstagramProfile(handle, { mediaLimit = 50 } = {}) {
  const { META_ACCESS_TOKEN: token, META_IG_USER_ID: igId } = process.env;
  if (!token || !igId) throw new Error('Instagram sync not configured (META_ACCESS_TOKEN / META_IG_USER_ID)');
  const fields = `business_discovery.username(${handle}){followers_count,follows_count,media_count,`
    + `media.limit(${mediaLimit}){permalink,like_count,comments_count,view_count}}`;
  const body = await getJson(
    `${GRAPH}/${igId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
  );
  const bd = body.business_discovery ?? {};
  const posts = new Map();
  for (const m of bd.media?.data ?? []) {
    const code = instagramShortcode(m.permalink);
    if (code) posts.set(code, { likes: num(m.like_count), comments: num(m.comments_count), views: num(m.view_count) });
  }
  return {
    followers: num(bd.followers_count),
    following: num(bd.follows_count),
    posts_count: num(bd.media_count),
    posts,
  };
}

/** All distinct content URLs on a deliverable (row link + per-unit proofs). */
export function deliverableContentUrls(d) {
  const urls = [];
  const add = (u) => {
    const n = normalizeUrl(u);
    if (n && !urls.includes(n)) urls.push(n);
  };
  add(d.content_link);
  (Array.isArray(d.unit_proofs) ? d.unit_proofs : []).forEach((p) => add(p?.content_link));
  return urls;
}

const STATS_UPSERT = `
  INSERT INTO creator_social_stats
    (contact_id, platform, handle, followers, following, posts_count, total_views, source, synced_at, sync_error)
  VALUES ($1,$2,$3,$4,$5,$6,$7,'api',now(),NULL)
  ON CONFLICT (contact_id, platform) DO UPDATE SET
    handle = EXCLUDED.handle,
    followers = EXCLUDED.followers, following = EXCLUDED.following,
    posts_count = EXCLUDED.posts_count, total_views = EXCLUDED.total_views,
    source = 'api', synced_at = now(), sync_error = NULL, updated_at = now()`;

const STATS_ERROR = `
  INSERT INTO creator_social_stats (contact_id, platform, handle, source, sync_error)
  VALUES ($1,$2,$3,'api',$4)
  ON CONFLICT (contact_id, platform) DO UPDATE SET sync_error = EXCLUDED.sync_error, updated_at = now()`;

/**
 * Sync one creator: profile stats on each linked platform, and metrics for the
 * completed (posted) deliverable links on that platform. Never overwrites a metric
 * a person entered manually (reach/shares/reposts/saves are only filled when null).
 */
export async function syncContactSocial(pool, contactId) {
  const enabled = syncProviders();
  const { rows: [contact] } = await pool.query(
    'SELECT id, instagram_url FROM contacts WHERE id = $1',
    [contactId],
  );
  if (!contact) throw Object.assign(new Error('Contact not found'), { status: 404 });

  const { rows: deliverables } = await pool.query(
    `SELECT d.id, d.content_link, d.unit_proofs
     FROM deliverables d JOIN engagements e ON e.id = d.engagement_id
     WHERE e.contact_id = $1 AND d.status = 'posted'`,
    [contactId],
  );

  const result = { instagram: 'skipped', metrics_updated: 0 };

  const saveMetric = async (deliverableId, url, platform, m) => {
    await pool.query(
      `INSERT INTO deliverable_metrics
         (deliverable_id, content_url, platform, likes, comments, views, source, synced_at, sync_error)
       VALUES ($1,$2,$3,$4,$5,$6,'api',now(),NULL)
       ON CONFLICT (deliverable_id, content_url) DO UPDATE SET
         likes = EXCLUDED.likes, comments = EXCLUDED.comments,
         views = COALESCE(EXCLUDED.views, deliverable_metrics.views),
         platform = EXCLUDED.platform, synced_at = now(), sync_error = NULL, updated_at = now()`,
      [deliverableId, url, platform, m.likes ?? null, m.comments ?? null, m.views ?? null],
    );
    result.metrics_updated += 1;
  };

  const handle = instagramHandle(contact.instagram_url);
  if (handle) {
    if (!enabled.instagram) {
      result.instagram = 'not_configured';
    } else {
      try {
        const p = await fetchInstagramProfile(handle);
        await pool.query(STATS_UPSERT, [contactId, 'instagram', handle, p.followers, p.following, p.posts_count, null]);
        for (const d of deliverables) {
          for (const url of deliverableContentUrls(d)) {
            const hit = p.posts.get(instagramShortcode(url));
            if (hit) await saveMetric(d.id, url, 'instagram', hit);
          }
        }
        result.instagram = 'ok';
      } catch (err) {
        await pool.query(STATS_ERROR, [contactId, 'instagram', handle, err.message]);
        result.instagram = `error: ${err.message}`;
      }
    }
  }

  return result;
}

/** Sync every active contact with a linked profile (sequential, rate-friendly). */
export async function syncAllContactsSocial(pool, { delayMs = 500 } = {}) {
  const { rows } = await pool.query(
    `SELECT id FROM contacts
     WHERE status = 'active' AND instagram_url IS NOT NULL`,
  );
  let ok = 0;
  for (const { id } of rows) {
    try {
      await syncContactSocial(pool, id);
      ok += 1;
    } catch (err) {
      console.warn('Social sync failed for contact', id, err.message);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { contacts: rows.length, synced: ok };
}
