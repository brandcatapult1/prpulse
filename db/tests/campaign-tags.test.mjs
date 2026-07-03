/**
 * Campaign-type contact tags are system-derived from counted-complete engagements.
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

    const tag = await client.query(
      `INSERT INTO tags (name, type) VALUES ('Luxury Prop', 'campaign') RETURNING id, name`,
    );
    const tagId = tag.rows[0].id;

    const influencerTag = await client.query(
      `INSERT INTO tags (name, type) VALUES ('Manual Influencer', 'influencer') RETURNING id`,
    );
    const influencerTagId = influencerTag.rows[0].id;

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

    await client.query(
      `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)`,
      [contactId, influencerTagId],
    );

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

    const beforePop = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_id = $1 AND t.type = 'campaign'`,
      [contactId],
    );
    assert(beforePop.rows[0].n === 0, 'no campaign tags before completion');

    await client.query(
      `UPDATE deliverables SET status = 'posted', published_date = CURRENT_DATE WHERE engagement_id = $1`,
      [engagementId],
    );
    const afterPostOnly = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_id = $1 AND t.type = 'campaign'`,
      [contactId],
    );
    assert(afterPostOnly.rows[0].n === 0, 'posted deliverable alone does not derive campaign tags');

    await client.query(
      `UPDATE engagements SET conversation_status = 'collaboration_complete' WHERE id = $1`,
      [engagementId],
    );

    const after = await client.query(
      `SELECT t.name, t.type FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = $1 ORDER BY t.type, t.name`,
      [contactId],
    );
    assert(after.rows.length === 2, 'influencer + campaign tag present');
    assert(after.rows.some((r) => r.name === 'Luxury Prop' && r.type === 'campaign'), 'campaign tag derived');
    assert(after.rows.some((r) => r.name === 'Manual Influencer' && r.type === 'influencer'), 'influencer tag preserved');

    const audit = await client.query(
      `SELECT action_type FROM audit_logs
       WHERE entity_type = 'contact' AND entity_id = $1 AND action_type = 'tag_added'
         AND new_value->>'source' = 'campaign_completion'`,
      [contactId],
    );
    assert(audit.rows.length === 0, 'no audit flood for derived campaign tags');

    // Self-correct: manual delete is restored on recompute
    await client.query(`DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`, [contactId, tagId]);
    await client.query(`SELECT fn_refresh_engagement_completion($1)`, [engagementId]);
    const restored = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`,
      [contactId, tagId],
    );
    assert(restored.rows[0].n === 1, 'recompute restores derived campaign tag');

    // Reopen (no longer counted) removes campaign tag; influencer remains
    await client.query(
      `UPDATE engagements SET conversation_status = 'awaiting_final_deliverables' WHERE id = $1`,
      [engagementId],
    );
    const afterReopen = await client.query(
      `SELECT t.type, t.name FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = $1`,
      [contactId],
    );
    assert(afterReopen.rows.length === 1, 'only influencer tag after reopen');
    assert(afterReopen.rows[0].type === 'influencer', 'influencer tag untouched on reopen');

    // Re-complete restores campaign tag
    await client.query(
      `UPDATE engagements SET conversation_status = 'collaboration_complete' WHERE id = $1`,
      [engagementId],
    );
    const afterRecomplete = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`,
      [contactId, tagId],
    );
    assert(afterRecomplete.rows[0].n === 1, 're-complete restores campaign tag');

    // Campaign tag-set change: remove tag from campaign → contact loses it
    await client.query(`DELETE FROM campaign_tags WHERE campaign_id = $1 AND tag_id = $2`, [campaignId, tagId]);
    await client.query(`SELECT recompute_contacts_for_campaign_tags($1)`, [campaignId]);
    const afterUntag = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`,
      [contactId, tagId],
    );
    assert(afterUntag.rows[0].n === 0, 'untagging campaign removes derived contact tag');

    // Backfill: add tag to campaign with existing completion → contact gains it
    await client.query(
      `INSERT INTO campaign_tags (campaign_id, tag_id) VALUES ($1, $2)`,
      [campaignId, tagId],
    );
    await client.query(`SELECT recompute_contacts_for_campaign_tags($1)`, [campaignId]);
    const afterBackfill = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`,
      [contactId, tagId],
    );
    assert(afterBackfill.rows[0].n === 1, 'backfill adds campaign tag to completed creators');

    // Influencer tag still present throughout
    const influencerStill = await client.query(
      `SELECT count(*)::int AS n FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`,
      [contactId, influencerTagId],
    );
    assert(influencerStill.rows[0].n === 1, 'influencer tag never touched by campaign recompute');

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
