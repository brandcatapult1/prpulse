-- Creator social stats, per-deliverable engagement metrics, and
-- system-managed contact labels (New / Recent / Frequent).
--
-- System tags (tags.type = 'system') are derived only — never edited by users.
-- Rules (all dates IST):
--   New      contact created within the last 45 days
--   Recent   a counted-complete engagement finished within the last 15 days
--   Frequent 3+ counted-complete engagements finished within the last 60 days
-- Rows in contact_tags are added AND removed by recompute_contact_system_tags(),
-- which runs on engagement completion, on contact insert, and on a schedule
-- (labels expire with time, not only with events).

-- ── tags: allow 'system' type + stable key ───────────────────────────────────
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_check;
ALTER TABLE tags
  ADD CONSTRAINT tags_type_check CHECK (type IN ('influencer', 'campaign', 'system'));

ALTER TABLE tags ADD COLUMN IF NOT EXISTS system_key text;
CREATE UNIQUE INDEX IF NOT EXISTS tags_system_key_uidx ON tags (system_key) WHERE system_key IS NOT NULL;

INSERT INTO tags (name, type, is_active, system_key)
VALUES
  ('New', 'system', true, 'new'),
  ('Recent', 'system', true, 'recent'),
  ('Frequent', 'system', true, 'frequent')
ON CONFLICT ((lower(name))) DO UPDATE
  SET type = 'system', system_key = EXCLUDED.system_key, is_active = true;

-- ── creator social stats (followers / following / posts per platform) ────────
CREATE TABLE IF NOT EXISTS creator_social_stats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('instagram', 'youtube')),
  handle        text,
  followers     bigint,
  following     bigint,
  posts_count   bigint,
  total_views   bigint,
  source        text NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'manual')),
  synced_at     timestamptz,
  sync_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, platform)
);

-- ── per-deliverable-link engagement metrics ──────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverable_metrics (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  content_url    text NOT NULL,
  platform       text CHECK (platform IN ('instagram', 'youtube')),
  likes          bigint,
  comments       bigint,
  views          bigint,
  reach          bigint,
  shares         bigint,
  reposts        bigint,
  saves          bigint,
  source         text NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'manual')),
  synced_at      timestamptz,
  sync_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, content_url)
);
CREATE INDEX IF NOT EXISTS idx_deliverable_metrics_deliverable ON deliverable_metrics (deliverable_id);

-- Per creator × campaign rollup over deliverables marked completed (posted).
CREATE OR REPLACE VIEW v_creator_campaign_metrics AS
SELECT e.contact_id,
       e.campaign_id,
       COUNT(DISTINCT d.id)                  AS completed_deliverables,
       COALESCE(SUM(m.likes), 0)::bigint     AS likes,
       COALESCE(SUM(m.comments), 0)::bigint  AS comments,
       COALESCE(SUM(m.views), 0)::bigint     AS views,
       COALESCE(SUM(m.reach), 0)::bigint     AS reach,
       COALESCE(SUM(m.shares), 0)::bigint    AS shares,
       COALESCE(SUM(m.reposts), 0)::bigint   AS reposts,
       COALESCE(SUM(m.saves), 0)::bigint     AS saves
FROM engagements e
JOIN deliverables d ON d.engagement_id = e.id AND d.status = 'posted'
LEFT JOIN deliverable_metrics m ON m.deliverable_id = d.id
GROUP BY e.contact_id, e.campaign_id;

-- ── system tag derivation ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_contact_system_tags_desired(p_contact_id uuid DEFAULT NULL)
RETURNS TABLE (contact_id uuid, tag_id uuid) LANGUAGE sql STABLE AS $$
  SELECT c.id, t.id
  FROM contacts c
  CROSS JOIN tags t
  CROSS JOIN (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d) today
  WHERE t.type = 'system'
    AND (p_contact_id IS NULL OR c.id = p_contact_id)
    AND (
      (t.system_key = 'new'
        AND (c.created_at AT TIME ZONE 'Asia/Kolkata')::date >= today.d - 45)
      OR (t.system_key = 'recent' AND EXISTS (
        SELECT 1 FROM engagements e
        WHERE e.contact_id = c.id AND e.completed_at IS NOT NULL
          AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= today.d - 15
          AND fn_engagement_counted(e.id)))
      OR (t.system_key = 'frequent' AND (
        SELECT COUNT(*) FROM engagements e
        WHERE e.contact_id = c.id AND e.completed_at IS NOT NULL
          AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= today.d - 60
          AND fn_engagement_counted(e.id)) >= 3)
    );
$$;

CREATE OR REPLACE FUNCTION recompute_contact_system_tags(p_contact_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO contact_tags (contact_id, tag_id)
  SELECT contact_id, tag_id FROM fn_contact_system_tags_desired(p_contact_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM contact_tags ct
  USING tags t
  WHERE ct.tag_id = t.id
    AND t.type = 'system'
    AND (p_contact_id IS NULL OR ct.contact_id = p_contact_id)
    AND NOT EXISTS (
      SELECT 1 FROM fn_contact_system_tags_desired(p_contact_id) d
      WHERE d.contact_id = ct.contact_id AND d.tag_id = ct.tag_id
    );
END $$;

-- Re-derive on engagement completion refresh (keeps existing behaviour intact).
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
  PERFORM recompute_contact_system_tags(v_contact);
END $$;

-- New contacts get the "New" label immediately.
CREATE OR REPLACE FUNCTION fn_contact_system_tags_after_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM recompute_contact_system_tags(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contact_system_tags ON contacts;
CREATE TRIGGER trg_contact_system_tags
  AFTER INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION fn_contact_system_tags_after_insert();

-- Backfill.
SELECT recompute_contact_system_tags(NULL);
