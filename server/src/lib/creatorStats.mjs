/** Read/write helpers for creator social stats and per-deliverable metrics. */
import { deliverableContentUrls } from './socialSync.mjs';

const METRIC_FIELDS = ['likes', 'comments', 'views', 'reach', 'shares', 'reposts', 'saves'];

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
