DROP INDEX IF EXISTS idx_engagements_campaign_completed_at;

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

  SELECT count(*)::integer INTO v_completed
  FROM engagements e
  WHERE e.campaign_id = p_campaign_id
    AND fn_engagement_counted(e.id);

  IF v_target IS NULL OR v_target = 0 THEN
    v_pct := NULL; v_remaining := NULL; v_health := 'not_set';
  ELSE
    v_pct := round(100.0 * v_completed / v_target, 2);
    v_remaining := greatest(0, v_target - v_completed);
    v_health := fn_campaign_health_for_target(v_target, v_completed);
  END IF;

  UPDATE campaigns
     SET completed_collaborations = v_completed,
         remaining_collaborations = v_remaining,
         achievement_pct          = v_pct,
         campaign_health          = v_health
   WHERE id = p_campaign_id;
END $$;
