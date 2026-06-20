-- Align collaboration_reason enum with PRD: Virality, Expert, Positioning

ALTER TABLE engagements
  ALTER COLUMN primary_collaboration_reason TYPE text
  USING primary_collaboration_reason::text;

ALTER TABLE engagements
  ALTER COLUMN secondary_collaboration_reason TYPE text
  USING secondary_collaboration_reason::text;

DROP TYPE collaboration_reason;

CREATE TYPE collaboration_reason AS ENUM ('virality', 'expert', 'positioning');

UPDATE engagements
SET primary_collaboration_reason = CASE primary_collaboration_reason
  WHEN 'business' THEN 'virality'
  WHEN 'vitality' THEN 'virality'
  WHEN 'positioning' THEN 'positioning'
  ELSE primary_collaboration_reason
END
WHERE primary_collaboration_reason IS NOT NULL;

UPDATE engagements
SET secondary_collaboration_reason = CASE secondary_collaboration_reason
  WHEN 'business' THEN 'virality'
  WHEN 'vitality' THEN 'virality'
  WHEN 'positioning' THEN 'positioning'
  ELSE secondary_collaboration_reason
END
WHERE secondary_collaboration_reason IS NOT NULL;

ALTER TABLE engagements
  ALTER COLUMN primary_collaboration_reason TYPE collaboration_reason
  USING primary_collaboration_reason::collaboration_reason;

ALTER TABLE engagements
  ALTER COLUMN secondary_collaboration_reason TYPE collaboration_reason
  USING secondary_collaboration_reason::collaboration_reason;
