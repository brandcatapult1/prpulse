ALTER TABLE engagements
  DROP COLUMN IF EXISTS visit_completed_date,
  DROP COLUMN IF EXISTS last_contact_log_type,
  DROP COLUMN IF EXISTS no_reply_count,
  DROP COLUMN IF EXISTS dropped_from;

ALTER TABLE contacts
  DROP COLUMN IF EXISTS notes;
