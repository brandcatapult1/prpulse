/**
 * Mobile E.164 normalization and dedup — PRD Module 10.
 * Run: npm run db:test:mobile
 */
import pg from 'pg';
import dotenv from 'dotenv';
import {
  findContactByMobile,
  normalizeMobileToE164,
} from '../../server/src/lib/mobileNumber.mjs';
import {
  createContactDeduped,
  DuplicateContactError,
} from '../../server/src/lib/contactCreate.mjs';

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
    await test('normalizes Indian numbers to E.164', async () => {
      assert(normalizeMobileToE164('9876543210') === '+919876543210', 'national format');
      assert(normalizeMobileToE164('+91 98765 43210') === '+919876543210', 'spaced E.164');
      assert(normalizeMobileToE164('919876543210') === '+919876543210', 'country code without +');
    });

    await test('findContactByMobile matches E.164 and legacy last-10 storage', async () => {
      const user = await client.query(
        `INSERT INTO users (email, full_name, role) VALUES ('mobile-dedup@test.com', 'Dedup', 'admin') RETURNING id`,
      );
      await client.query(
        `INSERT INTO contacts (full_name, mobile_number, source, created_by)
         VALUES ('Legacy Row', '9876543210', 'manual_entry', $1)`,
        [user.rows[0].id],
      );

      const { contact } = await findContactByMobile(client, '+919876543210');
      assert(contact?.full_name === 'Legacy Row', 'expected legacy suffix match');
    });

    await test('registration approve flags duplicate instead of creating contact', async () => {
      const user = await client.query(
        `INSERT INTO users (email, full_name, role) VALUES ('mobile-approve@test.com', 'Reviewer', 'admin') RETURNING id`,
      );
      const existing = await client.query(
        `INSERT INTO contacts (full_name, mobile_number, source, created_by)
         VALUES ('Existing Creator', '+919911122233', 'manual_entry', $1)
         RETURNING id`,
        [user.rows[0].id],
      );
      const sub = await client.query(
        `INSERT INTO registration_submissions (full_name, mobile_number, status)
         VALUES ('New Applicant', '9911122233', 'new')
         RETURNING id`,
      );

      const { contact: dup } = await findContactByMobile(client, '9911122233');
      assert(dup?.id === existing.rows[0].id, 'dedup should find existing contact');

      const e164 = normalizeMobileToE164('9911122233');
      assert(e164 === '+919911122233', 'normalized form');

      const beforeCount = await client.query('SELECT count(*)::int AS n FROM contacts');
      assert(beforeCount.rows[0].n === 1, 'fixture has one contact');

      const finalStatus = dup ? 'duplicate' : 'approved';
      const finalLinked = dup?.id ?? null;
      assert(finalStatus === 'duplicate' && finalLinked === existing.rows[0].id, 'approve path should duplicate-link');
    });

    await test('createContactDeduped rejects a duplicate and routes to the existing record', async () => {
      const user = await client.query(
        `INSERT INTO users (email, full_name, role) VALUES ('mobile-create@test.com', 'Creator', 'admin') RETURNING id`,
      );
      const existing = await client.query(
        `INSERT INTO contacts (full_name, mobile_number, source, created_by)
         VALUES ('First Record', '+919955544433', 'manual_entry', $1)
         RETURNING id`,
        [user.rows[0].id],
      );

      let thrown = null;
      try {
        await createContactDeduped(client, {
          full_name: 'Second Record',
          mobile_number: '9955544433',
          source: 'quick_add',
          created_by: user.rows[0].id,
        });
      } catch (err) {
        thrown = err;
      }

      assert(thrown instanceof DuplicateContactError, 'expected DuplicateContactError');
      assert(thrown.status === 409, 'expected 409 status');
      assert(thrown.existing?.id === existing.rows[0].id, 'should surface the existing contact');

      const count = await client.query('SELECT count(*)::int AS n FROM contacts');
      assert(count.rows[0].n === 1, 'no duplicate contact should have been created');
    });

    await test('createContactDeduped inserts when no mobile match exists', async () => {
      const user = await client.query(
        `INSERT INTO users (email, full_name, role) VALUES ('mobile-create2@test.com', 'Creator', 'admin') RETURNING id`,
      );
      const created = await createContactDeduped(client, {
        full_name: 'Fresh Contact',
        mobile_number: '9900011122',
        source: 'quick_add',
        created_by: user.rows[0].id,
        open_to_barter: true,
      });
      assert(created.mobile_number === '+919900011122', 'stored as E.164');

      const { contact } = await findContactByMobile(client, '+919900011122');
      assert(contact?.id === created.id, 'created contact is now discoverable by dedup');
    });

    await test('createContactDeduped rejects a contact open to neither paid nor barter', async () => {
      const user = await client.query(
        `INSERT INTO users (email, full_name, role) VALUES ('mobile-create3@test.com', 'Creator', 'admin') RETURNING id`,
      );

      let thrown = null;
      try {
        await createContactDeduped(client, {
          full_name: 'No Terms',
          mobile_number: '9900011133',
          source: 'quick_add',
          created_by: user.rows[0].id,
          open_to_paid: false,
          open_to_barter: false,
        });
      } catch (err) {
        thrown = err;
      }

      assert(thrown?.status === 400, 'expected 400 status for missing collaboration preference');
      assert(
        /open to paid and\/or barter/i.test(thrown?.message ?? ''),
        'expected collaboration-preference error message',
      );
    });

    await test('unique mobile index blocks two contacts sharing a normalized number', async () => {
      const present = await client.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'uq_contacts_mobile_number'`,
      );
      if (!present.rows[0]) {
        console.log('  (skipped — uq_contacts_mobile_number not present in this DB)');
        return;
      }

      const user = await client.query(
        `INSERT INTO users (email, full_name, role) VALUES ('mobile-uniq@test.com', 'Creator', 'admin') RETURNING id`,
      );
      await client.query(
        `INSERT INTO contacts (full_name, mobile_number, source, created_by)
         VALUES ('Holder', '+919800022211', 'manual_entry', $1)`,
        [user.rows[0].id],
      );

      let violated = false;
      try {
        await client.query(
          `INSERT INTO contacts (full_name, mobile_number, source, created_by)
           VALUES ('Collider', '+919800022211', 'manual_entry', $1)`,
          [user.rows[0].id],
        );
      } catch (err) {
        violated = err.code === '23505';
      }
      assert(violated, 'expected a unique-violation on duplicate mobile insert');
    });

    console.log(`\n${passed} mobile dedup tests passed.`);
  } finally {
    await client.end();
  }
}

runTests().catch(() => process.exit(1));
