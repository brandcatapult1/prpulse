/**
 * Schema integrity tests — mirrors acceptance.mdc data-integrity checklist.
 * Run after migrations: npm run db:test
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in .env');
    process.exit(1);
  }
  return process.env.DATABASE_URL;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectDbError(client, sql, params, expectedFragment) {
  try {
    await client.query(sql, params);
    throw new Error(`Expected error containing "${expectedFragment}" but query succeeded`);
  } catch (err) {
    if (err.message.startsWith('Expected error')) throw err;
    assert(
      String(err.message).toLowerCase().includes(expectedFragment.toLowerCase()),
      `Expected error containing "${expectedFragment}", got: ${err.message}`,
    );
  }
}

async function seedBase(client) {
  const user = await client.query(
    `INSERT INTO users (email, full_name, role)
     VALUES ('test@brandcatapult.com', 'Test Manager', 'campaign_manager')
     RETURNING id`,
  );
  const userId = user.rows[0].id;

  const brand = await client.query(
    `INSERT INTO brands (brand_name) VALUES ('Test Brand') RETURNING id`,
  );
  const brandId = brand.rows[0].id;

  const campaign = await client.query(
    `INSERT INTO campaigns (campaign_name, brand_id, status, target_collaborations, created_by)
     VALUES ('Test Campaign', $1, 'active', 10, $2)
     RETURNING id`,
    [brandId, userId],
  );
  const campaignId = campaign.rows[0].id;

  const contact = await client.query(
    `INSERT INTO contacts (full_name, mobile_number, source, created_by)
     VALUES ('Test Influencer', '+919999999999', 'manual_entry', $1)
     RETURNING id`,
    [userId],
  );
  const contactId = contact.rows[0].id;

  const engagement = await client.query(
    `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, conversation_status, created_by)
     VALUES ($1, $2, $3, 'in_conversation', $3)
     RETURNING id`,
    [contactId, campaignId, userId],
  );

  return {
    userId,
    brandId,
    campaignId,
    contactId,
    engagementId: engagement.rows[0].id,
  };
}

async function runTests() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  let passed = 0;

  const test = async (name, fn) => {
    await client.query('BEGIN');
    try {
      await fn();
      await client.query('ROLLBACK');
      console.log(`✓ ${name}`);
      passed += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ ${name}`);
      console.error(`  ${err.message}`);
      throw err;
    }
  };

  try {
    await test('blocks completion with zero deliverables', async () => {
      const { engagementId } = await seedBase(client);
      await expectDbError(
        client,
        `UPDATE engagements
         SET conversation_status = 'collaboration_complete',
             primary_collaboration_reason = 'expert'
         WHERE id = $1`,
        [engagementId],
        'requires at least one deliverable',
      );
    });

    await test('blocks completion with non-posted deliverable', async () => {
      const { engagementId } = await seedBase(client);
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, status)
         VALUES ($1, 'reel', 'pending')`,
        [engagementId],
      );
      await expectDbError(
        client,
        `UPDATE engagements
         SET conversation_status = 'collaboration_complete',
             primary_collaboration_reason = 'expert'
         WHERE id = $1`,
        [engagementId],
        'requires at least one deliverable',
      );
    });

    await test('valid completion increments campaign count and stamps completed_at', async () => {
      const { engagementId, campaignId } = await seedBase(client);
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, status)
         VALUES ($1, 'reel', 'posted')`,
        [engagementId],
      );
      const { rows: before } = await client.query(
        'SELECT completed_collaborations FROM campaigns WHERE id = $1',
        [campaignId],
      );
      assert(before[0].completed_collaborations === 0, 'expected 0 before completion');

      await client.query(
        `UPDATE engagements
         SET conversation_status = 'collaboration_complete',
             primary_collaboration_reason = 'expert'
         WHERE id = $1`,
        [engagementId],
      );

      const { rows: afterCampaign } = await client.query(
        'SELECT completed_collaborations, campaign_health FROM campaigns WHERE id = $1',
        [campaignId],
      );
      assert(afterCampaign[0].completed_collaborations === 1, 'expected count 1 after completion');

      const { rows: afterEngagement } = await client.query(
        'SELECT completed_at FROM engagements WHERE id = $1',
        [engagementId],
      );
      assert(afterEngagement[0].completed_at !== null, 'expected completed_at to be set');
    });

    await test('reopening a completed engagement decrements campaign count', async () => {
      const { engagementId, campaignId } = await seedBase(client);
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, status)
         VALUES ($1, 'reel', 'posted')`,
        [engagementId],
      );
      await client.query(
        `UPDATE engagements
         SET conversation_status = 'collaboration_complete',
             primary_collaboration_reason = 'expert'
         WHERE id = $1`,
        [engagementId],
      );
      await client.query(
        `UPDATE engagements SET conversation_status = 'in_conversation' WHERE id = $1`,
        [engagementId],
      );

      const { rows } = await client.query(
        'SELECT completed_collaborations FROM campaigns WHERE id = $1',
        [campaignId],
      );
      assert(rows[0].completed_collaborations === 0, 'expected count 0 after reopen');
    });

    await test('target = 0 campaign shows not_set health', async () => {
      const user = await client.query(
        `INSERT INTO users (email, full_name, role)
         VALUES ('zero-target@brandcatapult.com', 'Zero Target', 'campaign_manager')
         RETURNING id`,
      );
      const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('Zero Brand') RETURNING id`);
      const campaign = await client.query(
        `INSERT INTO campaigns (campaign_name, brand_id, status, target_collaborations, created_by)
         VALUES ('Zero Target Campaign', $1, 'active', 0, $2)
         RETURNING id, campaign_health`,
        [brand.rows[0].id, user.rows[0].id],
      );
      assert(campaign.rows[0].campaign_health === 'not_set', 'expected not_set health for target 0');
    });

    await test('overdue is computed in v_deliverables, not stored as status', async () => {
      const { engagementId } = await seedBase(client);
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, status, due_date)
         VALUES ($1, 'story', 'pending', ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1))`,
        [engagementId],
      );
      const { rows } = await client.query(
        `SELECT status, is_overdue FROM v_deliverables WHERE engagement_id = $1`,
        [engagementId],
      );
      assert(rows[0].status === 'pending', 'status should remain pending');
      assert(rows[0].is_overdue === true, 'is_overdue should be true for past due_date');

      const enumCheck = await client.query(
        `SELECT enumlabel FROM pg_enum
         JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
         WHERE pg_type.typname = 'deliverable_status'`,
      );
      const labels = enumCheck.rows.map((r) => r.enumlabel);
      assert(!labels.includes('overdue'), 'deliverable_status enum must not contain overdue');
    });

    await test('agreed fee frozen while completed', async () => {
      const { engagementId } = await seedBase(client);
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, status)
         VALUES ($1, 'reel', 'posted')`,
        [engagementId],
      );
      await client.query(
        `UPDATE engagements
         SET conversation_status = 'collaboration_complete',
             primary_collaboration_reason = 'expert',
             agreed_fee = 5000
         WHERE id = $1`,
        [engagementId],
      );
      await expectDbError(
        client,
        `UPDATE engagements SET agreed_fee = 9999 WHERE id = $1`,
        [engagementId],
        'frozen while the engagement is Completed',
      );
    });

    await test('blacklist record flips is_blacklisted on contact', async () => {
      const user = await client.query(
        `INSERT INTO users (email, full_name, role)
         VALUES ('blacklist@brandcatapult.com', 'Admin', 'admin')
         RETURNING id`,
      );
      const contact = await client.query(
        `INSERT INTO contacts (full_name, mobile_number, source)
         VALUES ('Blacklist Test', '+919888888888', 'manual_entry')
         RETURNING id, is_blacklisted`,
      );
      assert(contact.rows[0].is_blacklisted === false, 'expected not blacklisted initially');

      await client.query(
        `INSERT INTO blacklist_records (contact_id, reason, blacklisted_by)
         VALUES ($1, 'Test reason', $2)`,
        [contact.rows[0].id, user.rows[0].id],
      );

      const { rows } = await client.query(
        'SELECT is_blacklisted, status FROM contacts WHERE id = $1',
        [contact.rows[0].id],
      );
      assert(rows[0].is_blacklisted === true, 'expected is_blacklisted true');
      assert(rows[0].status === 'active', 'status enum should be unchanged');
    });

    console.log(`\n${passed} integrity tests passed.`);
  } finally {
    await client.end();
  }
}

runTests().catch(() => process.exit(1));
