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

    console.log(`\n${passed} mobile dedup tests passed.`);
  } finally {
    await client.end();
  }
}

runTests().catch(() => process.exit(1));
