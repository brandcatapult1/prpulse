-- Align fn_deliverable_has_proof with JS deliverablePostedProofSatisfied (migration 026 + prompt 11 fix).
-- Mirror: server/src/lib/deliverableProofRules.mjs deliverablePostedProofSatisfied (keep in sync).
-- qty=1: merged top-level content_link/assets OR unit_proofs; qty>1: per-unit when fully logged.

CREATE OR REPLACE FUNCTION fn_deliverable_merged_has_proof(
  p_type deliverable_type,
  p_content_link text,
  p_unit_proofs jsonb,
  p_deliverable_id uuid,
  p_screenshots jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_has_link boolean;
  v_has_shot boolean;
BEGIN
  v_has_link := NULLIF(trim(coalesce(p_content_link, '')), '') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_unit_proofs, '[]'::jsonb)) u
      WHERE NULLIF(trim(coalesce(u->>'content_link', '')), '') IS NOT NULL
    );

  v_has_shot := (
      p_screenshots IS NOT NULL
      AND jsonb_array_length(coalesce(p_screenshots, '[]'::jsonb)) > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(p_screenshots, '[]'::jsonb)) s
        WHERE NULLIF(trim(coalesce(s->>'url', s->>'file_path', '')), '') IS NOT NULL
      )
    )
    OR EXISTS (
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
  i integer;
BEGIN
  v_unit_count := jsonb_array_length(coalesce(p_unit_proofs, '[]'::jsonb));

  -- qty=1: merged read (top-level column/assets OR unit_proofs)
  IF v_qty = 1 THEN
    RETURN fn_deliverable_merged_has_proof(
      p_type, p_content_link, p_unit_proofs, p_deliverable_id, NULL
    );
  END IF;

  -- qty>1: per-unit when fully logged
  IF v_unit_count >= v_qty THEN
    FOR i IN 0..(v_qty - 1) LOOP
      IF NOT fn_deliverable_unit_has_proof(p_type, p_unit_proofs->i) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  RETURN fn_deliverable_merged_has_proof(
    p_type, p_content_link, p_unit_proofs, p_deliverable_id, NULL
  );
END;
$$;
