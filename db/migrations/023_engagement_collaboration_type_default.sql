-- Ensure every engagement always has paid/barter classification.
-- Order matters: backfill -> default -> not null.

UPDATE engagements
SET collaboration_type = 'barter'
WHERE collaboration_type IS NULL;

ALTER TABLE engagements
  ALTER COLUMN collaboration_type SET DEFAULT 'barter';

ALTER TABLE engagements
  ALTER COLUMN collaboration_type SET NOT NULL;
