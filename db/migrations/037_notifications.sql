-- In-app toasts: who should be told about what, and what each user has already been shown.

CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL,
  message        text NOT NULL,
  actor_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  audience_roles text[] NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_seen_at timestamptz;
