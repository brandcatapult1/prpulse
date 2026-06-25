-- =====================================================================
-- PR Pulse — Technical Database Schema (PostgreSQL)
-- Companion to: PR Pulse Master PRD v1.2
-- Target: PostgreSQL 14+
--
-- Conventions
--   * All ids are uuid (gen_random_uuid()).
--   * Enum values are snake_case; display labels are in comments.
--   * Timestamps are timestamptz (stored UTC). "Today"/overdue logic
--     evaluates in IST via (now() AT TIME ZONE 'Asia/Kolkata')::date.
--   * Mobile dedup is a WARNING at the app layer (see notes), NOT a hard
--     unique constraint, because the user may choose to create anyway.
--   * The app must set the current actor per transaction so audit/timeline
--     can attribute changes:   SET LOCAL app.current_user_id = '<uuid>';
--   * "is_overdue" for deliverables is computed (view v_deliverables),
--     never stored.
-- =====================================================================

-- ---------- 0. Extensions -------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email/name

-- ---------- 1. Enums ------------------------------------------------------
CREATE TYPE user_role AS ENUM ('campaign_manager','senior_manager','admin');

CREATE TYPE contact_type AS ENUM (
  'influencer','journalist','editor','publication','producer','media_contact'
);

CREATE TYPE contact_status AS ENUM ('active','inactive','archived'); -- lifecycle only; blacklist is separate

CREATE TYPE classification AS ENUM (
  'nano','micro','mid','category_a','macro','hni','fnb_specialist'
  -- Nano · Micro · Mid · Category A · Macro · HNI · F&B Specialist
);

CREATE TYPE contact_source AS ENUM (
  'signup_form','campaign_add','bulk_upload','manual_entry','quick_add'
);

CREATE TYPE registration_status AS ENUM (
  'new','pending_review','approved','rejected','duplicate'
);

CREATE TYPE campaign_status AS ENUM ('draft','active','paused','completed','archived');

CREATE TYPE campaign_health AS ENUM ('green','amber','red','not_set');

-- conversation_status: PRD Module 5 lists nine named stages (three funnel drops as distinct
-- enum values). The database has a tenth value, 'dropped', added in migration 007 for
-- operational drops whose reason is not encoded in the status slug — notably Didn't Deliver
-- (Senior Manager / Admin only, from awaiting_final_deliverables).
--
--   PRD funnel drops (reason = status slug):
--     dropped_profile_rejected | dropped_not_interested | dropped_terms_disagreement
--   Generic dropped stage (reason in engagements.drop_reason):
--     conversation_status = 'dropped'
--     drop_reason         = 'didnt_deliver'   -- display: "Didn't Deliver"
--     dropped_from        = prior stage slug  -- reopen routing
--
-- Never use a phantom status such as dropped_didnt_deliver; it is not in this enum.
-- Dashboard / follow-up queries must exclude conversation_status = 'dropped' alongside
-- the three named drop values and collaboration_complete.
CREATE TYPE conversation_status AS ENUM (
  'not_contacted',
  'in_conversation',
  'scheduled',
  'no_response',
  'dropped_profile_rejected',     -- Dropped – Profile Rejected (PRD)
  'dropped_not_interested',       -- Dropped – Not Interested (PRD)
  'dropped_terms_disagreement',   -- Dropped – Terms Disagreement (PRD)
  'dropped',                      -- generic dropped; see drop_reason (migration 007)
  'awaiting_final_deliverables',
  'collaboration_complete'
);

CREATE TYPE interest_level AS ENUM ('high','medium','low','unknown');

CREATE TYPE collaboration_reason AS ENUM ('virality','expert','positioning');

CREATE TYPE deliverable_type AS ENUM ('reel','story','static_carousel_post','other');

CREATE TYPE deliverable_status AS ENUM ('pending','received','approved','posted'); -- NO 'overdue' (computed)

