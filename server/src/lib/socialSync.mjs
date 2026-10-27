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

import {
  GRAPH_VERSION,
  IG_GRAPH,
  connectConfigured,
  decryptToken,
  loadConnection,
  refreshToken,
  saveConnection,
} from './instagramConnect.mjs';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function syncProviders() {
  return {
    instagram: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID),
    connect: connectConfigured(),
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

/** Latest public posts of an account (read-only) — handy for picking real deliverables. */
export async function fetchLatestInstagramMedia(handle, limit = 12) {
  const { META_ACCESS_TOKEN: token, META_IG_USER_ID: igId } = process.env;
  if (!token || !igId) throw new Error('Instagram sync not configured (META_ACCESS_TOKEN / META_IG_USER_ID)');
  const fields = `business_discovery.username(${handle}){username,followers_count,follows_count,media_count,`
    + `media.limit(${limit}){permalink,media_type,media_product_type,timestamp,like_count,comments_count,view_count}}`;
  const body = await getJson(
    `${GRAPH}/${igId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
  );
  const bd = body.business_discovery ?? {};
  return {
    username: bd.username ?? handle,
    followers: num(bd.followers_count),
    following: num(bd.follows_count),
    posts_count: num(bd.media_count),
    media: (bd.media?.data ?? []).map((m) => ({
      permalink: m.permalink,
      media_type: m.media_type,
      product_type: m.media_product_type ?? null,
      timestamp: m.timestamp,
      likes: num(m.like_count),
      comments: num(m.comments_count),
      views: num(m.view_count),
    })),
  };
}

/**
 * Followers/following/posts + a map shortcode → {likes, comments, views}.
 * Pages back through the account's posts (50 per page) until every wanted shortcode is found
 * or `maxPages` is reached, so older deliverables are still matched.
 */
const INSIGHT_METRICS = ['reach', 'saved', 'shares', 'views', 'likes', 'comments'];

function insightsToMetrics(data) {
  const out = {};
  for (const m of data ?? []) {
    const v = m.total_value?.value ?? m.values?.[0]?.value;
    if (v == null) continue;
    out[m.name === 'saved' ? 'saves' : m.name] = Number(v);
  }
  return out;
}

/** One call for all metrics; if a post type rejects one, retry metric by metric. */
export async function fetchMediaInsights(mediaId, token, base = IG_GRAPH) {
  const notes = [];
  const attach = (out) => Object.defineProperty(out, 'notes', { value: notes, enumerable: false });
  try {
    const body = await getJson(
      `${base}/${mediaId}/insights?${new URLSearchParams({ metric: INSIGHT_METRICS.join(','), access_token: token })}`,
    );
    return attach(insightsToMetrics(body.data));
  } catch (err) {
    if (/\(#190\)|access token|OAuthException/i.test(err.message)) throw err;
    const merged = {};
    for (const metric of INSIGHT_METRICS) {
      try {
        const body = await getJson(
          `${base}/${mediaId}/insights?${new URLSearchParams({ metric, access_token: token })}`,
        );
        Object.assign(merged, insightsToMetrics(body.data));
      } catch (e) {
        // metric not supported for this media type — leave it unset, but keep the reason for diagnosis
        notes.push(`${metric}: ${String(e.message).slice(0, 160)}`);
      }
    }
    return attach(merged);
  }
}

/**
 * Fallback for counts the insights call did not return: reads shares/saves straight from the
 * media object. Failures are recorded as notes (Instagram may reject these fields for some tokens).
 */
export async function fillFromMediaFields(mediaId, token, ins, base = IG_GRAPH) {
  const missing = [['shares', 'shares_count'], ['saves', 'saved_count']]
    .filter(([k]) => ins[k] == null);
  if (!missing.length) return ins;
  try {
    const body = await getJson(
      `${base}/${mediaId}?${new URLSearchParams({ fields: missing.map(([, f]) => f).join(','), access_token: token })}`,
    );
    for (const [k, f] of missing) if (body[f] != null) ins[k] = Number(body[f]);
  } catch (e) {
    ins.notes?.push(`media fields: ${String(e.message).slice(0, 160)}`);
  }
  return ins;
}

/** Recent posts of the approving account (Instagram host), paged until every wanted shortcode is found. */
async function fetchConnectedMedia(token, wantedCodes) {
  const media = new Map();
  let next = `${IG_GRAPH}/me/media?${new URLSearchParams({
    fields: 'id,permalink,like_count,comments_count',
    limit: '50',
    access_token: token,
  })}`;
  for (let page = 0; next && page < 40; page += 1) {
    const body = await getJson(next);
    for (const m of body.data ?? []) {
      const code = instagramShortcode(m.permalink);
      if (code) media.set(code, m);
    }
    if ([...wantedCodes].every((c) => media.has(c))) break;
    next = body.paging?.next ?? null;
  }
  return media;
}

/**
 * Average views and engagement rate over the account's latest `n` posts/reels (newest first).
 * avg_views = mean views of those posts that report views; engagement_rate = mean (likes + comments)
 * per post / followers, as a percentage rounded to 2 decimals.
 */
export function latestPostStats(media, followers, n = 5) {
  const latest = (media ?? []).slice(0, n);
  if (!latest.length) return { avg_views: null, engagement_rate: null };
  const viewed = latest.filter((m) => m.views != null);
  const avgViews = viewed.length ? viewed.reduce((a, m) => a + m.views, 0) / viewed.length : null;
  const inter = latest.reduce((a, m) => a + (m.likes ?? 0) + (m.comments ?? 0), 0) / latest.length;
  const rate = followers > 0 ? Math.round((inter / followers) * 10000) / 100 : null;
  return { avg_views: avgViews == null ? null : Math.round(avgViews), engagement_rate: rate };
}

export async function fetchInstagramProfile(handle, { wantedCodes = [], mediaLimit = 50, maxPages = 30 } = {}) {
  const { META_ACCESS_TOKEN: token, META_IG_USER_ID: igId } = process.env;
  if (!token || !igId) throw new Error('Instagram sync not configured (META_ACCESS_TOKEN / META_IG_USER_ID)');
  const wanted = new Set(wantedCodes);
  const posts = new Map();
  let profile = null;
  let latest = [];
  let after = null;

  for (let page = 0; page < maxPages; page += 1) {
    const mediaArg = `media.limit(${mediaLimit})${after ? `.after(${after})` : ''}`;
    const fields = `business_discovery.username(${handle}){followers_count,follows_count,media_count,`
      + `${mediaArg}{permalink,like_count,comments_count,view_count}}`;
    const body = await getJson(
      `${GRAPH}/${igId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
    );
    const bd = body.business_discovery ?? {};
    if (!profile) {
      profile = bd;
      latest = (bd.media?.data ?? []).map((m) => ({ likes: num(m.like_count), comments: num(m.comments_count), views: num(m.view_count) }));
    }
    for (const m of bd.media?.data ?? []) {
      const code = instagramShortcode(m.permalink);
      if (code) posts.set(code, { likes: num(m.like_count), comments: num(m.comments_count), views: num(m.view_count) });
    }
    after = bd.media?.paging?.cursors?.after ?? null;
    const done = wanted.size === 0 || [...wanted].every((c) => posts.has(c));
    if (done || !after || !bd.media?.paging?.cursors?.after || (bd.media?.data ?? []).length === 0) break;
  }

  return {
    followers: num(profile?.followers_count),
    following: num(profile?.follows_count),
    posts_count: num(profile?.media_count),
    ...latestPostStats(latest, num(profile?.followers_count)),
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
    (contact_id, platform, handle, followers, following, posts_count, total_views, avg_views, engagement_rate, source, synced_at, sync_error)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'api',now(),NULL)
  ON CONFLICT (contact_id, platform) DO UPDATE SET
    handle = EXCLUDED.handle,
    followers = EXCLUDED.followers, following = EXCLUDED.following,
    posts_count = EXCLUDED.posts_count, total_views = EXCLUDED.total_views,
    avg_views = EXCLUDED.avg_views, engagement_rate = EXCLUDED.engagement_rate,
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

  // Creators who approved our app: read their own insights (reach, saves, shares…).
  let connectedOk = false;
  const conn = await loadConnection(pool, contactId);
  if (conn && enabled.connect) {
    try {
      let token = decryptToken(conn.access_token_enc);
      const daysLeft = conn.token_expires_at
        ? (new Date(conn.token_expires_at).getTime() - Date.now()) / 86_400_000
        : null;
      if (daysLeft != null && daysLeft < 15) {
        const fresh = await refreshToken(token);
        token = fresh.token;
        await saveConnection(pool, contactId, {
          igUserId: conn.ig_user_id, username: conn.ig_username, token, expiresAt: fresh.expiresAt,
        });
      }
      const links = [];
      for (const d of deliverables) {
        for (const url of deliverableContentUrls(d)) {
          const code = instagramShortcode(url);
          if (code) links.push({ d, url, code });
        }
      }
      // Only the posts are read here. The creator's audience always comes from their own public profile.
      const media = await fetchConnectedMedia(token, new Set(links.map((l) => l.code)));
      for (const l of links) {
        const m = media.get(l.code);
        if (!m) continue;
        const ins = await fillFromMediaFields(m.id, token, await fetchMediaInsights(m.id, token));
        await pool.query(
          `INSERT INTO deliverable_metrics
             (deliverable_id, content_url, platform, likes, comments, views, reach, shares, reposts, saves,
              source, synced_at, sync_error)
           VALUES ($1,$2,'instagram',$3,$4,$5,$6,$7,$8,$9,'insights',now(),$10)
           ON CONFLICT (deliverable_id, content_url) DO UPDATE SET
             likes = EXCLUDED.likes, comments = EXCLUDED.comments, views = EXCLUDED.views,
             reach = EXCLUDED.reach, shares = EXCLUDED.shares, reposts = EXCLUDED.reposts,
             saves = EXCLUDED.saves, platform = 'instagram', source = 'insights',
             synced_at = now(), sync_error = EXCLUDED.sync_error, updated_at = now()`,
          [l.d.id, l.url, ins.likes ?? num(m.like_count), ins.comments ?? num(m.comments_count),
            ins.views ?? null, ins.reach ?? null, ins.shares ?? null, ins.reposts ?? null, ins.saves ?? null,
            ins.notes?.length ? `Instagram did not return: ${ins.notes.join('; ')}`.slice(0, 500) : null],
        );
        result.metrics_updated += 1;
      }
      await pool.query(
        `UPDATE creator_instagram_connections SET status = 'connected', last_error = NULL, updated_at = now()
         WHERE contact_id = $1`, [contactId],
      );
      result.instagram = 'ok (insights)';
      connectedOk = true;
    } catch (err) {
      const expired = /\(#190\)|access token|session has expired|Error validating/i.test(err.message);
      await pool.query(
        `UPDATE creator_instagram_connections SET status = $2, last_error = $3, updated_at = now()
         WHERE contact_id = $1`,
        [contactId, expired ? 'expired' : 'error', err.message],
      );
      result.instagram = `insights unavailable (${err.message}); using public data`;
    }
  }

  // Public data for the creator's own profile and posts — runs for everyone, connected or not.
  const handle = instagramHandle(contact.instagram_url);
  if (handle) {
    if (!enabled.instagram) {
      result.instagram = 'not_configured';
    } else {
      try {
        const wantedCodes = deliverables
          .flatMap((d) => deliverableContentUrls(d))
          .map((u) => instagramShortcode(u))
          .filter(Boolean);
        const p = await fetchInstagramProfile(handle, { wantedCodes });
        await pool.query(STATS_UPSERT, [contactId, 'instagram', handle, p.followers, p.following, p.posts_count, null, p.avg_views, p.engagement_rate]);
        for (const d of deliverables) {
          for (const url of deliverableContentUrls(d)) {
            const hit = p.posts.get(instagramShortcode(url));
            if (hit) await saveMetric(d.id, url, 'instagram', hit);
          }
        }
        if (!connectedOk) result.instagram = 'ok';
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
