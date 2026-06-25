/** Default admin-managed lists — seeded idempotently when tables are empty. */
import { ensureCities } from './cities.mjs';

export const DEFAULT_CREATOR_CATEGORIES = [
  'Food & Beverage',
  'Beauty',
  'Lifestyle',
  'Luxury',
  'Travel',
  'Tech',
  'Fashion',
  'Fitness',
  'Parenting',
  'Finance',
  'Auto',
  'UGC',
];

export const DEFAULT_TAGS = [
  'Luxury',
  'Hospitality',
  'Celebrity',
  'Reliable',
  'Delhi',
  'Mumbai',
  'High Conversion',
  'Trending',
  'Alco Bev',
  'Chef',
  'Stylist',
  'Interior',
  'UGC',
  'Parenting',
  'Camellias',
];

export async function ensureReferenceData(client) {
  const [{ rows: catRows }, { rows: tagRows }] = await Promise.all([
    client.query('SELECT count(*)::int AS n FROM categories'),
    client.query('SELECT count(*)::int AS n FROM tags'),
  ]);

  await ensureCities(client);

  if (catRows[0].n === 0) {
    for (const name of DEFAULT_CREATOR_CATEGORIES) {
      await client.query(
        `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }
  }

  if (tagRows[0].n === 0) {
    for (const name of DEFAULT_TAGS) {
      await client.query(
        `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }
  }
}