CREATE TYPE asset_type AS ENUM ('screenshot','content_link','pdf','drive_link','other');

CREATE TYPE audit_entity_type AS ENUM (
  'contact','campaign','engagement','deliverable','feedback','blacklist'
);

-- ---------- 2. Shared helpers (updated_at) --------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------- 3. Users & lookups -------------------------------------------
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  text UNIQUE,                  -- Google OAuth subject id
  email       citext UNIQUE NOT NULL,
  full_name   text NOT NULL,
  role        user_role NOT NULL DEFAULT 'campaign_manager',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       citext UNIQUE NOT NULL,         -- admin-configurable
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       citext UNIQUE NOT NULL,         -- admin-configurable
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 4. Contacts (universal relationship record) -------------------
CREATE TABLE contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  contact_type        contact_type NOT NULL DEFAULT 'influencer',
  mobile_number       text NOT NULL,          -- normalized E.164 by the app; dedup key
  email               citext,
  city                text,
  state               text,
  country             text,
  instagram_url       text,
  youtube_url         text,
  other_platform_links jsonb NOT NULL DEFAULT '[]',  -- [{label,url}]
  primary_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  open_to_paid        boolean NOT NULL DEFAULT false,
  open_to_barter      boolean NOT NULL DEFAULT false,
  -- Current INDICATIVE rates only. Historical reports never read these.
  reel_rate           numeric(12,2),
  story_rate          numeric(12,2),
  post_rate           numeric(12,2),
  other_rate          numeric(12,2),
  classification      classification,
  status              contact_status NOT NULL DEFAULT 'active',  -- lifecycle
  is_blacklisted      boolean NOT NULL DEFAULT false,            -- orthogonal flag (synced by trigger)
  source              contact_source NOT NULL,
  -- Stored, derived summary metrics (refreshed by recompute_contact_summary)
  total_collaborations    integer NOT NULL DEFAULT 0,
  last_collaboration_date date,
  avg_content_quality     numeric(3,2),
  avg_professionalism     numeric(3,2),
  avg_timeliness          numeric(3,2),
  would_work_again_pct    numeric(5,2),
  notes                   text,                    -- internal profile notes
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_tags (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE contact_secondary_categories (
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, category_id)
);

-- Reversible blacklist; at most one active record per contact.
CREATE TABLE blacklist_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  is_active      boolean NOT NULL DEFAULT true,
  reason         text NOT NULL,
  blacklisted_by uuid NOT NULL REFERENCES users(id),
  blacklisted_at timestamptz NOT NULL DEFAULT now(),
  lifted_by      uuid REFERENCES users(id),
  lifted_at      timestamptz
);
CREATE UNIQUE INDEX uq_blacklist_active_per_contact
  ON blacklist_records (contact_id) WHERE is_active;

-- ---------- 5. Brands & Campaigns ----------------------------------------
CREATE TABLE brands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name      text NOT NULL,
  brand_category  text,
  logo_path       text,
  primary_contact text,
  contact_email   citext,
  account_manager uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outlets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  outlet_name  text NOT NULL,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_outlets_one_default_per_brand
  ON outlets (brand_id) WHERE is_default;

CREATE TABLE campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name       text NOT NULL,
  brand_id            uuid NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  campaign_type       text,
  objective           text,
  start_date          date,
  end_date            date,
  campaign_brief      text,
  status              campaign_status NOT NULL DEFAULT 'draft',
  target_collaborations integer CHECK (target_collaborations IS NULL OR target_collaborations >= 0),
  -- Stored, derived metrics (refreshed by recompute_campaign_metrics)
  completed_collaborations integer NOT NULL DEFAULT 0,
  remaining_collaborations integer,
  achievement_pct          numeric(5,2),
  campaign_health          campaign_health NOT NULL DEFAULT 'not_set',
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- Campaign assigned managers (plural — visibility). Owner of an engagement
-- is on the engagement itself.
CREATE TABLE campaign_managers (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE campaign_tags (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, tag_id)
);

