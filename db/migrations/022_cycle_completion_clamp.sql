-- Clamp out-of-range completion IST dates to first/last cycle when bucketing.

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
    SELECT id, cycle_number, cycle_start, cycle_end, target
    FROM campaign_cycles
    WHERE campaign_id = p_campaign_id
    ORDER BY cycle_number
  LOOP
    SELECT count(*)::integer INTO v_completed
    FROM engagements e
    CROSS JOIN (
      SELECT min(cycle_start) AS first_start,
             max(cycle_end) AS last_end,
             min(cycle_number) AS first_num,
             max(cycle_number) AS last_num
      FROM campaign_cycles
      WHERE campaign_id = p_campaign_id
    ) bounds
    WHERE e.campaign_id = p_campaign_id
      AND fn_engagement_counted(e.id)
      AND e.completed_at IS NOT NULL
      AND (
        (
          (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= rec.cycle_start
          AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date < rec.cycle_end
        )
        OR (
          rec.cycle_number = bounds.first_num
          AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date < bounds.first_start
        )
        OR (
          rec.cycle_number = bounds.last_num
          AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= bounds.last_end
        )
      );

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

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  FOR v_campaign_id IN SELECT id FROM campaigns LOOP
    PERFORM recompute_campaign_metrics(v_campaign_id);
  END LOOP;
END;
$$;
