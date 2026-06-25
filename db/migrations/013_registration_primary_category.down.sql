DROP INDEX IF EXISTS idx_registration_primary_category;

ALTER TABLE registration_submissions
  DROP COLUMN IF EXISTS primary_category_id;