-- ---------- 6. Engagements (central operational object) ------------------
CREATE TABLE engagements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  campaign_id          uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  assigned_manager     uuid NOT NULL REFERENCES users(id),     -- single owner
  initial_contact_date date,
  last_contact_date    date,
  next_follow_up_date  date,
  conversation_status  conversation_status NOT NULL DEFAULT 'not_contacted',
  interest_level       interest_level NOT NULL DEFAULT 'unknown',
  notes                text,
  -- Commercial (historical; immutable once completed — see trigger)
  collaboration_type            text,
  agreed_fee                    numeric(12,2),
  primary_collaboration_reason  collaboration_reason,
  secondary_collaboration_reason collaboration_reason,
  -- Visit (required when status = scheduled)
  visit_date           date,
  visit_time           time,
  visit_outlet         text,
  visit_outlet_id      uuid REFERENCES outlets(id) ON DELETE SET NULL,
  visit_notes          text,
  dropped_from         text,                       -- stage slug when dropped; reopen routing
  drop_reason          text,                       -- reason slug when status = dropped (e.g. didnt_deliver)
  no_reply_count       integer NOT NULL DEFAULT 0,
  last_contact_log_type text,                      -- conversation | no_reply_attempt
  visit_completed_date date,                       -- IST calendar date visit marked done
  -- Lifecycle stamps
  completed_at         timestamptz,           -- set once when first counted; retained thereafter
  last_status_change_at timestamptz NOT NULL DEFAULT now(),  -- drives "stalled" widgets
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_engagement_contact_campaign UNIQUE (contact_id, campaign_id),
  -- Visit details required while Scheduled
  CONSTRAINT ck_visit_when_scheduled
    CHECK (conversation_status <> 'scheduled' OR visit_date IS NOT NULL),
  -- Primary reason mandatory once completed
  CONSTRAINT ck_reason_when_complete
    CHECK (conversation_status <> 'collaboration_complete' OR primary_collaboration_reason IS NOT NULL)
);

-- ---------- 7. Deliverables & Assets -------------------------------------
CREATE TABLE deliverables (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id      uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  deliverable_type   deliverable_type NOT NULL,
  quantity           integer NOT NULL DEFAULT 1 CHECK (quantity > 0), -- assets count; never changes collaboration count
  due_date           date,
  status             deliverable_status NOT NULL DEFAULT 'pending',   -- overdue is computed (v_deliverables)
  published_date     date,
  content_link       text,
  posted_quantity    integer NOT NULL DEFAULT 0,
  unit_proofs        jsonb NOT NULL DEFAULT '[]',
  brief_compliance   boolean,
  brand_tag_verified boolean,
  internal_rating    integer CHECK (internal_rating IS NULL OR internal_rating BETWEEN 1 AND 5),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Files & links. Attaches to a campaign OR a deliverable (exactly one).
-- Story screenshots live here against the single Story deliverable record.
CREATE TABLE assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type    asset_type NOT NULL,
  label         text,
  file_path     text,        -- for uploaded files (StorageProvider path)
  url           text,        -- for content/drive links
  campaign_id   uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  deliverable_id uuid REFERENCES deliverables(id) ON DELETE CASCADE,
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_asset_single_parent
    CHECK ((campaign_id IS NOT NULL)::int + (deliverable_id IS NOT NULL)::int = 1),
  CONSTRAINT ck_asset_has_payload
    CHECK (file_path IS NOT NULL OR url IS NOT NULL)
);

