/**
 * System labels New / Recent / Frequent are derived and self-expiring.
 * Run: npm run db:test:system-tags
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL — skipping system-tags tests');
    process.exit(0);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const labels = async (contactId) => {
    const { rows } = await client.query(
      `SELECT t.name FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_id = $1 AND t.type = 'system' ORDER BY t.name`,
      [contactId],
    );
    return rows.map((r) => r.name);
  };

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_user_id = ''`);

    const user = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('system-tags@test.local', 'Sys Tester', 'campaign_manager') RETURNING id`,
    );
    const userId = user.rows[0].id;
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);

    const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('Sys Brand') RETURNING id`);
    const contact = await client.query(
      `INSERT INTO contacts (full_name, mobile_number, source, created_by)
       VALUES ('Sys Creator', '+919444444444', 'manual_entry', $1) RETURNING id`,
      [userId],
    );
    const contactId = contact.rows[0].id;

    assert((await labels(contactId)).join() === 'New', 'new contact gets New immediately');

    await client.query(`UPDATE contacts SET created_at = now() - interval '44 days' WHERE id = $1`, [contactId]);
    await client.query('SELECT recompute_contact_system_tags(NULL)');
    assert((await labels(contactId)).includes('New'), 'still New at 44 days');

    await client.query(`UPDATE contacts SET created_at = now() - interval '50 days' WHERE id = $1`, [contactId]);
    await client.query('SELECT recompute_contact_system_tags(NULL)');
    assert((await labels(contactId)).length === 0, 'New removed after 45 days');

    const completeEngagement = async (n, daysAgo) => {
      const camp = await client.query(
        `INSERT INTO campaigns (campaign_name, brand_id, status, created_by)
         VALUES ($1, $2, 'active', $3) RETURNING id`,
        [`Sys Campaign ${n}`, brand.rows[0].id, userId],
      );
      const eng = await client.query(
        `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, conversation_status, created_by)
         VALUES ($1, $2, $3, 'awaiting_final_deliverables', $3) RETURNING id`,
        [contactId, camp.rows[0].id, userId],
      );
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, quantity, status)
         VALUES ($1, 'reel', 1, 'pending')`,
        [eng.rows[0].id],
      );
      await client.query(
        `UPDATE deliverables SET status = 'posted', published_date = CURRENT_DATE,
           content_link = 'https://instagram.com/p/sys-${n}' WHERE engagement_id = $1`,
        [eng.rows[0].id],
      );
      await client.query(
        `UPDATE engagements SET conversation_status = 'collaboration_complete', primary_collaboration_reason = 'virality' WHERE id = $1`,
        [eng.rows[0].id],
      );
      await client.query(
        `UPDATE engagements SET completed_at = now() - ($2 || ' days')::interval WHERE id = $1`,
        [eng.rows[0].id, String(daysAgo)],
      );
      return eng.rows[0].id;
    };

    const e1 = await completeEngagement(1, 20);
    await client.query('SELECT recompute_contact_system_tags(NULL)');
    assert((await labels(contactId)).join() === '', 'completion 20 days ago is not Recent');

    await client.query(`UPDATE engagements SET completed_at = now() - interval '3 days' WHERE id = $1`, [e1]);
    await client.query('SELECT recompute_contact_system_tags(NULL)');
    assert((await labels(contactId)).join() === 'Recent', 'completion 3 days ago is Recent');

    await completeEngagement(2, 30);
    await completeEngagement(3, 50);
    await client.query('SELECT recompute_contact_system_tags(NULL)');
    assert((await labels(contactId)).join() === 'Frequent,Recent', '3 completions in 60d => Frequent (+Recent)');

    await client.query(`UPDATE engagements SET completed_at = now() - interval '70 days' WHERE id = $1`, [e1]);
    await client.query('SELECT recompute_contact_system_tags(NULL)');
    assert((await labels(contactId)).length === 0, 'Frequent and Recent drop when window passes');

    await client.query('ROLLBACK');
    console.log('system-tags tests passed.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
