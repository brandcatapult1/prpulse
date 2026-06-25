-- Campaign tags + propagate to contact on first counted collaboration.

CREATE TABLE campaign_tags (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, tag_id)
);

CREATE INDEX idx_campaign_tags_tag ON campaign_tags (tag_id);

ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'contact_tags_added';

-- Add campaign tags missing on the contact (idempotent). Logs audit + activity when rows insert.
CREATE OR REPLACE FUNCTION propagate_campaign_tags_to_contact(p_engagement_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_campaign      uuid;
  v_contact       uuid;
  v_user          uuid;
  v_campaign_name text;
  v_actor_name    text;
  v_actor_role    text;
  v_tag           record;
  v_inserted      uuid;
BEGIN
  SELECT e.campaign_id, e.contact_id INTO v_campaign, v_contact
  FROM engagements e WHERE e.id = p_engagement_id;

  IF v_campaign IS NULL OR v_contact IS NULL THEN
    RETURN;
  END IF;

  v_user := nullif(current_setting('app.current_user_id', true), '')::uuid;
  SELECT campaign_name INTO v_campaign_name FROM campaigns WHERE id = v_campaign;

  IF v_user IS NOT NULL THEN
    SELECT full_name, role::text INTO v_actor_name, v_actor_role FROM users WHERE id = v_user;
  END IF;

  FOR v_tag IN
    SELECT t.id, t.name
    FROM campaign_tags ct
    JOIN tags t ON t.id = ct.tag_id
    WHERE ct.campaign_id = v_campaign
  LOOP
    INSERT INTO contact_tags (contact_id, tag_id)
    VALUES (v_contact, v_tag.id)
    ON CONFLICT DO NOTHING
    RETURNING tag_id INTO v_inserted;

    IF v_inserted IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO audit_logs(user_id, entity_type, entity_id, action_type, previous_value, new_value)
    VALUES (
      v_user,
      'contact',
      v_contact,
      'tag_added',
      NULL,
      jsonb_build_object(
        'tag_id', v_tag.id,
        'tag_name', v_tag.name,
        'campaign_id', v_campaign,
        'campaign_name', v_campaign_name,
        'engagement_id', p_engagement_id,
        'source', 'campaign_completion'
      )
    );

    IF v_user IS NOT NULL AND v_actor_name IS NOT NULL THEN
      INSERT INTO activity_events(
        campaign_id, engagement_id, actor_user_id, actor_name, actor_role, action, details
      ) VALUES (
        v_campaign,
        p_engagement_id,
        v_user,
        v_actor_name,
        coalesce(v_actor_role, 'campaign_manager'),
        'contact_tags_added',
        jsonb_build_object(
          'contact_id', v_contact,
          'tag_id', v_tag.id,
          'tag_name', v_tag.name,
          'campaign_name', v_campaign_name
        )
      );
    END IF;
  END LOOP;
END $$;

-- Stamp completed_at once, refresh rollups, propagate campaign tags on first count.
CREATE OR REPLACE FUNCTION fn_refresh_engagement_completion(p_engagement_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_campaign uuid; v_contact uuid; v_stamped uuid;
BEGIN
  SELECT campaign_id, contact_id INTO v_campaign, v_contact
  FROM engagements WHERE id = p_engagement_id;

  IF fn_engagement_counted(p_engagement_id) THEN
    UPDATE engagements SET completed_at = now()
     WHERE id = p_engagement_id AND completed_at IS NULL
     RETURNING id INTO v_stamped;

    IF v_stamped IS NOT NULL THEN
      PERFORM propagate_campaign_tags_to_contact(p_engagement_id);
    END IF;
  END IF;

  PERFORM recompute_campaign_metrics(v_campaign);
  PERFORM recompute_contact_summary(v_contact);
END $$;