-- ---------- 8. Feedback (one per engagement, editable) -------------------
CREATE TABLE feedback (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id      uuid NOT NULL UNIQUE REFERENCES engagements(id) ON DELETE CASCADE,
  content_quality    integer NOT NULL CHECK (content_quality BETWEEN 1 AND 5),
  professionalism    integer NOT NULL CHECK (professionalism BETWEEN 1 AND 5),
  timeliness         integer NOT NULL CHECK (timeliness BETWEEN 1 AND 5),
  adherence_to_terms boolean NOT NULL,
  would_work_again   boolean NOT NULL,
  internal_notes     text,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------- 9. Saved lists -----------------------------------------------
CREATE TABLE saved_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  owner      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_list_contacts (
  saved_list_id uuid NOT NULL REFERENCES saved_lists(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (saved_list_id, contact_id)
);

-- ---------- 10. Public registration --------------------------------------
CREATE TABLE registration_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         text NOT NULL,
  mobile_number     text NOT NULL,
  email             citext,
  city              text,
  instagram_link    text,
  youtube_link      text,
  category          text,
  paid_preference   boolean,
  barter_preference boolean,
  reel_rate         numeric(12,2),
  story_rate        numeric(12,2),
  portfolio_links   jsonb NOT NULL DEFAULT '[]',
  notes             text,
  status            registration_status NOT NULL DEFAULT 'new',
  reviewed_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  linked_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL, -- set on approve/duplicate
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------- 11. Timeline (per-engagement, auto-generated) ----------------
CREATE TABLE timeline_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, -- denormalized for profile feed
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,            -- null = system
  action        text NOT NULL,
  status_change text,
  notes         text
);

-- ---------- 12. Audit log (system-wide, admin-only) ----------------------
CREATE TABLE audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  entity_type    audit_entity_type NOT NULL,
  entity_id      uuid NOT NULL,
  action_type    text NOT NULL,         -- create | update | delete | archive | blacklist | status_change | commercial_change
  previous_value jsonb,
  new_value      jsonb
);

-- =====================================================================
-- 13. Core business-logic functions
-- =====================================================================

-- True when an engagement has >=1 deliverable and none are un-posted.
CREATE OR REPLACE FUNCTION fn_engagement_deliverables_complete(p_engagement_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM deliverables d WHERE d.engagement_id = p_engagement_id)
     AND NOT EXISTS (SELECT 1 FROM deliverables d
                     WHERE d.engagement_id = p_engagement_id AND d.status <> 'posted');
$$;

