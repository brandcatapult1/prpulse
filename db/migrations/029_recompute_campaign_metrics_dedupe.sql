-- Speed up synchronous campaign recompute without changing outputs:
-- 1) Add index supporting campaign + cycle-window scans.
-- 2) Deduplicate counted-engagement scans in recompute_campaign_metrics.

CREATE INDEX IF NOT EXISTS idx_engagements_campaign_completed_at
  ON engagements (campaign_id, completed_at);

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
    WITH counted_engagements AS (
      SELECT
        e.id,
        (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date AS completed_ist
      FROM engagements e
      WHERE e.campaign_id = p_campaign_id
        AND e.conversation_status = 'collaboration_complete'
        AND fn_engagement_deliverables_complete(e.id)
    ),
    bounds AS (
      SELECT
        min(cycle_start) AS first_start,
        max(cycle_end) AS last_end,
        min(cycle_number) AS first_num,
        max(cycle_number) AS last_num
      FROM campaign_cycles
      WHERE campaign_id = p_campaign_id
    ),
    cycle_counts AS (
      SELECT
        cc.id AS cycle_id,
        count(ce.id)::integer AS completed
      FROM campaign_cycles cc
      CROSS JOIN bounds b
      LEFT JOIN counted_engagements ce
        ON ce.completed_ist IS NOT NULL
       AND (
         (
           ce.completed_ist >= cc.cycle_start
           AND ce.completed_ist < cc.cycle_end
         )
         OR (
           cc.cycle_number = b.first_num
           AND ce.completed_ist < b.first_start
         )
         OR (
           cc.cycle_number = b.last_num
           AND ce.completed_ist >= b.last_end
         )
       )
      WHERE cc.campaign_id = p_campaign_id
      GROUP BY cc.id
    ),
    cycle_values AS (
      SELECT
        cc.id,
        coalesce(cnt.completed, 0)::integer AS completed,
        CASE
          WHEN cc.target IS NULL OR cc.target = 0 THEN NULL
          ELSE greatest(0, cc.target - coalesce(cnt.completed, 0)::integer)
        END AS remaining,
        CASE
          WHEN cc.target IS NULL OR cc.target = 0 THEN NULL
          ELSE round(100.0 * coalesce(cnt.completed, 0)::integer / cc.target, 2)
        END AS pct,
        CASE
          WHEN cc.target IS NULL OR cc.target = 0 THEN 'not_set'::campaign_health
          ELSE fn_campaign_health_for_target(cc.target, coalesce(cnt.completed, 0)::integer)
        END AS health
      FROM campaign_cycles cc
      LEFT JOIN cycle_counts cnt ON cnt.cycle_id = cc.id
      WHERE cc.campaign_id = p_campaign_id
    )
    UPDATE campaign_cycles cc
       SET completed_collaborations = cv.completed,
           remaining_collaborations = cv.remaining,
           achievement_pct = cv.pct,
           cycle_health = cv.health
      FROM cycle_values cv
     WHERE cc.id = cv.id;

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
    AND e.conversation_status = 'collaboration_complete'
    AND fn_engagement_deliverables_complete(e.id);

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
