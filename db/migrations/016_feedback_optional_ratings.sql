-- Per-dimension feedback ratings are optional (null = not rated).

ALTER TABLE feedback
  ALTER COLUMN content_quality DROP NOT NULL,
  ALTER COLUMN professionalism DROP NOT NULL,
  ALTER COLUMN timeliness DROP NOT NULL;

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_content_quality_check;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_professionalism_check;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_timeliness_check;

ALTER TABLE feedback ADD CONSTRAINT ck_feedback_content_quality
  CHECK (content_quality IS NULL OR (content_quality BETWEEN 1 AND 5));
ALTER TABLE feedback ADD CONSTRAINT ck_feedback_professionalism
  CHECK (professionalism IS NULL OR (professionalism BETWEEN 1 AND 5));
ALTER TABLE feedback ADD CONSTRAINT ck_feedback_timeliness
  CHECK (timeliness IS NULL OR (timeliness BETWEEN 1 AND 5));
