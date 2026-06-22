/**
 * Repeatable demo fixtures in the real database (no mock layer).
 * All rows are tagged via campaign.objective = 'prpulse_demo_fixture'.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

export const DEMO_MARKER = 'prpulse_demo_fixture';
export const DEMO_BRAND_NAME = 'GlowCo';
export const DEMO_CAMPAIGN_NAME = 'Summer Menu Push';

export const DEMO_CONTACTS = [
  {
    key: 'priya',
    full_name: 'Priya Nair',
    mobile_number: '+919010010101',
    city: 'Mumbai',
    instagram_url: 'https://instagram.com/priya.creates',
    classification: 'micro',
  },
  {
    key: 'arjun',
    full_name: 'Arjun Mehta',
    mobile_number: '+919010010102',
    city: 'Bangalore',
    instagram_url: 'https://instagram.com/arjun.eats',
    classification: 'mid',
  },
  {
    key: 'tanvi',
    full_name: 'Tanvi Desai',
    mobile_number: '+919010010103',
    city: 'Delhi',
    instagram_url: 'https://instagram.com/tanvi.food',
    classification: 'micro',
  },
  {
    key: 'meera',
    full_name: 'Meera K',
    mobile_number: '+919010010104',
    city: 'Pune',
    instagram_url: null,
    classification: 'nano',
  },
];

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

async function findDemoCampaign(client) {
  const { rows } = await client.query(
    `SELECT id, brand_id FROM campaigns WHERE objective = $1 LIMIT 1`,
    [DEMO_MARKER],
  );
  return rows[0] ?? null;
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
    throw new Error('No admin/dev user found — sign in once so dev user exists in the database');
  }
  return rows[0];
}

export async function clearDemoFixtures(client) {
  const demo = await findDemoCampaign(client);
  if (!demo) {
    return { cleared: false, message: 'No demo fixtures found' };
  }

  await client.query(
    `DELETE FROM deliverables
     WHERE engagement_id IN (SELECT id FROM engagements WHERE campaign_id = $1)`,
    [demo.id],
  );
  await client.query('DELETE FROM engagements WHERE campaign_id = $1', [demo.id]);
  await client.query('DELETE FROM campaign_managers WHERE campaign_id = $1', [demo.id]);
  await client.query('DELETE FROM campaigns WHERE id = $1', [demo.id]);

  const mobiles = DEMO_CONTACTS.map((c) => c.mobile_number);
  await client.query(
    `DELETE FROM contacts
     WHERE mobile_number = ANY($1)
       AND NOT EXISTS (
         SELECT 1 FROM engagements e WHERE e.contact_id = contacts.id
       )`,
    [mobiles],
  );

  const { rowCount: brandCount } = await client.query(
    `DELETE FROM brands b
     WHERE b.brand_name = $1
       AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.brand_id = b.id)`,
    [DEMO_BRAND_NAME],
  );

  return {
    cleared: true,
    message: `Removed demo campaign and up to ${brandCount} brand row(s)`,
  };
}

export async function seedDemoFixtures(client, { actorUserId, reset = false } = {}) {
  if (reset) {
    await clearDemoFixtures(client);
  }

  const existing = await findDemoCampaign(client);
  if (existing) {
    return {
      skipped: true,
      message: 'Demo fixtures already loaded — use reset to replace',
      campaign_id: existing.id,
    };
  }

  const actor = actorUserId
    ? { id: actorUserId }
    : await resolveSeedActor(client);

  await client.query(`SET LOCAL app.current_user_id = '${actor.id}'`);

  const today = todayIstIso();
  const yesterday = addDaysIso(today, -1);
  const inThreeDays = addDaysIso(today, 3);

  const { rows: brandRows } = await client.query(
    `INSERT INTO brands (brand_name, brand_category, primary_contact, contact_email, account_manager, is_active)
     VALUES ($1, 'Food & Beverage', 'Ananya Iyer', 'ananya@glowco.demo', $2, true)
     RETURNING id`,
    [DEMO_BRAND_NAME, actor.id],
  );
  const brandId = brandRows[0].id;

  const { rows: campaignRows } = await client.query(
    `INSERT INTO campaigns (
       campaign_name, brand_id, campaign_type, objective, status,
       target_collaborations, created_by
     )
     VALUES ($1, $2, 'influencer', $3, 'active', 8, $4)
     RETURNING id`,
    [DEMO_CAMPAIGN_NAME, brandId, DEMO_MARKER, actor.id],
  );
  const campaignId = campaignRows[0].id;

  await client.query(
    `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [campaignId, actor.id],
  );

  const contactIds = {};
  for (const c of DEMO_CONTACTS) {
    const existingContact = await client.query(
      'SELECT id FROM contacts WHERE mobile_number = $1',
      [c.mobile_number],
    );
    if (existingContact.rows[0]) {
      contactIds[c.key] = existingContact.rows[0].id;
      continue;
    }
    const { rows } = await client.query(
      `INSERT INTO contacts (
         full_name, mobile_number, city, instagram_url, classification,
         status, source, created_by
       )
       VALUES ($1, $2, $3, $4, $5, 'active', 'manual_entry', $6)
       RETURNING id`,
      [c.full_name, c.mobile_number, c.city, c.instagram_url, c.classification, actor.id],
    );
    contactIds[c.key] = rows[0].id;
  }

  const engagementDefs = [
    {
      key: 'priya',
      status: 'in_conversation',
      interest_level: 'high',
      last_contact_date: yesterday,
      next_follow_up_date: today,
      notes: 'Interested in reel + story — follow up today',
    },
    {
      key: 'arjun',
      status: 'scheduled',
      interest_level: 'high',
      last_contact_date: yesterday,
      next_follow_up_date: today,
      visit_date: today,
      visit_time: '14:30:00',
      visit_outlet: 'GlowCo Bandra',
      visit_notes: 'Lunch slot — confirm with outlet',
    },
    {
      key: 'tanvi',
      status: 'awaiting_final_deliverables',
      interest_level: 'medium',
      last_contact_date: addDaysIso(today, -5),
      next_follow_up_date: inThreeDays,
      collaboration_type: 'paid',
      agreed_fee: 15000,
    },
    {
      key: 'meera',
      status: 'not_contacted',
      interest_level: 'unknown',
    },
  ];

  const engagementIds = {};
  for (const e of engagementDefs) {
    const { rows } = await client.query(
      `INSERT INTO engagements (
         contact_id, campaign_id, assigned_manager, conversation_status, interest_level,
         last_contact_date, next_follow_up_date, visit_date, visit_time, visit_outlet, visit_notes,
         collaboration_type, agreed_fee, notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $3)
       ON CONFLICT (contact_id, campaign_id) DO NOTHING
       RETURNING id`,
      [
        contactIds[e.key],
        campaignId,
        actor.id,
        e.status,
        e.interest_level,
        e.last_contact_date ?? null,
        e.next_follow_up_date ?? null,
        e.visit_date ?? null,
        e.visit_time ?? null,
        e.visit_outlet ?? null,
        e.visit_notes ?? null,
        e.collaboration_type ?? null,
        e.agreed_fee ?? null,
        e.notes ?? null,
      ],
    );
    if (rows[0]) engagementIds[e.key] = rows[0].id;
  }

  if (engagementIds.tanvi) {
    const delCount = await client.query(
      'SELECT count(*)::int AS n FROM deliverables WHERE engagement_id = $1',
      [engagementIds.tanvi],
    );
    if (delCount.rows[0].n === 0) {
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, status, due_date)
         VALUES ($1, 'reel', 'pending', $2)`,
        [engagementIds.tanvi, yesterday],
      );
      await client.query(
        `INSERT INTO deliverables (engagement_id, deliverable_type, status, due_date)
         VALUES ($1, 'story', 'received', $2)`,
        [engagementIds.tanvi, today],
      );
    }
  }

  return {
    skipped: false,
    message: 'Demo fixtures loaded',
    brand_id: brandId,
    campaign_id: campaignId,
    campaign_name: DEMO_CAMPAIGN_NAME,
    contacts: DEMO_CONTACTS.length,
    engagements: Object.keys(engagementIds).length,
    assigned_manager_id: actor.id,
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
