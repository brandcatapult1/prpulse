/** Idempotent schema repairs for tables that must exist at runtime. */
export async function ensureCriticalSchema(pool) {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_settings (
      id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      logo_url   text,
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO org_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;
  `);

  // One contact per normalized mobile number (PRD dedup). Self-healing: skips
  // creation while legacy duplicates exist so a dirty DB still boots, and
  // applies automatically once the duplicates are resolved.
  await pool.query(`
    DO $$
    DECLARE v_dups int;
    BEGIN
      IF to_regclass('public.contacts') IS NULL THEN
        RETURN;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_contacts_mobile_number') THEN
        RETURN;
      END IF;

      SELECT count(*) INTO v_dups FROM (
        SELECT mobile_number
        FROM contacts
        WHERE mobile_number IS NOT NULL
        GROUP BY mobile_number
        HAVING count(*) > 1
      ) d;

      IF v_dups = 0 THEN
        CREATE UNIQUE INDEX uq_contacts_mobile_number
          ON contacts (mobile_number)
          WHERE mobile_number IS NOT NULL;
      ELSE
        RAISE NOTICE 'Deferred uq_contacts_mobile_number: % duplicate mobile group(s) present; resolve to enforce.', v_dups;
      END IF;
    END $$;
  `);
}
