-- Extend completion guard: every posted deliverable must meet type-aware proof rules.
-- Going forward only — does not mutate existing rows.

CREATE OR REPLACE FUNCTION fn_deliverable_unit_has_proof(
  p_type deliverable_type,
  p_unit jsonb
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_link text;
  v_has_link boolean;
  v_has_shot boolean;
BEGIN
  v_link := NULLIF(trim(coalesce(p_unit->>'content_link', '')), '');
  v_has_link := v_link IS NOT NULL;
  v_has_shot := EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_unit->'screenshots', '[]'::jsonb)) s
    WHERE NULLIF(trim(coalesce(s->>'url', s->>'file_path', '')), '') IS NOT NULL
  );

  IF p_type IN ('reel', 'static_carousel_post') THEN
    RETURN v_has_link;
  ELSIF p_type = 'story' THEN
    RETURN v_has_shot;
  END IF;
  RETURN v_has_link OR v_has_shot;
END;
$$;

CREATE OR REPLACE FUNCTION fn_deliverable_has_proof(
  p_type deliverable_type,
  p_content_link text,
  p_unit_proofs jsonb,
  p_deliverable_id uuid,
  p_quantity integer
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_qty integer := greatest(coalesce(p_quantity, 1), 1);
  v_unit_count integer;
  v_has_link boolean;
  v_has_shot boolean;
  i integer;
BEGIN
  v_unit_count := jsonb_array_length(coalesce(p_unit_proofs, '[]'::jsonb));

  IF v_unit_count >= v_qty THEN
    FOR i IN 0..(v_qty - 1) LOOP
      IF NOT fn_deliverable_unit_has_proof(p_type, p_unit_proofs->i) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  v_has_link := NULLIF(trim(coalesce(p_content_link, '')), '') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_unit_proofs, '[]'::jsonb)) u
      WHERE NULLIF(trim(coalesce(u->>'content_link', '')), '') IS NOT NULL
    );

  v_has_shot := EXISTS (
      SELECT 1
      FROM assets a
      WHERE a.deliverable_id = p_deliverable_id
        AND a.asset_type = 'screenshot'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_unit_proofs, '[]'::jsonb)) u,
           jsonb_array_elements(coalesce(u->'screenshots', '[]'::jsonb)) s
      WHERE NULLIF(trim(coalesce(s->>'url', s->>'file_path', '')), '') IS NOT NULL
    );

  IF p_type IN ('reel', 'static_carousel_post') THEN
    RETURN v_has_link;
  ELSIF p_type = 'story' THEN
    RETURN v_has_shot;
  END IF;
  RETURN v_has_link OR v_has_shot;
END;
$$;

CREATE OR REPLACE FUNCTION fn_engagement_deliverables_complete(p_engagement_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM deliverables d WHERE d.engagement_id = p_engagement_id)
     AND NOT EXISTS (
       SELECT 1 FROM deliverables d
       WHERE d.engagement_id = p_engagement_id
         AND (
           d.status <> 'posted'
           OR NOT fn_deliverable_has_proof(
             d.deliverable_type,
             d.content_link,
             d.unit_proofs,
             d.id,
             d.quantity
           )
         )
     );
$$;

CREATE OR REPLACE FUNCTION fn_engagement_before() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_status = 'collaboration_complete'
     AND NOT fn_engagement_deliverables_complete(NEW.id) THEN
    RAISE EXCEPTION
      'Cannot complete engagement %: requires at least one deliverable, ALL deliverables Posted, and type proof on file',
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
