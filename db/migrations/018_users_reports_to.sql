-- Optional reporting line per user (manager dashboard).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_reports_to ON users (reports_to);
