/** Read/write helpers for creator social stats and per-deliverable metrics. */
import { deliverableContentUrls } from './socialSync.mjs';

const METRIC_FIELDS = ['likes', 'comments', 'views', 'reach', 'shares', 'reposts', 'saves'];
const STAT_FIELDS = ['followers', 'following', 'posts_count', 'total_views'];

function parseCount(value, label) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw Object.assign(new Error(`${label} must be a non-negative whole number`), { status: 400 });
  }
  return n;
}

export async function loadCreatorStats(client, contactId) {
  const { rows: social } = await client.query(
    `SELECT platform, handle, followers, following, posts_count, total_views,
            source, synced_at, sync_error
     FROM creator_social_stats WHERE contact_id = $1 ORDER BY platform`,
    [contactId],
  );

  const { rows: deliverables } = await client.query(
    `SELECT d.id AS deliverable_id, d.deliverable_type, d.quantity, d.content_link, d.unit_proofs,
            d.published_date, e.id AS engagement_id, e.campaign_id,
            cam.campaign_name, b.brand_name
     FROM deliverables d
     JOIN engagements e ON e.id = d.engagement_id
     JOIN campaigns cam ON cam.id = e.campaign_id
     JOIN brands b ON b.id = cam.brand_id
     WHERE e.contact_id = $1 AND d.status = 'posted'
     ORDER BY d.published_date DESC NULLS LAST, d.created_at DESC`,
    [contactId],
  );

  const { rows: metrics } = await client.query(
    `SELECT m.* FROM deliverable_metrics m
     JOIN deliverables d ON d.id = m.deliverable_id
     JOIN engagements e ON e.id = d.engagement_id
     WHERE e.contact_id = $1`,
    [contactId],
  );
  const byDeliverable = new Map();
  for (const m of metrics) {
    if (!byDeliverable.has(m.deliverable_id)) byDeliverable.set(m.deliverable_id, []);
    byDeliverable.get(m.deliverable_id).push(m);
  }

  const items = deliverables.map((d) => {
    const urls = deliverableContentUrls(d);
    const known = byDeliverable.get(d.deliverable_id) ?? [];
    const rows = urls.map((url) => known.find((m) => m.content_url === url) ?? { content_url: url });
    // metrics rows for links no longer on the deliverable still count
    known.filter((m) => !urls.includes(m.content_url)).forEach((m) => rows.push(m));
    const totals = Object.fromEntries(
      METRIC_FIELDS.map((f) => [f, rows.reduce((s, r) => s + Number(r[f] ?? 0), 0)]),
    );
    return {
      deliverable_id: d.deliverable_id,
      engagement_id: d.engagement_id,
      campaign_id: d.campaign_id,
      campaign_name: d.campaign_name,
      brand_name: d.brand_name,
      deliverable_type: d.deliverable_type,
      published_date: d.published_date,
      links: rows,
      totals,
    };
  });

  const byCampaign = new Map();
  for (const it of items) {
    const cur = byCampaign.get(it.campaign_id) ?? {
      campaign_id: it.campaign_id,
      campaign_name: it.campaign_name,
      brand_name: it.brand_name,
      completed_deliverables: 0,
      ...Object.fromEntries(METRIC_FIELDS.map((f) => [f, 0])),
    };
    cur.completed_deliverables += 1;
    METRIC_FIELDS.forEach((f) => { cur[f] += it.totals[f]; });
    byCampaign.set(it.campaign_id, cur);
  }

  const totals = Object.fromEntries(METRIC_FIELDS.map((f) => [f, 0]));
  items.forEach((it) => METRIC_FIELDS.forEach((f) => { totals[f] += it.totals[f]; }));

  return {
    social,
    totals: { completed_deliverables: items.length, ...totals },
    campaigns: [...byCampaign.values()],
    deliverables: items,
  };
}

export async function upsertManualSocialStats(client, contactId, platform, body) {
  if (!['instagram', 'youtube'].includes(platform)) {
    throw Object.assign(new Error('platform must be instagram or youtube'), { status: 400 });
  }
  const v = Object.fromEntries(STAT_FIELDS.map((f) => [f, parseCount(body?.[f], f)]));
  await client.query(
    `INSERT INTO creator_social_stats
       (contact_id, platform, followers, following, posts_count, total_views, source, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,'manual',now())
     ON CONFLICT (contact_id, platform) DO UPDATE SET
       followers = EXCLUDED.followers, following = EXCLUDED.following,
       posts_count = EXCLUDED.posts_count, total_views = EXCLUDED.total_views,
       source = 'manual', synced_at = now(), sync_error = NULL, updated_at = now()`,
    [contactId, platform, v.followers, v.following, v.posts_count, v.total_views],
  );
}

export async function upsertManualDeliverableMetrics(client, deliverableId, body) {
  const url = String(body?.content_url ?? '').trim();
  if (!url) throw Object.assign(new Error('content_url is required'), { status: 400 });
  const { rows: [d] } = await client.query(
    `SELECT id, status FROM deliverables WHERE id = $1`,
    [deliverableId],
  );
  if (!d) throw Object.assign(new Error('Deliverable not found'), { status: 404 });
  const v = Object.fromEntries(METRIC_FIELDS.map((f) => [f, parseCount(body?.[f], f)]));
  await client.query(
    `INSERT INTO deliverable_metrics
       (deliverable_id, content_url, likes, comments, views, reach, shares, reposts, saves, source, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',now())
     ON CONFLICT (deliverable_id, content_url) DO UPDATE SET
       likes = EXCLUDED.likes, comments = EXCLUDED.comments, views = EXCLUDED.views,
       reach = EXCLUDED.reach, shares = EXCLUDED.shares, reposts = EXCLUDED.reposts,
       saves = EXCLUDED.saves, source = 'manual', synced_at = now(), sync_error = NULL, updated_at = now()`,
    [deliverableId, url, v.likes, v.comments, v.views, v.reach, v.shares, v.reposts, v.saves],
  );
}
