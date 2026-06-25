/**
 * Campaign tags + propagation on first counted collaboration.
 * Run: npm run db:test:campaign-tags
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
    console.error('Missing DATABASE_URL — skipping campaign-tags tests');
    process.exit(0);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_user_id = ''`);

    const user = await client.query(
      `INSERT INTO users (email, full_name, role)
       VALUES ('campaign-tags@test.local', 'Tag Tester', 'campaign_manager')
       RETURNING id, full_name, role`,
    );
    const userId = user.rows[0].id;
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);

    const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('Tag Brand') RETURNING id`);
    const campaign = await client.query(
      `INSERT INTO campaigns (campaign_name, brand_id, status, created_by)
       VALUES ('Tag Campaign', $1, 'active', $2) RETURNING id`,
      [brand.rows[0].id, userId],
    );
    const campaignId = campaign.rows[0].id;

    const tag = await client.query(`INSERT INTO tags (name) VALUES ('Luxury Prop') RETURNING id, name`);
    const tagId = tag.rows[0].id;

    await client.query(
      `INSERT INTO campaign_tags (campaign_id, tag_id) VALUES ($1, $2)`,
      [campaignId, tagId],
    );

    const contact = await client.query(
      `INSERT INTO contacts (full_name, mobile_number, source, created_by)
       VALUES ('Tag Creator', '+919333333333', 'manual_entry', $1) RETURNING id`,
      [userId],
    );
    const contactId = contact.rows[0].id;

    const engagement = await client.query(
      `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, conversation_status, created_by)
       VALUES ($1, $2, $3, 'awaiting_final_deliverables', $3) RETURNING id`,
      [contactId, campaignId, userId],
    );
    const engagementId = engagement.rows[0].id;

    await client.query(
      `INSERT INTO deliverables (engagement_id, deliverable_type, quantity, status)
       VALUES ($1, 'reel', 1, 'pending')`,
      [engagementId],
    );

    // Population alone must not propagate
    const beforePop = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1`,
      [contactId],
    );
    assert(beforePop.rows[0].n === 0, 'no tags before completion');

    // Status still open — posting alone must not propagate
    await client.query(
      `UPDATE deliverables SET status = 'posted', published_date = CURRENT_DATE WHERE engagement_id = $1`,
      [engagementId],
    );
    const afterPostOnly = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1`,
      [contactId],
    );
    assert(afterPostOnly.rows[0].n === 0, 'posted deliverable alone does not propagate');

    // Mark complete → first counted → propagate (trigger calls fn_refresh)
    await client.query(
      `UPDATE engagements SET conversation_status = 'collaboration_complete' WHERE id = $1`,
      [engagementId],
    );

    const after = await client.query(
      `SELECT t.name FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = $1`,
      [contactId],
    );
    assert(after.rows.length === 1, 'tag propagated once');
    assert(after.rows[0].name === 'Luxury Prop', 'correct tag propagated');

    const audit = await client.query(
      `SELECT action_type, new_value FROM audit_logs
       WHERE entity_type = 'contact' AND entity_id = $1 AND action_type = 'tag_added'`,
      [contactId],
    );
    assert(audit.rows.length === 1, 'audit row for propagated tag');
    assert(audit.rows[0].new_value?.source === 'campaign_completion', 'audit marks campaign completion');

    // Idempotent — re-run refresh does not duplicate
    await client.query(`SELECT fn_refresh_engagement_completion($1)`, [engagementId]);
    const again = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1`,
      [contactId],
    );
    assert(again.rows[0].n === 1, 'still one tag after recompute');

    // User removes tag — no re-add until another counted completion (new engagement)
    await client.query(`DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`, [contactId, tagId]);
    await client.query(`SELECT fn_refresh_engagement_completion($1)`, [engagementId]);
    const afterRemove = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1`,
      [contactId],
    );
    assert(afterRemove.rows[0].n === 0, 'removed tag stays removed on recompute');

    await client.query('ROLLBACK');
    console.log('campaign-tags tests passed.');
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
