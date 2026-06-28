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

  // v_deliverables was originally created as `SELECT d.*` and froze its column
  // list before posted_quantity / unit_proofs existed (added later to the table
  // but not re-expanded into the view). That makes logged posted counts read
  // back as 0 even though the PATCH wrote them. Self-heal: if the view is
  // missing posted_quantity, drop and recreate it so d.* re-expands.
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.v_deliverables') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'v_deliverables'
             AND column_name = 'posted_quantity'
         ) THEN
        DROP VIEW v_deliverables;
        CREATE VIEW v_deliverables AS
        SELECT d.*,
               (d.status <> 'posted'
                AND d.due_date IS NOT NULL
                AND d.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS is_overdue
        FROM deliverables d;
        RAISE NOTICE 'Repaired v_deliverables: re-expanded to include posted_quantity / unit_proofs.';
      END IF;
    END $$;
  `);
}
