/**
 * Repeatable demo fixtures in the real database (no mock layer).
 * Tagged via campaigns.objective = 'prpulse_demo_fixture'.
 *
 * Hygiene: contacts carry commercial prefs; engagements follow stage rules
 * (outreach dates, scheduled prerequisites, dropped_from, visit_completed_date, etc.).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

export const DEMO_MARKER = 'prpulse_demo_fixture';
export const DEMO_USER_EMAIL_SUFFIX = '@brandcatapult.fixture';

export const DEMO_OUTLETS = {
  glowco: 'GlowCo Bandra',
  brewhaus: 'BrewHaus Indiranagar',
  spiceroute: 'SpiceRoute Salt Lake',
};

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
  {
    key: 'priya',
    full_name: 'Priya Nair',
    mobile_number: '+919010010101',
    city: 'Mumbai',
    instagram_url: 'https://instagram.com/priya.creates',
    classification: 'micro',
    open_to_paid: true,
    open_to_barter: true,
    reel_rate: 12000,
    story_rate: 4000,
  },
  {
    key: 'arjun',
    full_name: 'Arjun Mehta',
    mobile_number: '+919010010102',
    city: 'Bangalore',
    instagram_url: 'https://instagram.com/arjun.eats',
    classification: 'mid',
    open_to_paid: true,
    open_to_barter: false,
    reel_rate: 35000,
    story_rate: 12000,
  },
  {
    key: 'tanvi',
    full_name: 'Tanvi Desai',
    mobile_number: '+919010010103',
    city: 'Delhi',
    instagram_url: 'https://instagram.com/tanvi.food',
    classification: 'micro',
    open_to_paid: true,
    open_to_barter: false,
    reel_rate: 18000,
    story_rate: 6000,
  },
  {
    key: 'meera',
    full_name: 'Meera K',
    mobile_number: '+919010010104',
    city: 'Pune',
    instagram_url: null,
    classification: 'nano',
    open_to_paid: false,
    open_to_barter: true,
    reel_rate: null,
    story_rate: null,
  },
  {
    key: 'vikram',
    full_name: 'Vikram Joshi',
    mobile_number: '+919010010105',
    city: 'Mumbai',
    instagram_url: 'https://instagram.com/vikram.bites',
    classification: 'mid',
    open_to_paid: false,
    open_to_barter: true,
    reel_rate: null,
    story_rate: null,
  },
  {
    key: 'kavya',
    full_name: 'Kavya Reddy',
    mobile_number: '+919010010106',
    city: 'Hyderabad',
    instagram_url: 'https://instagram.com/kavya.plates',
    classification: 'micro',
    open_to_paid: true,
    open_to_barter: true,
    reel_rate: 15000,
    story_rate: 5000,
  },
  {
    key: 'dev',
    full_name: 'Dev Malhotra',
    mobile_number: '+919010010107',
    city: 'Gurgaon',
    instagram_url: 'https://instagram.com/dev.dines',
    classification: 'nano',
    open_to_paid: true,
    open_to_barter: false,
    reel_rate: 8000,
    story_rate: null,
  },
  {
    key: 'ananya_c',
    full_name: 'Ananya Chopra',
    mobile_number: '+919010010108',
    city: 'Chennai',
    instagram_url: 'https://instagram.com/ananya.eats',
    classification: 'category_a',
    open_to_paid: true,
    open_to_barter: true,
    reel_rate: 25000,
    story_rate: 8000,
  },
  {
    key: 'riya',
    full_name: 'Riya Singh',
    mobile_number: '+919010010109',
    city: 'Kolkata',
    instagram_url: null,
    classification: 'micro',
    open_to_paid: true,
    open_to_barter: true,
    reel_rate: 10000,
    story_rate: 3500,
  },
  {
    key: 'siddharth',
    full_name: 'Siddharth Rao',
    mobile_number: '+919010010110',
    city: 'Bangalore',
    instagram_url: 'https://instagram.com/sid.foodie',
    classification: 'fnb_specialist',
    open_to_paid: true,
    open_to_barter: true,
    reel_rate: 22000,
    story_rate: 7000,
  },
];

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

function buildEngagementPlan(dates) {
  const { today, yesterday, inThreeDays, fiveDaysAgo, tenDaysAgo } = dates;

  return [
    {
      campaignKey: 'summer',
      contactKey: 'priya',
      managerKey: 'actor',
      status: 'in_conversation',
      interest_level: 'high',
      initial_contact_date: tenDaysAgo,
      last_contact_date: yesterday,
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
      next_follow_up_date: today,
      notes: 'Interested in reel + story — follow up today',
    },
    {
      campaignKey: 'summer',
      contactKey: 'arjun',
      managerKey: 'actor',
      status: 'scheduled',
      interest_level: 'high',
      initial_contact_date: tenDaysAgo,
      last_contact_date: yesterday,
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
      visit_date: today,
      visit_time: '14:30:00',
      visit_outlet: 'GlowCo Bandra',
      visit_notes: 'Lunch slot — confirm with outlet',
      next_follow_up_date: today,
      primary_collaboration_reason: 'positioning',
      collaboration_type: 'paid',
      agreed_fee: 28000,
      deliverables: [{ type: 'reel', status: 'pending', due: inThreeDays }],
    },
    {
      campaignKey: 'summer',
      contactKey: 'tanvi',
      managerKey: 'actor',
      status: 'awaiting_final_deliverables',
      interest_level: 'medium',
      initial_contact_date: addDaysIso(today, -14),
      last_contact_date: fiveDaysAgo,
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
      visit_date: fiveDaysAgo,
      visit_completed_date: fiveDaysAgo,
      next_follow_up_date: inThreeDays,
      primary_collaboration_reason: 'virality',
      collaboration_type: 'paid',
      agreed_fee: 15000,
      deliverables: [
        { type: 'reel', status: 'pending', due: yesterday },
        { type: 'story', status: 'received', due: today },
      ],
    },
    {
      campaignKey: 'summer',
      contactKey: 'meera',
      managerKey: 'rohan',
      status: 'not_contacted',
      interest_level: 'unknown',
    },
    {
      campaignKey: 'summer',
      contactKey: 'vikram',
      managerKey: 'aisha',
      status: 'collaboration_complete',
      interest_level: 'high',
      initial_contact_date: addDaysIso(today, -20),
      last_contact_date: fiveDaysAgo,
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
      visit_date: addDaysIso(today, -8),
      visit_completed_date: addDaysIso(today, -8),
      next_follow_up_date: null,
      primary_collaboration_reason: 'expert',
      collaboration_type: 'barter',
      agreed_fee: null,
      deliverables: [
        {
          type: 'reel',
          status: 'posted',
          due: fiveDaysAgo,
          published_date: fiveDaysAgo,
          content_link: 'https://instagram.com/p/demo-vikram-reel',
        },
      ],
      feedback: {
        content_quality: 5,
        professionalism: 5,
        timeliness: 4,
        adherence_to_terms: true,
        would_work_again: true,
        internal_notes: 'Strong reel — would repeat for menu launches',
      },
    },
    {
      campaignKey: 'monsoon',
      contactKey: 'kavya',
      managerKey: 'actor',
      status: 'in_conversation',
      interest_level: 'medium',
      initial_contact_date: addDaysIso(today, -6),
      last_contact_date: yesterday,
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
      next_follow_up_date: today,
      notes: 'Asked for menu brief',
    },
    {
      campaignKey: 'monsoon',
      contactKey: 'dev',
      managerKey: 'rohan',
      status: 'dropped_not_interested',
      interest_level: 'low',
      initial_contact_date: addDaysIso(today, -12),
      last_contact_date: fiveDaysAgo,
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
      next_follow_up_date: null,
      dropped_from: 'in_conversation',
      notes: 'Declined after rate discussion',
    },
    {
      campaignKey: 'monsoon',
      contactKey: 'ananya_c',
      managerKey: 'neha',
      status: 'scheduled',
      interest_level: 'high',
      initial_contact_date: addDaysIso(today, -9),
      last_contact_date: yesterday,
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
      visit_date: inThreeDays,
      visit_time: '11:00:00',
      visit_outlet: 'BrewHaus Indiranagar',
      next_follow_up_date: inThreeDays,
      primary_collaboration_reason: 'virality',
      collaboration_type: 'paid',
      agreed_fee: 22000,
      deliverables: [
        { type: 'reel', status: 'pending', due: addDaysIso(inThreeDays, 5) },
        { type: 'story', status: 'pending', due: addDaysIso(inThreeDays, 5) },
      ],
    },
    {
      campaignKey: 'monsoon',
      contactKey: 'riya',
      managerKey: 'rohan',
      status: 'no_response',
      interest_level: 'unknown',
      initial_contact_date: addDaysIso(today, -10),
      last_contact_date: fiveDaysAgo,
      last_contact_log_type: 'no_reply_attempt',
      no_reply_count: 2,
      next_follow_up_date: yesterday,
      notes: 'Two outreach attempts',
    },
    {
      campaignKey: 'festival',
      contactKey: 'siddharth',
      managerKey: 'aisha',
      status: 'not_contacted',
      interest_level: 'unknown',
    },
  ];
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
    `DELETE FROM feedback
     WHERE engagement_id IN (SELECT id FROM engagements WHERE campaign_id = ANY($1))`,
    [campaignIds],
  );
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
  if (existing.rows[0]) {
    await client.query(
      `UPDATE contacts SET
         full_name = $2,
         city = $3,
         instagram_url = $4,
         classification = $5,
         open_to_paid = $6,
         open_to_barter = $7,
         reel_rate = $8,
         story_rate = $9,
         updated_at = now()
       WHERE id = $1`,
      [
        existing.rows[0].id,
        contact.full_name,
        contact.city,
        contact.instagram_url,
        contact.classification,
        contact.open_to_paid,
        contact.open_to_barter,
        contact.reel_rate,
        contact.story_rate,
      ],
    );
    return existing.rows[0].id;
  }

  const { rows } = await client.query(
    `INSERT INTO contacts (
       full_name, mobile_number, city, instagram_url, classification,
       open_to_paid, open_to_barter, reel_rate, story_rate,
       status, source, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 'manual_entry', $10)
     RETURNING id`,
    [
      contact.full_name,
      contact.mobile_number,
      contact.city,
      contact.instagram_url,
      contact.classification,
      contact.open_to_paid,
      contact.open_to_barter,
      contact.reel_rate,
      contact.story_rate,
      createdBy,
    ],
  );
  return rows[0].id;
}

async function upsertEngagement(client, { contactId, campaignId, managerId, plan, createdBy }) {
  const fields = {
    status: plan.status,
    interest_level: plan.interest_level ?? 'unknown',
    initial_contact_date: plan.initial_contact_date ?? null,
    last_contact_date: plan.last_contact_date ?? null,
    last_contact_log_type: plan.last_contact_log_type ?? null,
    no_reply_count: plan.no_reply_count ?? 0,
    next_follow_up_date: plan.next_follow_up_date ?? null,
    visit_date: plan.visit_date ?? null,
    visit_time: plan.visit_time ?? null,
    visit_outlet: plan.visit_outlet ?? null,
    visit_notes: plan.visit_notes ?? null,
    visit_completed_date: plan.visit_completed_date ?? null,
    collaboration_type: plan.collaboration_type ?? null,
    agreed_fee: plan.agreed_fee ?? null,
    primary_collaboration_reason: plan.primary_collaboration_reason ?? null,
    dropped_from: plan.dropped_from ?? null,
    notes: plan.notes ?? null,
  };

  let visitOutletId = plan.visit_outlet_id ?? null;
  if (!visitOutletId && fields.visit_date) {
    const { rows: outletRows } = await client.query(
      `SELECT o.id, o.outlet_name
       FROM campaigns c
       JOIN outlets o ON o.brand_id = c.brand_id AND o.is_default
       WHERE c.id = $1`,
      [campaignId],
    );
    visitOutletId = outletRows[0]?.id ?? null;
    if (!fields.visit_outlet && outletRows[0]?.outlet_name) {
      fields.visit_outlet = outletRows[0].outlet_name;
    }
  }

  const existing = await client.query(
    `SELECT id, conversation_status FROM engagements
     WHERE contact_id = $1 AND campaign_id = $2`,
    [contactId, campaignId],
  );

  if (existing.rows[0]) {
    const { rows } = await client.query(
      `UPDATE engagements SET
         assigned_manager = $2,
         conversation_status = $3,
         interest_level = $4,
         initial_contact_date = $5,
         last_contact_date = $6,
         last_contact_log_type = $7,
         no_reply_count = $8,
         next_follow_up_date = $9,
         visit_date = $10,
         visit_time = $11,
         visit_outlet = $12,
         visit_notes = $13,
         visit_completed_date = $14,
         visit_outlet_id = $15,
         collaboration_type = $16,
         agreed_fee = $17,
         primary_collaboration_reason = $18,
         dropped_from = $19,
         notes = $20,
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [
        existing.rows[0].id,
        managerId,
        fields.status,
        fields.interest_level,
        fields.initial_contact_date,
        fields.last_contact_date,
        fields.last_contact_log_type,
        fields.no_reply_count,
        fields.next_follow_up_date,
        fields.visit_date,
        fields.visit_time,
        fields.visit_outlet,
        fields.visit_notes,
        fields.visit_completed_date,
        visitOutletId,
        fields.collaboration_type,
        fields.agreed_fee,
        fields.primary_collaboration_reason,
        fields.dropped_from,
        fields.notes,
      ],
    );
    return rows[0].id;
  }

  const { rows } = await client.query(
    `INSERT INTO engagements (
       contact_id, campaign_id, assigned_manager, conversation_status, interest_level,
       initial_contact_date, last_contact_date, last_contact_log_type, no_reply_count,
       next_follow_up_date, visit_date, visit_time, visit_outlet, visit_notes, visit_completed_date,
       visit_outlet_id, collaboration_type, agreed_fee, primary_collaboration_reason, dropped_from, notes, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     RETURNING id`,
    [
      contactId,
      campaignId,
      managerId,
      fields.status,
      fields.interest_level,
      fields.initial_contact_date,
      fields.last_contact_date,
      fields.last_contact_log_type,
      fields.no_reply_count,
      fields.next_follow_up_date,
      fields.visit_date,
      fields.visit_time,
      fields.visit_outlet,
      fields.visit_notes,
      fields.visit_completed_date,
      visitOutletId,
      fields.collaboration_type,
      fields.agreed_fee,
      fields.primary_collaboration_reason,
      fields.dropped_from,
      fields.notes,
      createdBy,
    ],
  );
  return rows[0].id;
}

async function syncDeliverables(client, engagementId, deliverables) {
  if (!deliverables?.length) {
    await client.query('DELETE FROM deliverables WHERE engagement_id = $1', [engagementId]);
    return;
  }

  await client.query('DELETE FROM deliverables WHERE engagement_id = $1', [engagementId]);
  for (const d of deliverables) {
    await client.query(
      `INSERT INTO deliverables (
         engagement_id, deliverable_type, status, due_date, published_date, content_link
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        engagementId,
        d.type,
        d.status,
        d.due ?? null,
        d.published_date ?? null,
        d.content_link ?? null,
      ],
    );
  }
}

async function syncFeedback(client, engagementId, feedback, actorId) {
  if (!feedback) {
    await client.query('DELETE FROM feedback WHERE engagement_id = $1', [engagementId]);
    return;
  }

  await client.query(
    `INSERT INTO feedback (
       engagement_id, content_quality, professionalism, timeliness,
       adherence_to_terms, would_work_again, internal_notes, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (engagement_id) DO UPDATE SET
       content_quality = EXCLUDED.content_quality,
       professionalism = EXCLUDED.professionalism,
       timeliness = EXCLUDED.timeliness,
       adherence_to_terms = EXCLUDED.adherence_to_terms,
       would_work_again = EXCLUDED.would_work_again,
       internal_notes = EXCLUDED.internal_notes,
       updated_at = now()`,
    [
      engagementId,
      feedback.content_quality,
      feedback.professionalism,
      feedback.timeliness,
      feedback.adherence_to_terms,
      feedback.would_work_again,
      feedback.internal_notes ?? null,
      actorId,
    ],
  );
}

async function applyEngagementPlan(client, { plan, campaignIds, contactIds, userIds, actor }) {
  const managerId = plan.managerKey === 'actor' ? actor.id : userIds[plan.managerKey];
  const campaignId = campaignIds[plan.campaignKey];
  const contactId = contactIds[plan.contactKey];
  if (!campaignId || !contactId) return null;

  const existing = await client.query(
    `SELECT id, conversation_status FROM engagements
     WHERE contact_id = $1 AND campaign_id = $2`,
    [contactId, campaignId],
  );
  const isAlreadyComplete = existing.rows[0]?.conversation_status === 'collaboration_complete';

  if (existing.rows[0] && isAlreadyComplete && plan.status === 'collaboration_complete') {
    const engagementId = existing.rows[0].id;
    await syncDeliverables(client, engagementId, plan.deliverables);
    await upsertEngagement(client, {
      contactId,
      campaignId,
      managerId,
      plan,
      createdBy: actor.id,
    });
    await syncFeedback(client, engagementId, plan.feedback, actor.id);
    await client.query('SELECT recompute_contact_summary($1)', [contactId]);
    return engagementId;
  }

  let workingPlan = { ...plan };
  if (workingPlan.status === 'collaboration_complete' && !isAlreadyComplete) {
    workingPlan = { ...workingPlan, status: 'awaiting_final_deliverables' };
  }

  const engagementId = await upsertEngagement(client, {
    contactId,
    campaignId,
    managerId,
    plan: workingPlan,
    createdBy: actor.id,
  });

  await syncDeliverables(client, engagementId, plan.deliverables);

  if (plan.status === 'collaboration_complete' && !isAlreadyComplete) {
    await client.query(
      `UPDATE engagements
       SET conversation_status = 'collaboration_complete',
           primary_collaboration_reason = $2,
           next_follow_up_date = NULL
       WHERE id = $1`,
      [engagementId, plan.primary_collaboration_reason ?? 'expert'],
    );
  } else if (plan.status === 'collaboration_complete' && isAlreadyComplete) {
    await client.query(
      `UPDATE engagements
       SET primary_collaboration_reason = $2,
           visit_completed_date = COALESCE($3, visit_completed_date),
           collaboration_type = $4,
           next_follow_up_date = NULL
       WHERE id = $1`,
      [
        engagementId,
        plan.primary_collaboration_reason ?? 'expert',
        plan.visit_completed_date ?? null,
        plan.collaboration_type ?? null,
      ],
    );
  }

  await syncFeedback(client, engagementId, plan.feedback, actor.id);

  if (plan.contactKey === 'vikram') {
    await client.query('SELECT recompute_contact_summary($1)', [contactId]);
  }

  return engagementId;
}

async function ensureDemoOutlets(client, brandIds) {
  const outletIds = {};
  for (const [brandKey, outletName] of Object.entries(DEMO_OUTLETS)) {
    const brandId = brandIds[brandKey];
    if (!brandId) continue;
    const existing = await client.query(
      `SELECT id FROM outlets WHERE brand_id = $1 AND is_default`,
      [brandId],
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE outlets SET outlet_name = $2, updated_at = now() WHERE id = $1`,
        [existing.rows[0].id, outletName],
      );
      outletIds[brandKey] = existing.rows[0].id;
      continue;
    }
    const { rows } = await client.query(
      `INSERT INTO outlets (brand_id, outlet_name, is_default) VALUES ($1, $2, true) RETURNING id`,
      [brandId, outletName],
    );
    outletIds[brandKey] = rows[0].id;
  }
  return outletIds;
}

async function seedBrandsAndCampaigns(client, userIds, actor) {
  const today = todayIstIso();
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
    const existing = await client.query(
      `SELECT id FROM campaigns WHERE campaign_name = $1 AND objective = $2`,
      [c.name, DEMO_MARKER],
    );
    if (existing.rows[0]) {
      campaignIds[c.key] = existing.rows[0].id;
    } else {
      const { rows } = await client.query(
        `INSERT INTO campaigns (
           campaign_name, brand_id, campaign_type, objective, status,
           target_collaborations, start_date, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          c.name,
          brandIds[c.brandKey],
          c.type,
          DEMO_MARKER,
          c.status,
          c.target,
          c.status === 'active' ? addDaysIso(today, -30) : null,
          actor.id,
        ],
      );
      campaignIds[c.key] = rows[0].id;
    }

    for (const mk of c.managerKeys) {
      await client.query(
        `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [campaignIds[c.key], userIds[mk]],
      );
    }
    if (c.status === 'active') {
      await client.query(
        `INSERT INTO campaign_managers (campaign_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [campaignIds[c.key], actor.id],
      );
    }
  }

  const outletIds = await ensureDemoOutlets(client, brandIds);

  return { campaignIds, outletIds, brandIds };
}

export async function repairDemoHygiene(client, { actorUserId } = {}) {
  const actor = actorUserId ? { id: actorUserId } : await resolveSeedActor(client);
  const userIds = await ensureDemoUsers(client);
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [actor.id]);

  const today = todayIstIso();
  const dates = {
    today,
    yesterday: addDaysIso(today, -1),
    inThreeDays: addDaysIso(today, 3),
    fiveDaysAgo: addDaysIso(today, -5),
    tenDaysAgo: addDaysIso(today, -10),
  };

  const contactIds = {};
  for (const c of DEMO_CONTACTS) {
    contactIds[c.key] = await upsertContact(client, c, actor.id);
  }

  const { campaignIds } = await seedBrandsAndCampaigns(client, userIds, actor);
  const plan = buildEngagementPlan(dates);

  let engagementCount = 0;
  for (const item of plan) {
    const id = await applyEngagementPlan(client, {
      plan: item,
      campaignIds,
      contactIds,
      userIds,
      actor,
    });
    if (id) engagementCount += 1;
  }

  return {
    repaired: true,
    message: 'Demo fixture hygiene applied',
    contacts: DEMO_CONTACTS.length,
    engagements: engagementCount,
  };
}

export async function seedDemoFixtures(client, { actorUserId, reset = false } = {}) {
  if (reset) {
    await clearDemoFixtures(client);
  } else if (await hasDemoFixtures(client)) {
    return repairDemoHygiene(client, { actorUserId });
  }

  const actor = actorUserId ? { id: actorUserId } : await resolveSeedActor(client);
  const userIds = await ensureDemoUsers(client);
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [actor.id]);

  const today = todayIstIso();
  const dates = {
    today,
    yesterday: addDaysIso(today, -1),
    inThreeDays: addDaysIso(today, 3),
    fiveDaysAgo: addDaysIso(today, -5),
    tenDaysAgo: addDaysIso(today, -10),
  };

  const contactIds = {};
  for (const c of DEMO_CONTACTS) {
    contactIds[c.key] = await upsertContact(client, c, actor.id);
  }

  const { campaignIds } = await seedBrandsAndCampaigns(client, userIds, actor);
  const plan = buildEngagementPlan(dates);

  let engagementCount = 0;
  for (const item of plan) {
    const id = await applyEngagementPlan(client, {
      plan: item,
      campaignIds,
      contactIds,
      userIds,
      actor,
    });
    if (id) engagementCount += 1;
  }

  return {
    skipped: false,
    message: reset ? 'Demo fixtures reloaded' : 'Demo fixtures loaded',
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
  const repairOnly = process.argv.includes('--repair');
  try {
    if (repairOnly && !reset) {
      const client = new pg.Client(pgClientConfig(process.env.DATABASE_URL?.trim()));
      await client.connect();
      try {
        await client.query('BEGIN');
        const result = await repairDemoHygiene(client);
        await client.query('COMMIT');
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        await client.end();
      }
    } else {
      const result = await runDemoSeed({ reset });
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}
