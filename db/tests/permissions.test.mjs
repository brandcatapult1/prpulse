/**
 * API permission rules — Campaign Manager must be rejected where PRD restricts.
 * Run after migrations: npm run db:test:permissions
 */
import pg from 'pg';
import dotenv from 'dotenv';
import {
  assertCanApplyDidntDeliver,
  assertCreatorAssignedForCampaignManager,
  assertUserManagesCampaign,
  assertUserManagesEngagement,
  forbidUnlessSeniorOrAdmin,
} from '../../server/src/lib/permissions.mjs';

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

async function expectForbidden(fn, expectedStatus = 403) {
  try {
    await fn();
    throw new Error(`Expected ${expectedStatus} error but call succeeded`);
  } catch (err) {
    if (err.message.startsWith('Expected ')) throw err;
    assert(err.status === expectedStatus, `Expected status ${expectedStatus}, got ${err.status}: ${err.message}`);
  }
}

async function seedPermissionFixtures(client) {
  const cm = await client.query(
    `INSERT INTO users (email, full_name, role)
     VALUES ('perm-cm@brandcatapult.com', 'Perm CM', 'campaign_manager')
     RETURNING id, role`,
  );
  const otherCm = await client.query(
    `INSERT INTO users (email, full_name, role)
     VALUES ('perm-cm2@brandcatapult.com', 'Perm CM Two', 'campaign_manager')
     RETURNING id, role`,
  );
  const sm = await client.query(
    `INSERT INTO users (email, full_name, role)
     VALUES ('perm-sm@brandcatapult.com', 'Perm SM', 'senior_manager')
     RETURNING id, role`,
  );

  const brand = await client.query(`INSERT INTO brands (brand_name) VALUES ('Perm Brand') RETURNING id`);
  const assignedCampaign = await client.query(
    `INSERT INTO campaigns (campaign_name, brand_id, status, created_by)
     VALUES ('Assigned Campaign', $1, 'active', $2)
     RETURNING id`,
    [brand.rows[0].id, cm.rows[0].id],
  );
  const otherCampaign = await client.query(
    `INSERT INTO campaigns (campaign_name, brand_id, status, created_by)
     VALUES ('Other Campaign', $1, 'active', $2)
     RETURNING id`,
    [brand.rows[0].id, otherCm.rows[0].id],
  );

  await client.query(
    `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2)`,
    [assignedCampaign.rows[0].id, cm.rows[0].id],
  );
  await client.query(
    `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2)`,
    [otherCampaign.rows[0].id, otherCm.rows[0].id],
  );

  const contact = await client.query(
    `INSERT INTO contacts (full_name, mobile_number, source, created_by)
     VALUES ('Perm Contact', '+919777777701', 'manual_entry', $1)
     RETURNING id`,
    [cm.rows[0].id],
  );

  const assignedEngagement = await client.query(
    `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, created_by)
     VALUES ($1, $2, $3, $3)
     RETURNING id`,
    [contact.rows[0].id, assignedCampaign.rows[0].id, cm.rows[0].id],
  );
  const otherEngagement = await client.query(
    `INSERT INTO engagements (contact_id, campaign_id, assigned_manager, created_by)
     VALUES ($1, $2, $3, $3)
     RETURNING id`,
    [contact.rows[0].id, otherCampaign.rows[0].id, otherCm.rows[0].id],
  );

  const registration = await client.query(
    `INSERT INTO registration_submissions (full_name, mobile_number, status)
     VALUES ('Reg Applicant', '+919777777702', 'new')
     RETURNING id`,
  );

  return {
    cm: cm.rows[0],
    sm: sm.rows[0],
    assignedCampaignId: assignedCampaign.rows[0].id,
    otherCampaignId: otherCampaign.rows[0].id,
    assignedEngagementId: assignedEngagement.rows[0].id,
    otherEngagementId: otherEngagement.rows[0].id,
    contactId: contact.rows[0].id,
    registrationId: registration.rows[0].id,
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
    await test('CM rejected for blacklist (senior/admin only)', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() => forbidUnlessSeniorOrAdmin(fx.cm));
      forbidUnlessSeniorOrAdmin(fx.sm);
    });

    await test('CM rejected for registration approve/reject', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() => forbidUnlessSeniorOrAdmin(fx.cm));
    });

    await test('CM rejected for engagement write on unassigned campaign', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() =>
        assertUserManagesEngagement(client, fx.cm, fx.otherEngagementId),
      );
      await assertUserManagesEngagement(client, fx.cm, fx.assignedEngagementId);
    });

    await test('CM rejected for campaign populate on unassigned campaign', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() =>
        assertUserManagesCampaign(client, fx.cm, fx.otherCampaignId),
      );
      await assertUserManagesCampaign(client, fx.cm, fx.assignedCampaignId);
    });

    await test('CM rejected for didnt_deliver drop_reason', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() =>
        assertCanApplyDidntDeliver(fx.cm, { drop_reason: 'didnt_deliver' }),
      );
      assertCanApplyDidntDeliver(fx.sm, { drop_reason: 'didnt_deliver' });
    });

    await test('CM rejected when campaign create omits self from managers', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() =>
        assertCreatorAssignedForCampaignManager(fx.cm, [fx.sm.id]),
      );
      assertCreatorAssignedForCampaignManager(fx.cm, [fx.cm.id, fx.sm.id]);
    });

    console.log(`\n${passed} permission tests passed.`);
  } finally {
    await client.end();
  }
}

runTests().catch(() => process.exit(1));
