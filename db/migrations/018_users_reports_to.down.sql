DROP INDEX IF EXISTS idx_users_reports_to;
ALTER TABLE users DROP COLUMN IF EXISTS reports_to;
