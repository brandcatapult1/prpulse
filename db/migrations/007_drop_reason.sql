-- Didn't Deliver uses conversation_status = 'dropped' with drop_reason + dropped_from (not a 4th dropped_* status).

ALTER TYPE conversation_status ADD VALUE IF NOT EXISTS 'dropped';

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS drop_reason text;

COMMENT ON COLUMN engagements.drop_reason IS 'Drop reason slug when distinct from conversation_status (e.g. didnt_deliver).';
