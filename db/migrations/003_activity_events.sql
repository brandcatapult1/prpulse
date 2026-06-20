-- Append-only campaign activity audit trail (single source of truth for timeline + V2 performance).

CREATE TYPE activity_action AS ENUM (
  'stage_changed',
  'first_outreach',
  'contact_replied',
  'contact_no_reply',
  'deliverable_posted',
  'reject',
  'reopen',
  'didnt_deliver',
  'blacklist_set',
  'blacklist_cleared',
  'feedback_logged'
);

CREATE TABLE activity_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  engagement_id   uuid REFERENCES engagements(id) ON DELETE CASCADE,
  actor_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_name      text NOT NULL,
  actor_role      text NOT NULL,
  action          activity_action NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}',
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_events_campaign ON activity_events (campaign_id, occurred_at DESC);
CREATE INDEX idx_activity_events_engagement ON activity_events (engagement_id, occurred_at DESC);
CREATE INDEX idx_activity_events_actor ON activity_events (actor_user_id, occurred_at DESC);

COMMENT ON TABLE activity_events IS
  'Append-only audit trail for campaign view mutations. Corrections are new rows, never updates/deletes.';