-- True when an engagement counts as a completed collaboration.
CREATE OR REPLACE FUNCTION fn_engagement_counted(p_engagement_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT e.conversation_status = 'collaboration_complete'
         AND fn_engagement_deliverables_complete(e.id)
  FROM engagements e WHERE e.id = p_engagement_id;
$$;

-- Recompute a campaign's completed/remaining/achievement/health.
-- Recounts from scratch, so reopening an engagement self-corrects.
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
END $$;

-- Recompute a contact's stored summary metrics.
CREATE OR REPLACE FUNCTION recompute_contact_summary(p_contact_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE contacts c SET
    total_collaborations = (
      SELECT count(*) FROM engagements e
      WHERE e.contact_id = p_contact_id
        AND e.conversation_status = 'collaboration_complete'
        AND EXISTS (SELECT 1 FROM deliverables d WHERE d.engagement_id = e.id)
        AND NOT EXISTS (SELECT 1 FROM deliverables d
                        WHERE d.engagement_id = e.id AND d.status <> 'posted')
    ),
    last_collaboration_date = (
      SELECT max(e.completed_at)::date FROM engagements e
      WHERE e.contact_id = p_contact_id AND e.completed_at IS NOT NULL
    ),
    avg_content_quality = (
      SELECT round(avg(f.content_quality), 2) FROM feedback f
      JOIN engagements e ON e.id = f.engagement_id WHERE e.contact_id = p_contact_id
    ),
    avg_professionalism = (
      SELECT round(avg(f.professionalism), 2) FROM feedback f
      JOIN engagements e ON e.id = f.engagement_id WHERE e.contact_id = p_contact_id
    ),
    avg_timeliness = (
      SELECT round(avg(f.timeliness), 2) FROM feedback f
      JOIN engagements e ON e.id = f.engagement_id WHERE e.contact_id = p_contact_id
    ),
    would_work_again_pct = (
      SELECT CASE WHEN count(*) = 0 THEN NULL
                  ELSE round(100.0 * count(*) FILTER (WHERE f.would_work_again) / count(*), 2) END
      FROM feedback f JOIN engagements e ON e.id = f.engagement_id
      WHERE e.contact_id = p_contact_id
    )
  WHERE c.id = p_contact_id;
END $$;

-- Set completed_at once, propagate campaign tags on first count, refresh rollups.
CREATE OR REPLACE FUNCTION propagate_campaign_tags_to_contact(p_engagement_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_campaign uuid; v_contact uuid; v_user uuid; v_campaign_name text;
  v_actor_name text; v_actor_role text; v_tag record; v_inserted uuid;
BEGIN
  SELECT e.campaign_id, e.contact_id INTO v_campaign, v_contact
  FROM engagements e WHERE e.id = p_engagement_id;
  IF v_campaign IS NULL OR v_contact IS NULL THEN RETURN; END IF;

  v_user := nullif(current_setting('app.current_user_id', true), '')::uuid;
  SELECT campaign_name INTO v_campaign_name FROM campaigns WHERE id = v_campaign;
  IF v_user IS NOT NULL THEN
    SELECT full_name, role::text INTO v_actor_name, v_actor_role FROM users WHERE id = v_user;
  END IF;

  FOR v_tag IN
    SELECT t.id, t.name FROM campaign_tags ct
    JOIN tags t ON t.id = ct.tag_id WHERE ct.campaign_id = v_campaign
  LOOP
    INSERT INTO contact_tags (contact_id, tag_id) VALUES (v_contact, v_tag.id)
    ON CONFLICT DO NOTHING RETURNING tag_id INTO v_inserted;
    IF v_inserted IS NULL THEN CONTINUE; END IF;

    INSERT INTO audit_logs(user_id, entity_type, entity_id, action_type, previous_value, new_value)
    VALUES (v_user, 'contact', v_contact, 'tag_added', NULL,
      jsonb_build_object('tag_id', v_tag.id, 'tag_name', v_tag.name,
        'campaign_id', v_campaign, 'campaign_name', v_campaign_name,
        'engagement_id', p_engagement_id, 'source', 'campaign_completion'));

    IF v_user IS NOT NULL AND v_actor_name IS NOT NULL THEN
      INSERT INTO activity_events(campaign_id, engagement_id, actor_user_id, actor_name, actor_role, action, details)
      VALUES (v_campaign, p_engagement_id, v_user, v_actor_name,
        coalesce(v_actor_role, 'campaign_manager'), 'contact_tags_added',
        jsonb_build_object('contact_id', v_contact, 'tag_id', v_tag.id,
          'tag_name', v_tag.name, 'campaign_name', v_campaign_name));
    END IF;
  END LOOP;
END $$;

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

-- =====================================================================
-- 14. Trigger functions
-- =====================================================================

-- Engagement BEFORE INSERT/UPDATE: completion guard, immutability, stalled stamp.
CREATE OR REPLACE FUNCTION fn_engagement_before() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Completion guard: cannot be 'collaboration_complete' without >=1 posted-only deliverable set.
  IF NEW.conversation_status = 'collaboration_complete'
     AND NOT fn_engagement_deliverables_complete(NEW.id) THEN
    RAISE EXCEPTION
      'Cannot complete engagement %: requires at least one deliverable and ALL deliverables Posted',
      NEW.id USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Commercials are frozen WHILE the engagement is Completed. To amend them,
    -- reopen the engagement first (an audited action), edit, then re-complete.
    -- This records the fee on first completion and supports renegotiation,
    -- while preventing silent edits to a settled, counted record.
    IF OLD.conversation_status = 'collaboration_complete'
       AND NEW.conversation_status = 'collaboration_complete'
       AND (NEW.agreed_fee IS DISTINCT FROM OLD.agreed_fee
            OR NEW.collaboration_type IS DISTINCT FROM OLD.collaboration_type) THEN
      RAISE EXCEPTION 'Agreed fee / collaboration type are frozen while the engagement is Completed; reopen it to amend'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.conversation_status IS DISTINCT FROM OLD.conversation_status THEN
      NEW.last_status_change_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Engagement AFTER INSERT or status change: refresh completion/rollups + timeline.
CREATE OR REPLACE FUNCTION fn_engagement_after_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_refresh_engagement_completion(NEW.id);

  IF TG_OP = 'UPDATE' AND NEW.conversation_status IS DISTINCT FROM OLD.conversation_status THEN
    INSERT INTO timeline_entries(engagement_id, contact_id, user_id, action, status_change)
    VALUES (NEW.id, NEW.contact_id,
            nullif(current_setting('app.current_user_id', true), '')::uuid,
            'status_change',
            OLD.conversation_status::text || ' -> ' || NEW.conversation_status::text);
  END IF;

  RETURN NEW;
END $$;

-- Deliverable change: refresh the parent engagement (drives campaign/contact rollups).
CREATE OR REPLACE FUNCTION fn_deliverable_after() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_eng uuid;
BEGIN
  v_eng := coalesce(NEW.engagement_id, OLD.engagement_id);
  PERFORM fn_refresh_engagement_completion(v_eng);
  RETURN coalesce(NEW, OLD);
END $$;

-- Feedback change: refresh the contact's summary metrics.
CREATE OR REPLACE FUNCTION fn_feedback_after() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_contact uuid;
BEGIN
  SELECT e.contact_id INTO v_contact
  FROM engagements e WHERE e.id = coalesce(NEW.engagement_id, OLD.engagement_id);
  PERFORM recompute_contact_summary(v_contact);
  RETURN coalesce(NEW, OLD);
END $$;

-- Blacklist record change: keep contacts.is_blacklisted in sync.
CREATE OR REPLACE FUNCTION fn_blacklist_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_contact uuid; v_active boolean;
BEGIN
  v_contact := coalesce(NEW.contact_id, OLD.contact_id);
  SELECT EXISTS (SELECT 1 FROM blacklist_records b
                 WHERE b.contact_id = v_contact AND b.is_active) INTO v_active;
  UPDATE contacts SET is_blacklisted = v_active WHERE id = v_contact;
  RETURN coalesce(NEW, OLD);
END $$;

-- Generic audit writer. Pass entity type as the trigger argument.
CREATE OR REPLACE FUNCTION fn_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_entity audit_entity_type := TG_ARGV[0]::audit_entity_type;
  v_action text;
  v_id     uuid;
  v_prev   jsonb;
  v_new    jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create'; v_id := NEW.id; v_prev := NULL;            v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update'; v_id := NEW.id; v_prev := to_jsonb(OLD);   v_new := to_jsonb(NEW);
  ELSE
    v_action := 'delete'; v_id := OLD.id; v_prev := to_jsonb(OLD);   v_new := NULL;
  END IF;

  INSERT INTO audit_logs(user_id, entity_type, entity_id, action_type, previous_value, new_value)
  VALUES (nullif(current_setting('app.current_user_id', true), '')::uuid,
          v_entity, v_id, v_action, v_prev, v_new);

  RETURN coalesce(NEW, OLD);
END $$;

-- =====================================================================
-- 15. Triggers
-- =====================================================================

-- updated_at touch
CREATE TRIGGER trg_users_touch        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_contacts_touch     BEFORE UPDATE ON contacts     FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_brands_touch       BEFORE UPDATE ON brands       FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_campaigns_touch    BEFORE UPDATE ON campaigns    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_engagements_touch  BEFORE UPDATE ON engagements  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_deliverables_touch BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_feedback_touch     BEFORE UPDATE ON feedback     FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Engagement guards & rollups
CREATE TRIGGER trg_engagement_before
  BEFORE INSERT OR UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION fn_engagement_before();

CREATE TRIGGER trg_engagement_after_insert
  AFTER INSERT ON engagements
  FOR EACH ROW EXECUTE FUNCTION fn_engagement_after_status();

-- Restricted to status changes so the completed_at self-update can't recurse.
CREATE TRIGGER trg_engagement_after_status
  AFTER UPDATE OF conversation_status ON engagements
  FOR EACH ROW EXECUTE FUNCTION fn_engagement_after_status();

-- Deliverable rollups
CREATE TRIGGER trg_deliverable_after
  AFTER INSERT OR UPDATE OR DELETE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION fn_deliverable_after();

-- Feedback rollups
CREATE TRIGGER trg_feedback_after
  AFTER INSERT OR UPDATE OR DELETE ON feedback
  FOR EACH ROW EXECUTE FUNCTION fn_feedback_after();

-- Blacklist sync
CREATE TRIGGER trg_blacklist_sync
  AFTER INSERT OR UPDATE OR DELETE ON blacklist_records
  FOR EACH ROW EXECUTE FUNCTION fn_blacklist_sync();

-- Audit (one per tracked entity)
CREATE TRIGGER trg_audit_contacts     AFTER INSERT OR UPDATE OR DELETE ON contacts          FOR EACH ROW EXECUTE FUNCTION fn_audit('contact');
CREATE TRIGGER trg_audit_campaigns    AFTER INSERT OR UPDATE OR DELETE ON campaigns         FOR EACH ROW EXECUTE FUNCTION fn_audit('campaign');
CREATE TRIGGER trg_audit_engagements  AFTER INSERT OR UPDATE OR DELETE ON engagements       FOR EACH ROW EXECUTE FUNCTION fn_audit('engagement');
CREATE TRIGGER trg_audit_deliverables AFTER INSERT OR UPDATE OR DELETE ON deliverables      FOR EACH ROW EXECUTE FUNCTION fn_audit('deliverable');
CREATE TRIGGER trg_audit_feedback     AFTER INSERT OR UPDATE OR DELETE ON feedback          FOR EACH ROW EXECUTE FUNCTION fn_audit('feedback');
CREATE TRIGGER trg_audit_blacklist    AFTER INSERT OR UPDATE OR DELETE ON blacklist_records FOR EACH ROW EXECUTE FUNCTION fn_audit('blacklist');

-- =====================================================================
-- 16. Indexes
-- =====================================================================
-- Contacts: one record per normalized (E.164) mobile number. Creation routes a
-- detected match to the existing contact instead of minting a duplicate.
-- Applied conditionally (see ensureCriticalSchema / migration 011): deferred
-- while legacy duplicates exist so a dirty DB still boots.
CREATE UNIQUE INDEX uq_contacts_mobile_number ON contacts (mobile_number) WHERE mobile_number IS NOT NULL;
CREATE INDEX idx_contacts_status        ON contacts (status);
CREATE INDEX idx_contacts_city          ON contacts (city);
CREATE INDEX idx_contacts_status        ON contacts (status);
CREATE INDEX idx_contacts_city          ON contacts (city);
CREATE INDEX idx_contacts_classification ON contacts (classification);
CREATE INDEX idx_contacts_blacklisted   ON contacts (is_blacklisted);
CREATE INDEX idx_contacts_type          ON contacts (contact_type);

-- Engagements: scoping, follow-up dashboard, uniqueness already covered
CREATE INDEX idx_engagements_campaign        ON engagements (campaign_id);
CREATE INDEX idx_engagements_contact         ON engagements (contact_id);
CREATE INDEX idx_engagements_owner_followup  ON engagements (assigned_manager, next_follow_up_date);
CREATE INDEX idx_engagements_status          ON engagements (conversation_status);
CREATE INDEX idx_engagements_laststatus      ON engagements (last_status_change_at);
CREATE INDEX idx_engagements_visit_date      ON engagements (visit_date) WHERE conversation_status = 'scheduled';

-- Deliverables: completion checks, due/overdue dashboards
CREATE INDEX idx_deliverables_engagement_status ON deliverables (engagement_id, status);
CREATE INDEX idx_deliverables_due               ON deliverables (due_date);

-- Timeline: fast retrieval for engagement + contact profile feeds
CREATE INDEX idx_timeline_engagement ON timeline_entries (engagement_id, occurred_at);
CREATE INDEX idx_timeline_contact    ON timeline_entries (contact_id, occurred_at);

-- Audit
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id, occurred_at);

-- Assets
CREATE INDEX idx_assets_campaign    ON assets (campaign_id);
CREATE INDEX idx_assets_deliverable ON assets (deliverable_id);

-- Registration queue
CREATE INDEX idx_registration_status ON registration_submissions (status);
CREATE INDEX idx_registration_mobile ON registration_submissions (mobile_number);

-- Tag / category filtering
CREATE INDEX idx_contact_tags_tag     ON contact_tags (tag_id);
CREATE INDEX idx_campaign_tags_tag    ON campaign_tags (tag_id);
CREATE INDEX idx_contact_seccat_cat   ON contact_secondary_categories (category_id);

-- =====================================================================
-- 17. Views
-- =====================================================================
-- Overdue is computed (IST), never stored.
CREATE OR REPLACE VIEW v_deliverables AS
SELECT d.*,
       (d.status <> 'posted'
        AND d.due_date IS NOT NULL
        AND d.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS is_overdue
FROM deliverables d;

-- Convenience: engagement counting flag for reporting/dashboards.
CREATE OR REPLACE VIEW v_engagements AS
SELECT e.*,
       (e.conversation_status = 'collaboration_complete'
        AND fn_engagement_deliverables_complete(e.id)) AS is_counted_collaboration
FROM engagements e;

-- =====================================================================
-- 18. Application-layer responsibilities (NOT enforced here)
-- =====================================================================
-- 1. Mobile dedup: before INSERT on contacts / on registration approval /
--    bulk import, query by E.164 (normalizeMobileToE164). If a match exists, WARN
--    or flag Duplicate; user may Cancel or Continue (continue may still create).
--    Store contacts.mobile_number as E.164 (e.g. +919876543210). Legacy rows may
--    match via national suffix fallback until backfilled. Hence no DB unique.
-- 2. Set the actor each transaction:  SET LOCAL app.current_user_id = '<uuid>';
--    (audit_logs and timeline_entries read it; null = system action).
-- 3. Follow-up suggestions (today+3 / today+7 / =visit_date / cleared) and the
--    "open visit modal on Scheduled" UX are app-driven; the DB only enforces
--    that visit_date exists while status = scheduled (ck_visit_when_scheduled).
-- 4. conversation_status = 'dropped' is intentional (migration 007): reason lives
--    in engagements.drop_reason (e.g. didnt_deliver). Do not invent extra enum values.
-- 5. Default query scope should exclude status = 'archived' unless explicitly
--    requested; exclude is_blacklisted = true from campaign population by default.
-- 6. Client-facing report exports must omit agreed_fee, internal_rating, and
--    internal_notes; shareable links carry an expiry + revocation (app-managed).
-- 7. Dashboard widgets read stored rollups (campaigns.*, contacts.*) and the
--    v_deliverables / v_engagements views; avoid ad-hoc aggregation in the
--    request path. Stalled = now() - last_status_change_at > 7/14/30 days.
-- =====================================================================
-- END OF SCHEMA
