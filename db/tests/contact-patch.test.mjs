/**
 * Contact PATCH — full field coverage and mobile dedup on change.
 * Run: npm run db:test:contacts
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { parseContactPatch, applyContactPatch } from '../../server/src/lib/contactDetail.mjs';
import { ensureReferenceData } from '../../server/src/lib/referenceData.mjs';

dotenv.config();

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL — skipping contact-patch tests');
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const user = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('contact-patch@test.local', 'Patch Tester', 'campaign_manager')
       RETURNING id`,
    );
    const userId = user.rows[0].id;

    await ensureReferenceData(client);
    const { rows: tags } = await client.query('SELECT id FROM tags LIMIT 2');
    const { rows: categories } = await client.query('SELECT id FROM categories LIMIT 2');

    const c1 = await client.query(
      `INSERT INTO contacts (full_name, mobile_number, source, created_by, reel_rate)
       VALUES ('Patch One', '+919111111111', 'manual_entry', $1, 10000)
       RETURNING id, reel_rate`,
      [userId],
    );
    const contactId = c1.rows[0].id;

    await client.query(
      `INSERT INTO contacts (full_name, mobile_number, source, created_by)
       VALUES ('Patch Two', '+919222222222', 'manual_entry', $1)
       RETURNING id`,
      [userId],
    );

    const eng = await client.query(
      `INSERT INTO brands (brand_name) VALUES ('Patch Brand') RETURNING id`,
    );
    const brandId = eng.rows[0].id;
    const camp = await client.query(
      `INSERT INTO campaigns (campaign_name, brand_id, status, created_by)
       VALUES ('Patch Camp', $1, 'active', $2) RETURNING id`,
      [brandId, userId],
    );
    await client.query(
      `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, conversation_status, agreed_fee, created_by)
       VALUES ($1, $2, $3, 'collaboration_complete', 50000, $3)`,
      [contactId, camp.rows[0].id, userId],
    );

    // parseContactPatch rejects empty body
    try {
      parseContactPatch({});
      throw new Error('Expected empty patch to fail');
    } catch (err) {
      assert(err.status === 400, 'empty patch → 400');
    }

    // Full patch updates scalars + relations
    const updated = await applyContactPatch(client, contactId, {
      full_name: 'Patch One Updated',
      email: 'one@test.local',
      city: 'Mumbai',
      state: 'MH',
      country: 'India',
      instagram_url: 'https://instagram.com/one',
      youtube_url: 'https://youtube.com/one',
      other_platform_links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/one' }],
      open_to_paid: true,
      open_to_barter: false,
      reel_rate: 15000,
      story_rate: 5000,
      post_rate: 8000,
      other_rate: 2000,
      classification: 'micro',
      status: 'inactive',
      notes: 'Updated via test',
      primary_category_id: categories[0]?.id ?? null,
      tag_ids: tags.map((t) => t.id),
    });

    assert(updated.full_name === 'Patch One Updated', 'full_name updated');
    assert(updated.city === 'Mumbai', 'city updated');
    assert(updated.classification === 'micro', 'classification updated');
    assert(updated.status === 'inactive', 'status updated');
    assert(updated.tags.length === tags.length, 'tags synced');
    assert(updated.reel_rate === '15000.00' || Number(updated.reel_rate) === 15000, 'reel_rate updated');

    // Engagement agreed_fee unchanged (historical immutability)
    const feeRow = await client.query(
      `SELECT agreed_fee FROM engagements WHERE contact_id = $1`,
      [contactId],
    );
    assert(Number(feeRow.rows[0].agreed_fee) === 50000, 'engagement agreed_fee unchanged');

    // Mobile dedup blocks change to existing number
    try {
      await applyContactPatch(client, contactId, { mobile_number: '+919222222222' });
      throw new Error('Expected duplicate mobile to fail');
    } catch (err) {
      assert(err.status === 409, 'duplicate mobile → 409');
    }

    // Invalid tag id rejected
    try {
      await applyContactPatch(client, contactId, { tag_ids: ['00000000-0000-0000-0000-000000000099'] });
      throw new Error('Expected invalid tag to fail');
    } catch (err) {
      assert(err.status === 400, 'invalid tag → 400');
    }

    await client.query('ROLLBACK');
    console.log('contact-patch tests passed.');
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
