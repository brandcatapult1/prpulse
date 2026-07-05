-- Restore pre-026 completion guard (status-only, no per-type proof).

DROP FUNCTION IF EXISTS fn_deliverable_unit_has_proof(deliverable_type, jsonb);
DROP FUNCTION IF EXISTS fn_deliverable_has_proof(deliverable_type, text, jsonb, uuid, integer);

CREATE OR REPLACE FUNCTION fn_engagement_deliverables_complete(p_engagement_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM deliverables d WHERE d.engagement_id = p_engagement_id)
     AND NOT EXISTS (SELECT 1 FROM deliverables d
                     WHERE d.engagement_id = p_engagement_id AND d.status <> 'posted');
$$;

CREATE OR REPLACE FUNCTION fn_engagement_before() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_status = 'collaboration_complete'
     AND NOT fn_engagement_deliverables_complete(NEW.id) THEN
    RAISE EXCEPTION
      'Cannot complete engagement %: requires at least one deliverable and ALL deliverables Posted',
      NEW.id USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.conversation_status = 'collaboration_complete'
       AND NEW.conversation_status = 'collaboration_complete'
       AND (NEW.agreed_fee IS DISTINCT FROM OLD.agreed_fee
            OR NEW.collaboration_type IS DISTINCT FROM OLD.collaboration_type) THEN
      RAISE EXCEPTION 'Agreed fee / collaboration type are frozen while the engagement is Completed; reopen it to amend'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.conversation_status IS DISTINCT FROM OLD.conversation_status THEN
      NEW.last_status_change_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$;
