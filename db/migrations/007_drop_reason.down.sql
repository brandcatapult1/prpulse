ALTER TABLE engagements DROP COLUMN IF EXISTS drop_reason;

-- conversation_status value 'dropped' cannot be removed from the enum in-place.
