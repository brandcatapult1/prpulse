/**
 * API permission enforcement — each PRD rule must reject the disallowed role with 403.
 * Run: npm run db:test:permissions
 */
import pg from 'pg';
import dotenv from 'dotenv';
import {
  assertCanApplyDidntDeliver,
  assertCreatorAssignedForCampaignManager,
  assertUserManagesCampaign,
  assertUserManagesEngagement,
  forbidUnlessAdmin,
  forbidUnlessSeniorOrAdmin,
} from '../../server/src/lib/permissions.mjs';
import {
  requireAdmin,
  requireDidntDeliverPermission,
  requireSeniorOrAdmin,
} from '../../server/src/middleware/permissions.mjs';

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

/** Invoke sync Express middleware; returns { statusCode, body, allowed }. */
function invokeMiddleware(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload, allowed: false });
      },
    };
    const next = () => resolve({ statusCode: 200, body: null, allowed: true });
    middleware(req, res, next);
  });
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
  const admin = await client.query(
    `INSERT INTO users (email, full_name, role)
     VALUES ('perm-admin@brandcatapult.com', 'Perm Admin', 'admin')
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

  return {
    cm: cm.rows[0],
    sm: sm.rows[0],
    admin: admin.rows[0],
    assignedCampaignId: assignedCampaign.rows[0].id,
    otherCampaignId: otherCampaign.rows[0].id,
    assignedEngagementId: assignedEngagement.rows[0].id,
    otherEngagementId: otherEngagement.rows[0].id,
    contactId: contact.rows[0].id,
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
    await test('rule 1 — CM rejected for blacklist / un-blacklist (403)', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() => forbidUnlessSeniorOrAdmin(fx.cm));
      const blocked = await invokeMiddleware(requireSeniorOrAdmin, { user: fx.cm });
      assert(blocked.statusCode === 403, `middleware expected 403, got ${blocked.statusCode}`);
      assert(!blocked.allowed, 'middleware should not call next()');
      forbidUnlessSeniorOrAdmin(fx.sm);
      const allowed = await invokeMiddleware(requireSeniorOrAdmin, { user: fx.sm });
      assert(allowed.allowed, 'senior manager should pass middleware');
    });

    await test('rule 2 — CM rejected for registration approve/reject (403)', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() => forbidUnlessSeniorOrAdmin(fx.cm));
      const blocked = await invokeMiddleware(requireSeniorOrAdmin, { user: fx.cm });
      assert(blocked.statusCode === 403, `middleware expected 403, got ${blocked.statusCode}`);
    });

    await test('rule 3 — CM rejected for engagement write on unassigned campaign (403)', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() =>
        assertUserManagesEngagement(client, fx.cm, fx.otherEngagementId),
      );
      await assertUserManagesEngagement(client, fx.cm, fx.assignedEngagementId);
      await expectForbidden(() =>
        assertUserManagesCampaign(client, fx.cm, fx.otherCampaignId),
      );
    });

    await test('rule 4 — CM rejected for campaign populate on unassigned campaign (403)', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() =>
        assertUserManagesCampaign(client, fx.cm, fx.otherCampaignId),
      );
      await expectForbidden(() =>
        assertCreatorAssignedForCampaignManager(fx.cm, [fx.sm.id]),
      );
      assertCreatorAssignedForCampaignManager(fx.cm, [fx.cm.id, fx.sm.id]);
    });

    await test('rule 5 — CM rejected for didnt_deliver drop_reason (403)', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() =>
        assertCanApplyDidntDeliver(fx.cm, { drop_reason: 'didnt_deliver' }),
      );
      const blocked = await invokeMiddleware(requireDidntDeliverPermission, {
        user: fx.cm,
        body: { drop_reason: 'didnt_deliver' },
      });
      assert(blocked.statusCode === 403, `middleware expected 403, got ${blocked.statusCode}`);
      assertCanApplyDidntDeliver(fx.sm, { drop_reason: 'didnt_deliver' });
    });

    await test('rule 6 — CM and SM rejected for delete contact; Admin allowed', async () => {
      const fx = await seedPermissionFixtures(client);
      await expectForbidden(() => forbidUnlessAdmin(fx.cm));
      await expectForbidden(() => forbidUnlessAdmin(fx.sm));
      forbidUnlessAdmin(fx.admin);

      const cmBlocked = await invokeMiddleware(requireAdmin, { user: fx.cm });
      assert(cmBlocked.statusCode === 403, `CM delete middleware expected 403, got ${cmBlocked.statusCode}`);
      const smBlocked = await invokeMiddleware(requireAdmin, { user: fx.sm });
      assert(smBlocked.statusCode === 403, `SM delete middleware expected 403, got ${smBlocked.statusCode}`);
      const adminAllowed = await invokeMiddleware(requireAdmin, { user: fx.admin });
      assert(adminAllowed.allowed, 'admin should pass delete middleware');
    });

    console.log(`\n${passed} permission tests passed.`);
  } finally {
    await client.end();
  }
}

runTests().catch(() => process.exit(1));
