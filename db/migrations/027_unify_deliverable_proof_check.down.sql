-- Restore migration 026 fn_deliverable_has_proof (per-unit preferred when unit_proofs >= qty).

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

DROP FUNCTION IF EXISTS fn_deliverable_merged_has_proof(deliverable_type, text, jsonb, uuid, jsonb);
