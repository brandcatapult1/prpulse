-- Enforce one contact per normalized mobile number (PRD Module 10 dedup).
-- The "Continue anyway" path previously allowed two contacts to share a number,
-- which collides on every future dedup lookup. Creation now routes to the
-- existing record instead; this index is the structural backstop.
--
-- Conditional: if legacy duplicates exist, the index is deferred (not an error)
-- so the deploy still succeeds. ensureCriticalSchema retries on every boot and
-- applies it automatically once duplicates are resolved.

DO $$
DECLARE v_dups int;
BEGIN
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
    RAISE NOTICE 'Deferred uq_contacts_mobile_number: % duplicate mobile group(s) present', v_dups;
  END IF;
END $$;
