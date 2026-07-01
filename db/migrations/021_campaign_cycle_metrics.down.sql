-- Restore pre-cycle-metrics recompute (campaign-level lifetime count only).

CREATE OR REPLACE FUNCTION recompute_campaign_metrics(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_target    integer;
  v_completed integer;
  v_remaining integer;
  v_pct       numeric(5,2);
  v_health    campaign_health;
BEGIN
  SELECT target_collaborations INTO v_target FROM campaigns WHERE id = p_campaign_id;

  SELECT count(*) INTO v_completed
  FROM engagements e
  WHERE e.campaign_id = p_campaign_id
    AND e.conversation_status = 'collaboration_complete'
    AND EXISTS (SELECT 1 FROM deliverables d WHERE d.engagement_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM deliverables d
                    WHERE d.engagement_id = e.id AND d.status <> 'posted');

  IF v_target IS NULL OR v_target = 0 THEN
    v_pct := NULL; v_remaining := NULL; v_health := 'not_set';
  ELSE
    v_pct       := round(100.0 * v_completed / v_target, 2);
    v_remaining := greatest(0, v_target - v_completed);
    v_health    := CASE WHEN v_pct >= 90 THEN 'green'
                        WHEN v_pct >= 70 THEN 'amber'
                        ELSE 'red' END;
  END IF;

  UPDATE campaigns
     SET completed_collaborations = v_completed,
         remaining_collaborations = v_remaining,
         achievement_pct          = v_pct,
         campaign_health          = v_health
   WHERE id = p_campaign_id;
END;
$$;

DROP FUNCTION IF EXISTS recompute_campaign_cycle_metrics(uuid);
DROP FUNCTION IF EXISTS fn_current_campaign_cycle_id(uuid);
DROP FUNCTION IF EXISTS fn_campaign_health_for_target(integer, integer);

ALTER TABLE campaign_cycles
  DROP COLUMN IF EXISTS completed_collaborations,
  DROP COLUMN IF EXISTS remaining_collaborations,
  DROP COLUMN IF EXISTS achievement_pct,
  DROP COLUMN IF EXISTS cycle_health;
