-- Per-cycle completion counts and health; recurring campaigns roll up current cycle to campaigns.

ALTER TABLE campaign_cycles
  ADD COLUMN IF NOT EXISTS completed_collaborations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_collaborations integer,
  ADD COLUMN IF NOT EXISTS achievement_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS cycle_health campaign_health NOT NULL DEFAULT 'not_set';

-- Shared health thresholds (same rules as campaign-level recompute).
CREATE OR REPLACE FUNCTION fn_campaign_health_for_target(p_target integer, p_completed integer)
RETURNS campaign_health LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_pct numeric(5,2);
BEGIN
  IF p_target IS NULL OR p_target = 0 THEN
    RETURN 'not_set';
  END IF;
  v_pct := round(100.0 * p_completed / p_target, 2);
  RETURN CASE
    WHEN v_pct >= 90 THEN 'green'::campaign_health
    WHEN v_pct >= 70 THEN 'amber'::campaign_health
    ELSE 'red'::campaign_health
  END;
END;
$$;

-- Current cycle for a campaign (IST date windows; clamp before first / after last).
CREATE OR REPLACE FUNCTION fn_current_campaign_cycle_id(p_campaign_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_id uuid;
  v_first_start date;
BEGIN
  SELECT cc.id INTO v_id
  FROM campaign_cycles cc
  WHERE cc.campaign_id = p_campaign_id
    AND v_today >= cc.cycle_start
    AND v_today < cc.cycle_end
  ORDER BY cc.cycle_number
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT cc.id, cc.cycle_start INTO v_id, v_first_start
  FROM campaign_cycles cc
  WHERE cc.campaign_id = p_campaign_id
  ORDER BY cc.cycle_number
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_today < v_first_start THEN
    RETURN v_id;
  END IF;

  SELECT cc.id INTO v_id
  FROM campaign_cycles cc
  WHERE cc.campaign_id = p_campaign_id
  ORDER BY cc.cycle_number DESC
  LIMIT 1;

  RETURN v_id;
END;
$$;

-- Recompute stored metrics for every cycle on a campaign.
CREATE OR REPLACE FUNCTION recompute_campaign_cycle_metrics(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rec record;
  v_completed integer;
  v_remaining integer;
  v_pct numeric(5,2);
  v_health campaign_health;
BEGIN
  FOR rec IN
    SELECT id, cycle_start, cycle_end, target
    FROM campaign_cycles
    WHERE campaign_id = p_campaign_id
    ORDER BY cycle_number
  LOOP
    SELECT count(*)::integer INTO v_completed
    FROM engagements e
    WHERE e.campaign_id = p_campaign_id
      AND fn_engagement_counted(e.id)
      AND e.completed_at IS NOT NULL
      AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= rec.cycle_start
      AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date < rec.cycle_end;

    IF rec.target IS NULL OR rec.target = 0 THEN
      v_pct := NULL;
      v_remaining := NULL;
      v_health := 'not_set';
    ELSE
      v_pct := round(100.0 * v_completed / rec.target, 2);
      v_remaining := greatest(0, rec.target - v_completed);
      v_health := fn_campaign_health_for_target(rec.target, v_completed);
    END IF;

    UPDATE campaign_cycles
       SET completed_collaborations = v_completed,
           remaining_collaborations = v_remaining,
           achievement_pct = v_pct,
           cycle_health = v_health
     WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Campaign rollups: current cycle for recurring; sole cycle for projects.
CREATE OR REPLACE FUNCTION recompute_campaign_metrics(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_target integer;
  v_completed integer;
  v_remaining integer;
  v_pct numeric(5,2);
  v_health campaign_health;
  v_cycle_id uuid;
BEGIN
  SELECT target_collaborations INTO v_target FROM campaigns WHERE id = p_campaign_id;

  IF EXISTS (SELECT 1 FROM campaign_cycles WHERE campaign_id = p_campaign_id) THEN
    PERFORM recompute_campaign_cycle_metrics(p_campaign_id);

    v_cycle_id := fn_current_campaign_cycle_id(p_campaign_id);

    IF v_cycle_id IS NOT NULL THEN
      SELECT cc.completed_collaborations, cc.remaining_collaborations,
             cc.achievement_pct, cc.cycle_health
        INTO v_completed, v_remaining, v_pct, v_health
        FROM campaign_cycles cc
       WHERE cc.id = v_cycle_id;

      UPDATE campaigns
         SET completed_collaborations = v_completed,
             remaining_collaborations = v_remaining,
             achievement_pct = v_pct,
             campaign_health = v_health
       WHERE id = p_campaign_id;
      RETURN;
    END IF;
  END IF;

  -- Fallback when cycles are not materialized yet.
  SELECT count(*)::integer INTO v_completed
  FROM engagements e
  WHERE e.campaign_id = p_campaign_id
    AND fn_engagement_counted(e.id);

  IF v_target IS NULL OR v_target = 0 THEN
    v_pct := NULL;
    v_remaining := NULL;
    v_health := 'not_set';
  ELSE
    v_pct := round(100.0 * v_completed / v_target, 2);
    v_remaining := greatest(0, v_target - v_completed);
    v_health := fn_campaign_health_for_target(v_target, v_completed);
  END IF;

  UPDATE campaigns
     SET completed_collaborations = v_completed,
         remaining_collaborations = v_remaining,
         achievement_pct = v_pct,
         campaign_health = v_health
   WHERE id = p_campaign_id;
END;
$$;

-- Backfill cycle + campaign rollups for existing campaigns.
DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  FOR v_campaign_id IN SELECT id FROM campaigns LOOP
    PERFORM recompute_campaign_metrics(v_campaign_id);
  END LOOP;
END;
$$;
