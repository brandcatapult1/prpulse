-- Optional per-deliverable fee (internal notes-level detail; independent of engagements.agreed_fee).

ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS line_fee numeric(12,2);

-- Mirror fn_engagement_before agreed_fee freeze: block line_fee changes while complete.
CREATE OR REPLACE FUNCTION fn_deliverable_before() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  eng_status conversation_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.line_fee IS DISTINCT FROM OLD.line_fee THEN
      SELECT conversation_status INTO eng_status
      FROM engagements WHERE id = NEW.engagement_id;
      IF eng_status = 'collaboration_complete' THEN
        RAISE EXCEPTION
          'Line fee is frozen while the engagement is Completed; reopen it to amend'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliverables_before ON deliverables;
CREATE TRIGGER trg_deliverables_before
  BEFORE UPDATE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION fn_deliverable_before();
