-- Engagement workflow metadata + contact notes (used by board logging and profile edit).
-- agreed_fee and collaboration_type already exist on engagements (001).

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS dropped_from text,
  ADD COLUMN IF NOT EXISTS no_reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contact_log_type text,
  ADD COLUMN IF NOT EXISTS visit_completed_date date;

COMMENT ON COLUMN contacts.notes IS 'Internal notes on the contact profile (not client-facing).';
COMMENT ON COLUMN engagements.dropped_from IS 'Stage slug when engagement was dropped; used for reopen routing.';
COMMENT ON COLUMN engagements.no_reply_count IS 'Consecutive no-reply contact log count.';
COMMENT ON COLUMN engagements.last_contact_log_type IS 'Last contact log: conversation | no_reply_attempt.';
COMMENT ON COLUMN engagements.visit_completed_date IS 'Date visit was marked done (IST calendar date).';
