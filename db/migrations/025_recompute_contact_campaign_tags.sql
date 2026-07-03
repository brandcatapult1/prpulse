-- System-derived campaign-type tags on contacts.
-- Invariant: a contact's campaign-type contact_tags =
--   union of campaign-type tags on every campaign where the contact has a
--   currently counted-complete engagement (fn_engagement_counted — live status
--   + deliverables, NOT completed_at).
-- Re-derived on every metrics refresh and on campaign tag-set changes.

CREATE OR REPLACE FUNCTION recompute_contact_campaign_tags(p_contact_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN;
  END IF;

  -- Insert desired campaign-type tags not already present.
  -- Includes archived campaign tags still applied to a campaign (no is_active filter).
  INSERT INTO contact_tags (contact_id, tag_id)
  SELECT DISTINCT p_contact_id, t.id
  FROM engagements e
  JOIN campaign_tags ct ON ct.campaign_id = e.campaign_id
  JOIN tags t ON t.id = ct.tag_id AND t.type = 'campaign'
  WHERE e.contact_id = p_contact_id
    AND fn_engagement_counted(e.id)
  ON CONFLICT DO NOTHING;

  -- Remove campaign-type rows no longer earned (never touch influencer-type rows).
  DELETE FROM contact_tags ct
  USING tags t
  WHERE ct.contact_id = p_contact_id
    AND ct.tag_id = t.id
    AND t.type = 'campaign'
    AND NOT EXISTS (
      SELECT 1
      FROM engagements e
      JOIN campaign_tags cgt ON cgt.campaign_id = e.campaign_id
      WHERE e.contact_id = p_contact_id
        AND cgt.tag_id = ct.tag_id
        AND fn_engagement_counted(e.id)
    );
END $$;

-- Recompute every contact with a counted-complete engagement on this campaign.
CREATE OR REPLACE FUNCTION recompute_contacts_for_campaign_tags(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT e.contact_id
    FROM engagements e
    WHERE e.campaign_id = p_campaign_id
      AND fn_engagement_counted(e.id)
  LOOP
    PERFORM recompute_contact_campaign_tags(r.contact_id);
  END LOOP;
END $$;

-- Stamp completed_at once (retained on reopen), refresh rollups, re-derive campaign tags.
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

-- Legacy entry point: full recompute (no audit/activity — system-managed).
CREATE OR REPLACE FUNCTION propagate_campaign_tags_to_contact(p_engagement_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_contact uuid;
BEGIN
  SELECT contact_id INTO v_contact FROM engagements WHERE id = p_engagement_id;
  PERFORM recompute_contact_campaign_tags(v_contact);
END $$;

-- One-time reconcile so the invariant holds from deploy (idempotent; no-op when
-- no campaign tags / counted engagements exist yet).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM contacts LOOP
    PERFORM recompute_contact_campaign_tags(r.id);
  END LOOP;
END $$;
