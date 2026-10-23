DROP TRIGGER IF EXISTS trg_contact_system_tags ON contacts;
DROP FUNCTION IF EXISTS fn_contact_system_tags_after_insert();

DELETE FROM contact_tags USING tags t WHERE contact_tags.tag_id = t.id AND t.type = 'system';

CREATE OR REPLACE FUNCTION fn_refresh_engagement_completion(p_engagement_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_campaign uuid;
  v_contact uuid;
BEGIN
  SELECT campaign_id, contact_id INTO v_campaign, v_contact
  FROM engagements WHERE id = p_engagement_id;

  IF v_campaign IS NULL OR v_contact IS NULL THEN
    RETURN;
  END IF;

  IF fn_engagement_counted(p_engagement_id) THEN
    UPDATE engagements SET completed_at = now()
     WHERE id = p_engagement_id AND completed_at IS NULL;
  END IF;

  PERFORM recompute_campaign_metrics(v_campaign);
  PERFORM recompute_contact_summary(v_contact);
  PERFORM recompute_contact_campaign_tags(v_contact);
END $$;

DROP FUNCTION IF EXISTS recompute_contact_system_tags(uuid);
DROP FUNCTION IF EXISTS fn_contact_system_tags_desired(uuid);
DROP VIEW IF EXISTS v_creator_campaign_metrics;
DROP TABLE IF EXISTS deliverable_metrics;
DROP TABLE IF EXISTS creator_social_stats;

DELETE FROM tags WHERE type = 'system';
DROP INDEX IF EXISTS tags_system_key_uidx;
ALTER TABLE tags DROP COLUMN IF EXISTS system_key;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_check;
ALTER TABLE tags
  ADD CONSTRAINT tags_type_check CHECK (type IN ('influencer', 'campaign'));
