/**
 * System labels New / Recent / Frequent are derived from deliverable completion and self-expire.
 *   New       contact created within 45 days
 *   Recent    any deliverable completed within 15 days
 *   Frequent  3+ campaigns with ALL deliverables completed, the last completing within 60 days
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
    return rows.map((r) => r.name).join(',');
  };
  const refresh = () => client.query('SELECT recompute_contact_system_tags(NULL)');

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

    // ── New ──
    assert(await labels(contactId) === 'New', 'new contact gets New immediately');
    await client.query(`UPDATE contacts SET created_at = now() - interval '44 days' WHERE id = $1`, [contactId]);
    await refresh();
    assert((await labels(contactId)).includes('New'), 'still New at 44 days');
    await client.query(`UPDATE contacts SET created_at = now() - interval '50 days' WHERE id = $1`, [contactId]);
    await refresh();
    assert(await labels(contactId) === '', 'New removed after 45 days');

    // A campaign with `posted` completed deliverables (+ optional still-pending ones).
    // Completion date is backdated by editing completed_at only (the status trigger does not fire).
    const addCampaign = async (n, completedDaysAgo, { posted = 1, pending = 0 } = {}) => {
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
      const ids = [];
      for (let i = 0; i < posted + pending; i += 1) {
        const d = await client.query(
          `INSERT INTO deliverables (engagement_id, deliverable_type, quantity, status)
           VALUES ($1, 'reel', 1, 'pending') RETURNING id`,
          [eng.rows[0].id],
        );
        ids.push(d.rows[0].id);
      }
      for (const id of ids.slice(0, posted)) {
        await client.query(
          `UPDATE deliverables SET status = 'posted', posted_quantity = 1, published_date = CURRENT_DATE,
             content_link = $2 WHERE id = $1`,
          [id, `https://instagram.com/p/sys-${n}-${id.slice(0, 4)}`],
        );
        await client.query(
          `UPDATE deliverables SET completed_at = now() - ($2 || ' days')::interval WHERE id = $1`,
          [id, String(completedDaysAgo)],
        );
      }
      return { engagementId: eng.rows[0].id, deliverableIds: ids };
    };

    // ── completed_at trigger ──
    const probe = await addCampaign(0, 0, { posted: 0, pending: 1 });
    const probeId = probe.deliverableIds[0];
    const stamp = async () => (await client.query('SELECT completed_at FROM deliverables WHERE id = $1', [probeId])).rows[0].completed_at;
    assert((await stamp()) === null, 'pending deliverable has no completed_at');
    await client.query(
      `UPDATE deliverables SET status = 'posted', posted_quantity = 1, content_link = 'https://instagram.com/p/probe' WHERE id = $1`,
      [probeId],
    );
    assert((await stamp()) !== null, 'completed_at stamped when marked posted');
    await client.query(`UPDATE deliverables SET status = 'pending', posted_quantity = 0 WHERE id = $1`, [probeId]);
    assert((await stamp()) === null, 'completed_at cleared when no longer posted');
    await client.query('DELETE FROM engagements WHERE id = $1', [probe.engagementId]);

    // ── Recent: any deliverable completed within 15 days ──
    const c1 = await addCampaign(1, 20);
    await refresh();
    assert(await labels(contactId) === '', 'deliverable completed 20 days ago is not Recent');
    await client.query(`UPDATE deliverables SET completed_at = now() - interval '3 days' WHERE id = ANY($1::uuid[])`, [c1.deliverableIds]);
    await refresh();
    assert(await labels(contactId) === 'Recent', 'deliverable completed 3 days ago is Recent');

    // Recent needs only ONE deliverable — the campaign may still have pending ones
    await client.query(`UPDATE deliverables SET completed_at = now() - interval '20 days' WHERE id = ANY($1::uuid[])`, [c1.deliverableIds]);
    await addCampaign(2, 2, { posted: 1, pending: 1 });
    await refresh();
    assert(await labels(contactId) === 'Recent', 'one completed deliverable is enough for Recent');

    // ── Frequent: 3 campaigns with ALL deliverables completed within 60 days ──
    await addCampaign(3, 30);
    await refresh();
    assert(!(await labels(contactId)).includes('Frequent'), 'campaign with a pending deliverable does not count');
    await addCampaign(4, 50);
    await refresh();
    const fully = await client.query(
      `SELECT COUNT(DISTINCT e.campaign_id)::int AS n FROM engagements e
       WHERE e.contact_id = $1 AND fn_engagement_deliverables_complete(e.id)`, [contactId]);
    assert(fully.rows[0].n === 3, 'three campaigns fully complete');
    assert((await labels(contactId)).includes('Frequent'), '3 fully-completed campaigns in 60 days => Frequent');

    // the pending one finishes -> still Frequent (4 campaigns)
    await client.query(`UPDATE deliverables d SET status = 'posted', posted_quantity = 1, content_link = 'https://instagram.com/p/late'
                        FROM engagements e WHERE d.engagement_id = e.id AND e.contact_id = $1 AND d.status = 'pending'`, [contactId]);
    assert((await labels(contactId)).includes('Frequent'), 'completing the last deliverable keeps Frequent (event-driven)');

    // age everything out
    await client.query(
      `UPDATE deliverables d SET completed_at = now() - interval '70 days'
       FROM engagements e WHERE d.engagement_id = e.id AND e.contact_id = $1`, [contactId]);
    await refresh();
    assert(await labels(contactId) === '', 'Frequent and Recent drop when the windows pass');

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
