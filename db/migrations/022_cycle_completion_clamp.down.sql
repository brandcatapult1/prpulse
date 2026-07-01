-- Restore strict in-window-only cycle bucketing.

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
