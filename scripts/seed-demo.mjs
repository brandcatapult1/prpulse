/**
 * Repeatable demo fixtures in the real database (no mock layer).
 * Tagged via campaigns.objective = 'prpulse_demo_fixture'.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

export const DEMO_MARKER = 'prpulse_demo_fixture';
export const DEMO_USER_EMAIL_SUFFIX = '@brandcatapult.fixture';

export const DEMO_BRANDS = [
  { key: 'glowco', name: 'GlowCo', category: 'Food & Beverage', contact: 'Ananya Iyer', email: 'ananya@glowco.demo' },
  { key: 'brewhaus', name: 'BrewHaus', category: 'Café & Beverages', contact: 'Kabir Shah', email: 'kabir@brewhaus.demo' },
  { key: 'spiceroute', name: 'SpiceRoute', category: 'QSR', contact: 'Divya Menon', email: 'divya@spiceroute.demo' },
];

export const DEMO_CAMPAIGNS = [
  {
    key: 'summer',
    name: 'Summer Menu Push',
    brandKey: 'glowco',
    status: 'active',
    target: 8,
    type: 'influencer',
    managerKeys: ['aisha', 'rohan'],
  },
  {
    key: 'monsoon',
    name: 'Monsoon Launch',
    brandKey: 'brewhaus',
    status: 'active',
    target: 5,
    type: 'influencer',
    managerKeys: ['rohan', 'neha'],
  },
  {
    key: 'festival',
    name: 'Festival Collab',
    brandKey: 'spiceroute',
    status: 'draft',
    target: 3,
    type: 'influencer',
    managerKeys: ['aisha'],
  },
];

export const DEMO_USERS = [
  { key: 'aisha', email: `aisha.khan${DEMO_USER_EMAIL_SUFFIX}`, full_name: 'Aisha Khan', role: 'campaign_manager' },
  { key: 'rohan', email: `rohan.verma${DEMO_USER_EMAIL_SUFFIX}`, full_name: 'Rohan Verma', role: 'campaign_manager' },
  { key: 'neha', email: `neha.patel${DEMO_USER_EMAIL_SUFFIX}`, full_name: 'Neha Patel', role: 'senior_manager' },
];

export const DEMO_CONTACTS = [
  { key: 'priya', full_name: 'Priya Nair', mobile_number: '+919010010101', city: 'Mumbai', instagram_url: 'https://instagram.com/priya.creates', classification: 'micro' },
  { key: 'arjun', full_name: 'Arjun Mehta', mobile_number: '+919010010102', city: 'Bangalore', instagram_url: 'https://instagram.com/arjun.eats', classification: 'mid' },
  { key: 'tanvi', full_name: 'Tanvi Desai', mobile_number: '+919010010103', city: 'Delhi', instagram_url: 'https://instagram.com/tanvi.food', classification: 'micro' },
  { key: 'meera', full_name: 'Meera K', mobile_number: '+919010010104', city: 'Pune', instagram_url: null, classification: 'nano' },
  { key: 'vikram', full_name: 'Vikram Joshi', mobile_number: '+919010010105', city: 'Mumbai', instagram_url: 'https://instagram.com/vikram.bites', classification: 'mid' },
  { key: 'kavya', full_name: 'Kavya Reddy', mobile_number: '+919010010106', city: 'Hyderabad', instagram_url: 'https://instagram.com/kavya.plates', classification: 'micro' },
  { key: 'dev', full_name: 'Dev Malhotra', mobile_number: '+919010010107', city: 'Gurgaon', instagram_url: 'https://instagram.com/dev.dines', classification: 'nano' },
  { key: 'ananya_c', full_name: 'Ananya Chopra', mobile_number: '+919010010108', city: 'Chennai', instagram_url: 'https://instagram.com/ananya.eats', classification: 'category_a' },
  { key: 'riya', full_name: 'Riya Singh', mobile_number: '+919010010109', city: 'Kolkata', instagram_url: null, classification: 'micro' },
  { key: 'siddharth', full_name: 'Siddharth Rao', mobile_number: '+919010010110', city: 'Bangalore', instagram_url: 'https://instagram.com/sid.foodie', classification: 'fnb_specialist' },
];

// Back-compat for UI labels
export const DEMO_BRAND_NAME = DEMO_BRANDS[0].name;
export const DEMO_CAMPAIGN_NAME = DEMO_CAMPAIGNS[0].name;

function todayIstIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pgClientConfig(url) {
  return {
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  };
}

export async function hasDemoFixtures(clientOrPool) {
  const { rows } = await clientOrPool.query(
    `SELECT count(*)::int AS n FROM campaigns WHERE objective = $1`,
    [DEMO_MARKER],
  );
  return rows[0].n > 0;
}

async function resolveSeedActor(client) {
  const { rows } = await client.query(
    `SELECT id, full_name, role FROM users
     WHERE email = 'dev@brandcatapult.local'
        OR role = 'admin'
     ORDER BY CASE WHEN email = 'dev@brandcatapult.local' THEN 0 ELSE 1 END
     LIMIT 1`,
  );
  if (!rows[0]) {
    throw new Error('No admin/dev user found — open the app once so the dev user is created');
  }
  return rows[0];
}

async function ensureDemoUsers(client) {
  const ids = {};
  for (const u of DEMO_USERS) {
    const { rows } = await client.query(
      `INSERT INTO users (email, full_name, role, google_sub)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             role = EXCLUDED.role,
             updated_at = now()
       RETURNING id`,
      [u.email, u.full_name, u.role, `fixture-${u.key}`],
    );
    ids[u.key] = rows[0].id;
  }
  return ids;
}

export async function clearDemoFixtures(client) {
  const { rows: demoCampaigns } = await client.query(
    `SELECT id FROM campaigns WHERE objective = $1`,
    [DEMO_MARKER],
  );
  if (demoCampaigns.length === 0) {
    return { cleared: false, message: 'No demo fixtures found' };
  }

  const campaignIds = demoCampaigns.map((r) => r.id);

  await client.query(
    `DELETE FROM deliverables
     WHERE engagement_id IN (SELECT id FROM engagements WHERE campaign_id = ANY($1))`,
    [campaignIds],
  );
  await client.query('DELETE FROM engagements WHERE campaign_id = ANY($1)', [campaignIds]);
  await client.query('DELETE FROM campaign_managers WHERE campaign_id = ANY($1)', [campaignIds]);
  await client.query('DELETE FROM campaigns WHERE id = ANY($1)', [campaignIds]);

  const mobiles = DEMO_CONTACTS.map((c) => c.mobile_number);
  await client.query(
    `DELETE FROM contacts
     WHERE mobile_number = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM engagements e WHERE e.contact_id = contacts.id)`,
    [mobiles],
  );

  const brandNames = DEMO_BRANDS.map((b) => b.name);
  const { rowCount: brandCount } = await client.query(
    `DELETE FROM brands b
     WHERE b.brand_name = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.brand_id = b.id)`,
    [brandNames],
  );

  const { rowCount: userCount } = await client.query(
    `DELETE FROM users WHERE email LIKE $1`,
    [`%${DEMO_USER_EMAIL_SUFFIX}`],
  );

  return {
    cleared: true,
    message: `Removed ${campaignIds.length} demo campaign(s), ${brandCount ?? 0} brand(s), ${userCount ?? 0} fixture user(s)`,
  };
}

async function upsertContact(client, contact, createdBy) {
  const existing = await client.query('SELECT id FROM contacts WHERE mobile_number = $1', [contact.mobile_number]);
  if (existing.rows[0]) return existing.rows[0].id;

  const { rows } = await client.query(
    `INSERT INTO contacts (
       full_name, mobile_number, city, instagram_url, classification,
       status, source, created_by
     )
     VALUES ($1, $2, $3, $4, $5, 'active', 'manual_entry', $6)
     RETURNING id`,
    [contact.full_name, contact.mobile_number, contact.city, contact.instagram_url, contact.classification, createdBy],
  );
  return rows[0].id;
}

async function insertEngagement(client, { contactId, campaignId, managerId, def, createdBy }) {
  const { rows } = await client.query(
    `INSERT INTO engagements (
       contact_id, campaign_id, assigned_manager, conversation_status, interest_level,
       last_contact_date, next_follow_up_date, visit_date, visit_time, visit_outlet, visit_notes,
       collaboration_type, agreed_fee, primary_collaboration_reason, notes, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $3)
     ON CONFLICT (contact_id, campaign_id) DO NOTHING
     RETURNING id`,
    [
      contactId,
      campaignId,
      managerId,
      def.status,
      def.interest_level ?? 'unknown',
      def.last_contact_date ?? null,
      def.next_follow_up_date ?? null,
      def.visit_date ?? null,
      def.visit_time ?? null,
      def.visit_outlet ?? null,
      def.visit_notes ?? null,
      def.collaboration_type ?? null,
      def.agreed_fee ?? null,
      def.primary_collaboration_reason ?? null,
      def.notes ?? null,
    ],
  );
  return rows[0]?.id ?? null;
}

export async function seedDemoFixtures(client, { actorUserId, reset = false } = {}) {
  if (reset) {
    await clearDemoFixtures(client);
  }

  if (await hasDemoFixtures(client)) {
    return {
      skipped: true,
      message: 'Demo fixtures already loaded — use reset to replace',
    };
  }

  const actor = actorUserId ? { id: actorUserId } : await resolveSeedActor(client);
  const userIds = await ensureDemoUsers(client);

  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [actor.id]);

  const today = todayIstIso();
  const yesterday = addDaysIso(today, -1);
  const inThreeDays = addDaysIso(today, 3);
  const fiveDaysAgo = addDaysIso(today, -5);

  const brandIds = {};
  for (const b of DEMO_BRANDS) {
    const existing = await client.query('SELECT id FROM brands WHERE brand_name = $1', [b.name]);
    if (existing.rows[0]) {
      brandIds[b.key] = existing.rows[0].id;
      continue;
    }
    const { rows } = await client.query(
      `INSERT INTO brands (brand_name, brand_category, primary_contact, contact_email, account_manager, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [b.name, b.category, b.contact, b.email, userIds.aisha],
    );
    brandIds[b.key] = rows[0].id;
  }

  const campaignIds = {};
  for (const c of DEMO_CAMPAIGNS) {
    const { rows } = await client.query(
      `INSERT INTO campaigns (
         campaign_name, brand_id, campaign_type, objective, status,
         target_collaborations, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [c.name, brandIds[c.brandKey], c.type, DEMO_MARKER, c.status, c.target, actor.id],
    );
    campaignIds[c.key] = rows[0].id;

    for (const mk of c.managerKeys) {
      await client.query(
        `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [campaignIds[c.key], userIds[mk]],
      );
    }
    // Dev/admin always sees active campaigns on the dashboard
    if (c.status === 'active') {
      await client.query(
        `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [campaignIds[c.key], actor.id],
      );
    }
  }

  const contactIds = {};
  for (const c of DEMO_CONTACTS) {
    contactIds[c.key] = await upsertContact(client, c, actor.id);
  }

  const engagementPlan = [
    // Summer Menu Push — mixed kanban; actor (you) gets dashboard items
    { campaignKey: 'summer', contactKey: 'priya', managerKey: 'actor', status: 'in_conversation', interest_level: 'high', last_contact_date: yesterday, next_follow_up_date: today, notes: 'Interested in reel + story — follow up today' },
    { campaignKey: 'summer', contactKey: 'arjun', managerKey: 'actor', status: 'scheduled', interest_level: 'high', last_contact_date: yesterday, next_follow_up_date: today, visit_date: today, visit_time: '14:30:00', visit_outlet: 'GlowCo Bandra', visit_notes: 'Lunch slot — confirm with outlet' },
    { campaignKey: 'summer', contactKey: 'tanvi', managerKey: 'actor', status: 'awaiting_final_deliverables', interest_level: 'medium', last_contact_date: fiveDaysAgo, next_follow_up_date: inThreeDays, collaboration_type: 'paid', agreed_fee: 15000, deliverables: [{ type: 'reel', status: 'pending', due: yesterday }, { type: 'story', status: 'received', due: today }] },
    { campaignKey: 'summer', contactKey: 'meera', managerKey: 'rohan', status: 'not_contacted', interest_level: 'unknown' },
    { campaignKey: 'summer', contactKey: 'vikram', managerKey: 'aisha', status: 'awaiting_final_deliverables', interest_level: 'high', last_contact_date: fiveDaysAgo, collaboration_type: 'barter', completeAfterDeliverables: true, primary_collaboration_reason: 'expert', deliverables: [{ type: 'reel', status: 'posted', due: fiveDaysAgo }] },

    // Monsoon Launch — Rohan + Neha visibility
    { campaignKey: 'monsoon', contactKey: 'kavya', managerKey: 'actor', status: 'in_conversation', interest_level: 'medium', last_contact_date: yesterday, next_follow_up_date: today, notes: 'Asked for menu brief' },
    { campaignKey: 'monsoon', contactKey: 'dev', managerKey: 'rohan', status: 'dropped_not_interested', interest_level: 'low', last_contact_date: fiveDaysAgo, notes: 'Declined after rate discussion' },
    { campaignKey: 'monsoon', contactKey: 'ananya_c', managerKey: 'neha', status: 'scheduled', interest_level: 'high', last_contact_date: yesterday, next_follow_up_date: inThreeDays, visit_date: inThreeDays, visit_time: '11:00:00', visit_outlet: 'BrewHaus Indiranagar' },
    { campaignKey: 'monsoon', contactKey: 'riya', managerKey: 'rohan', status: 'no_response', interest_level: 'unknown', last_contact_date: fiveDaysAgo, next_follow_up_date: yesterday, notes: 'Two outreach attempts' },

    // Festival Collab (draft) — pipeline not started
    { campaignKey: 'festival', contactKey: 'siddharth', managerKey: 'aisha', status: 'not_contacted', interest_level: 'unknown' },
  ];

  let engagementCount = 0;
  for (const plan of engagementPlan) {
    const managerId = plan.managerKey === 'actor' ? actor.id : userIds[plan.managerKey];
    const engagementId = await insertEngagement(client, {
      contactId: contactIds[plan.contactKey],
      campaignId: campaignIds[plan.campaignKey],
      managerId,
      createdBy: actor.id,
      def: plan,
    });
    if (!engagementId) continue;
    engagementCount += 1;

    if (plan.deliverables?.length) {
      const delCount = await client.query(
        'SELECT count(*)::int AS n FROM deliverables WHERE engagement_id = $1',
        [engagementId],
      );
      if (delCount.rows[0].n === 0) {
        for (const d of plan.deliverables) {
          await client.query(
            `INSERT INTO deliverables (engagement_id, deliverable_type, status, due_date)
             VALUES ($1, $2, $3, $4)`,
            [engagementId, d.type, d.status, d.due ?? null],
          );
        }
      }
    }

    if (plan.completeAfterDeliverables) {
      await client.query(
        `UPDATE engagements
         SET conversation_status = 'collaboration_complete',
             primary_collaboration_reason = $2
         WHERE id = $1`,
        [engagementId, plan.primary_collaboration_reason ?? 'expert'],
      );
    }
  }

  return {
    skipped: false,
    message: 'Demo fixtures loaded',
    brands: DEMO_BRANDS.length,
    campaigns: DEMO_CAMPAIGNS.length,
    contacts: DEMO_CONTACTS.length,
    engagements: engagementCount,
    fixture_users: DEMO_USERS.map((u) => u.full_name),
    campaign_names: DEMO_CAMPAIGNS.map((c) => c.name),
  };
}

export async function runDemoSeed({
  reset = false,
  databaseUrl = process.env.DATABASE_URL,
  actorUserId = null,
} = {}) {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new pg.Client(pgClientConfig(databaseUrl.trim()));
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await seedDemoFixtures(client, { reset, actorUserId });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

const isCli =
  process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const reset = process.argv.includes('--reset');
  try {
    const result = await runDemoSeed({ reset });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}
