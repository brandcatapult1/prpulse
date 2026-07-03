-- Reverse tags master-field extension. Leaves tag rows and contact_tags intact.

ALTER TABLE tags DROP COLUMN IF EXISTS created_by;
ALTER TABLE tags DROP COLUMN IF EXISTS is_active;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_check;
ALTER TABLE tags DROP COLUMN IF EXISTS type;

DROP INDEX IF EXISTS tags_name_lower_uidx;

-- Restore citext unique name (may fail if non-unique under citext rules — unlikely).
ALTER TABLE tags
  ALTER COLUMN name TYPE citext USING name::citext;

ALTER TABLE tags
  ADD CONSTRAINT tags_name_key UNIQUE (name);
