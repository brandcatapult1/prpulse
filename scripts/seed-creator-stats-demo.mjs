/**
 * Dummy data to eyeball creator stats + New/Recent/Frequent labels.
 * All rows are tagged "[DEMO-STATS]" (contact notes / brand name).
 *   node scripts/seed-creator-stats-demo.mjs          add
 *   node scripts/seed-creator-stats-demo.mjs --reset  remove
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const MARK = '[DEMO-STATS]';
const reset = process.argv.includes('--reset');

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function removeDemo() {
  const { rows: c } = await client.query(`SELECT id FROM contacts WHERE notes = $1`, [MARK]);
  const ids = c.map((r) => r.id);
  await client.query(`DELETE FROM engagements WHERE contact_id = ANY($1::uuid[])`, [ids]);
  await client.query(`DELETE FROM contacts WHERE id = ANY($1::uuid[])`, [ids]);
  await client.query(`DELETE FROM campaigns WHERE campaign_name LIKE $1`, [`${MARK}%`]);
  await client.query(`DELETE FROM brands WHERE brand_name LIKE $1`, [`${MARK}%`]);
}

// name, mobile, createdDaysAgo, completions (days ago), instagram stats
const CREATORS = [
  ['Demo New Creator', '+919555000001', 5, [], [48200, 610, 340]],
  ['Demo Recent Creator', '+919555000002', 120, [3], [152000, 420, 810]],
  ['Demo Frequent Creator', '+919555000003', 120, [4, 25, 50], [890000, 310, 1520]],
  ['Demo New And Recent', '+919555000004', 12, [2], [23500, 900, 150]],
  ['Demo Old Creator', '+919555000005', 200, [90], [310000, 200, 970]],
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  await client.connect();
  try {
    await client.query('BEGIN');
    await removeDemo();
    if (reset) {
      await client.query('COMMIT');
      console.log('Demo stats data removed.');
      return;
    }

    const { rows: [user] } = await client.query(
      `SELECT id FROM users WHERE is_active ORDER BY (role = 'admin') DESC LIMIT 1`,
    );
    await client.query(`SET LOCAL app.current_user_id = '${user.id}'`);

    const { rows: [brand] } = await client.query(
      `INSERT INTO brands (brand_name) VALUES ($1) RETURNING id`, [`${MARK} Brand`],
    );
    const campaigns = [];
    for (let i = 1; i <= 3; i += 1) {
      const { rows: [c] } = await client.query(
        `INSERT INTO campaigns (campaign_name, brand_id, status, created_by,
                                campaign_type, term_months, start_date, target_collaborations)
         VALUES ($1, $2, 'active', $3, 'monthly', 6, CURRENT_DATE - 130, 5) RETURNING id`,
        [`${MARK} Campaign ${i}`, brand.id, user.id],
      );
      campaigns.push(c.id);
    }

    for (const [name, mobile, createdAgo, completions, [followers, following, posts]] of CREATORS) {
      const { rows: [contact] } = await client.query(
        `INSERT INTO contacts (full_name, mobile_number, source, created_by, city, classification,
                               instagram_url, notes)
         VALUES ($1, $2, 'manual_entry', $3, 'Mumbai', 'micro', $4, $5) RETURNING id`,
        [name, mobile, user.id, `https://instagram.com/${name.toLowerCase().replace(/\W+/g, '_')}`, MARK],
      );
      const cid = contact.id;
      await client.query(`UPDATE contacts SET created_at = now() - ($2 || ' days')::interval WHERE id = $1`, [cid, String(createdAgo)]);

      await client.query(
        `INSERT INTO creator_social_stats (contact_id, platform, handle, followers, following, posts_count, source, synced_at)
         VALUES ($1,'instagram',$2,$3,$4,$5,'manual',now())`,
        [cid, name.toLowerCase().replace(/\W+/g, '_'), followers, following, posts],
      );
      if (name.includes('Frequent')) {
        await client.query(
          `INSERT INTO creator_social_stats (contact_id, platform, followers, posts_count, total_views, source, synced_at)
           VALUES ($1,'youtube',125000,84,5400000,'manual',now())`, [cid],
        );
      }

      let n = 0;
      for (const daysAgo of completions) {
        n += 1;
        const camp = campaigns[(n - 1) % campaigns.length];
        const { rows: [eng] } = await client.query(
          `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, conversation_status, created_by)
           VALUES ($1,$2,$3,'awaiting_final_deliverables',$3) RETURNING id`,
          [cid, camp, user.id],
        );
        const base = followers / 100;
        // reel / post (enum 'other') / carousel (enum 'static_carousel_post'), each with its own link + numbers
        const kinds = [
          ['reel', 'reel', 'reel', 1],
          ['other', 'p', 'post', 0.45],
          ['static_carousel_post', 'p', 'carousel', 0.7],
        ];
        for (const [dbType, path, tag, k] of kinds) {
          const url = `https://www.instagram.com/${path}/DEMO${tag}${mobile.slice(-1)}${n}/`;
          const { rows: [del] } = await client.query(
            `INSERT INTO deliverables (engagement_id, deliverable_type, quantity, status)
             VALUES ($1,$2,1,'pending') RETURNING id`, [eng.id, dbType],
          );
          await client.query(
            `UPDATE deliverables SET status='posted', posted_quantity = 1, published_date = CURRENT_DATE - $2::int, content_link = $3,
               unit_proofs = jsonb_build_array(jsonb_build_object('content_link', $3::text, 'screenshots', '[]'::jsonb))
             WHERE id = $1`, [del.id, daysAgo, url],
          );
          await client.query(
            `INSERT INTO deliverable_metrics (deliverable_id, content_url, platform, likes, comments, views, reach, shares, reposts, saves, source, synced_at)
             VALUES ($1,$2,'instagram',$3,$4,$5,$6,$7,$8,$9,'manual',now())`,
            [del.id, url, Math.round(base * 9 * k), Math.round(base * 0.6 * k), Math.round(base * 40 * k),
              Math.round(base * 65 * k), Math.round(base * 1.2 * k), Math.round(base * 0.4 * k), Math.round(base * 2.1 * k)],
          );
        }
        await client.query(
          `UPDATE engagements SET conversation_status='collaboration_complete',
             primary_collaboration_reason='virality' WHERE id = $1`, [eng.id],
        );
        await client.query(
          `UPDATE engagements SET completed_at = now() - ($2 || ' days')::interval WHERE id = $1`,
          [eng.id, String(daysAgo)],
        );
      }
    }

    await client.query('SELECT recompute_contact_system_tags(NULL)');
    await client.query('COMMIT');
    console.log('Demo stats data added.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
