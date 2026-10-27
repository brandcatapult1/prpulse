DROP TRIGGER IF EXISTS trg_deliverable_completed_at ON deliverables;
DROP FUNCTION IF EXISTS fn_deliverable_completed_at();

-- Back to the engagement-based rules from migration 031.
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
        SELECT 1 FROM engagements e
        WHERE e.contact_id = c.id AND e.completed_at IS NOT NULL
          AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= today.d - 15
          AND fn_engagement_counted(e.id)))
      OR (t.system_key = 'frequent' AND (
        SELECT COUNT(*) FROM engagements e
        WHERE e.contact_id = c.id AND e.completed_at IS NOT NULL
          AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= today.d - 60
          AND fn_engagement_counted(e.id)) >= 3)
    );
$$;

ALTER TABLE deliverables DROP COLUMN IF EXISTS completed_at;
SELECT recompute_contact_system_tags(NULL);
