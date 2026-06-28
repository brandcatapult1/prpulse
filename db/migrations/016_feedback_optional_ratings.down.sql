-- Restore required ratings (only safe when no nulls remain).
UPDATE feedback SET content_quality = 3 WHERE content_quality IS NULL;
UPDATE feedback SET professionalism = 3 WHERE professionalism IS NULL;
UPDATE feedback SET timeliness = 3 WHERE timeliness IS NULL;

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS ck_feedback_content_quality;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS ck_feedback_professionalism;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS ck_feedback_timeliness;

ALTER TABLE feedback
  ALTER COLUMN content_quality SET NOT NULL,
  ALTER COLUMN professionalism SET NOT NULL,
  ALTER COLUMN timeliness SET NOT NULL;

ALTER TABLE feedback ADD CONSTRAINT feedback_content_quality_check
  CHECK (content_quality BETWEEN 1 AND 5);
ALTER TABLE feedback ADD CONSTRAINT feedback_professionalism_check
  CHECK (professionalism BETWEEN 1 AND 5);
ALTER TABLE feedback ADD CONSTRAINT feedback_timeliness_check
  CHECK (timeliness BETWEEN 1 AND 5);
