-- Revert to legacy collaboration_reason enum (pre-PRD correction)

DROP VIEW IF EXISTS v_engagements;

ALTER TABLE engagements
  ALTER COLUMN primary_collaboration_reason TYPE text
  USING primary_collaboration_reason::text;

ALTER TABLE engagements
  ALTER COLUMN secondary_collaboration_reason TYPE text
  USING secondary_collaboration_reason::text;

DROP TYPE collaboration_reason;

CREATE TYPE collaboration_reason AS ENUM ('business', 'vitality', 'positioning');

UPDATE engagements
SET primary_collaboration_reason = CASE primary_collaboration_reason
  WHEN 'virality' THEN 'vitality'
  WHEN 'expert' THEN 'business'
  WHEN 'positioning' THEN 'positioning'
  ELSE primary_collaboration_reason
END
WHERE primary_collaboration_reason IS NOT NULL;

UPDATE engagements
SET secondary_collaboration_reason = CASE secondary_collaboration_reason
  WHEN 'virality' THEN 'vitality'
  WHEN 'expert' THEN 'business'
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

CREATE OR REPLACE VIEW v_engagements AS
SELECT e.*,
       (e.conversation_status = 'collaboration_complete'
        AND fn_engagement_deliverables_complete(e.id)) AS is_counted_collaboration
FROM engagements e;
