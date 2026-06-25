DROP FUNCTION IF EXISTS propagate_campaign_tags_to_contact(uuid);

CREATE OR REPLACE FUNCTION fn_refresh_engagement_completion(p_engagement_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_campaign uuid; v_contact uuid;
BEGIN
  SELECT campaign_id, contact_id INTO v_campaign, v_contact
  FROM engagements WHERE id = p_engagement_id;

  IF fn_engagement_counted(p_engagement_id) THEN
    UPDATE engagements SET completed_at = now()
     WHERE id = p_engagement_id AND completed_at IS NULL;
  END IF;

  PERFORM recompute_campaign_metrics(v_campaign);
  PERFORM recompute_contact_summary(v_contact);
END $$;

DROP TABLE IF EXISTS campaign_tags CASCADE;

-- activity_action enum values cannot be removed safely; leave contact_tags_added in place.
