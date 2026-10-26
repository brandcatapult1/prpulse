-- Optional per-creator Instagram access. Creators we ask (WhatsApp / email / link) approve our
-- Meta app once; the encrypted long-lived token then lets us read their own post insights
-- (reach, saves, shares, reposts). Everyone else keeps public data only.
CREATE TABLE IF NOT EXISTS creator_instagram_connections (
  contact_id       uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  ig_user_id       text NOT NULL,
  ig_username      text,
  access_token_enc text NOT NULL,
  token_expires_at timestamptz,
  status           text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'error')),
  last_error       text,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Every request we sent (history + "Requested" status until they approve).
CREATE TABLE IF NOT EXISTS creator_instagram_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'link')),
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_requests_contact ON creator_instagram_requests (contact_id, requested_at DESC);

-- 'insights' = numbers read from the creator's own Instagram insights.
ALTER TABLE deliverable_metrics DROP CONSTRAINT IF EXISTS deliverable_metrics_source_check;
ALTER TABLE deliverable_metrics
  ADD CONSTRAINT deliverable_metrics_source_check CHECK (source IN ('api', 'insights', 'manual'));
