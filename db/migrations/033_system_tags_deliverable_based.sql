-- System labels now follow deliverable completion (not engagement completion).
--   New       contact created within the last 45 days (unchanged)
--   Recent    any deliverable marked completed (posted) within the last 15 days
--   Frequent  3+ campaigns whose deliverables are ALL completed, the last of them
--             completing within the last 60 days
-- "Completed" date = the day the deliverable was marked posted (deliverables.completed_at).
-- All dates IST.

ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Existing posted deliverables: best available date is their last update.
UPDATE deliverables SET completed_at = updated_at WHERE status = 'posted' AND completed_at IS NULL;

-- Stamp when a deliverable becomes posted; clear when it stops being posted.
CREATE OR REPLACE FUNCTION fn_deliverable_completed_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'posted' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted' OR NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    ELSE
      NEW.completed_at := OLD.completed_at;
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliverable_completed_at ON deliverables;
CREATE TRIGGER trg_deliverable_completed_at
  BEFORE INSERT OR UPDATE OF status ON deliverables
  FOR EACH ROW EXECUTE FUNCTION fn_deliverable_completed_at();

CREATE OR REPLACE FUNCTION fn_contact_system_tags_desired(p_contact_id uuid DEFAULT NULL)
RETURNS TABLE (contact_id uuid, tag_id uuid) LANGUAGE sql STABLE AS $$
  SELECT c.id, t.id
  FROM contacts c
  CROSS JOIN tags t
  CROSS JOIN (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d) today
  WHERE t.type = 'system'
    AND (p_contact_id IS NULL OR c.id = p_contact_id)
    AND (
      (t.system_key = 'new'
        AND (c.created_at AT TIME ZONE 'Asia/Kolkata')::date >= today.d - 45)
      OR (t.system_key = 'recent' AND EXISTS (
        SELECT 1
        FROM engagements e
        JOIN deliverables d ON d.engagement_id = e.id
        WHERE e.contact_id = c.id
          AND d.status = 'posted'
          AND d.completed_at IS NOT NULL
          AND (d.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= today.d - 15))
      OR (t.system_key = 'frequent' AND (
        SELECT COUNT(DISTINCT e.campaign_id)
        FROM engagements e
        WHERE e.contact_id = c.id
          AND fn_engagement_deliverables_complete(e.id)
          AND (
            SELECT (MAX(d.completed_at) AT TIME ZONE 'Asia/Kolkata')::date
            FROM deliverables d WHERE d.engagement_id = e.id
          ) >= today.d - 60) >= 3)
    );
$$;

SELECT recompute_contact_system_tags(NULL);
