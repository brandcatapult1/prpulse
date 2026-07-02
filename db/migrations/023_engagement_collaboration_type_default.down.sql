ALTER TABLE engagements
  ALTER COLUMN collaboration_type DROP NOT NULL;

ALTER TABLE engagements
  ALTER COLUMN collaboration_type DROP DEFAULT;
