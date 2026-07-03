-- Extend tags master list: type (influencer|campaign), soft-archive, created_by.
-- Does NOT alter contact_tags / campaign_tags assignment storage.
-- Archiving (is_active=false) never strips tags already applied to contacts.

-- name: citext UNIQUE → text + case-insensitive unique on lower(name)
ALTER TABLE tags
  ALTER COLUMN name TYPE text USING name::text;

ALTER TABLE tags
  DROP CONSTRAINT IF EXISTS tags_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_lower_uidx ON tags (lower(name));

-- type: influencer | campaign (existing rows are influencer tags)
ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS type text;

UPDATE tags
SET type = 'influencer'
WHERE type IS NULL;

ALTER TABLE tags
  ALTER COLUMN type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tags_type_check'
  ) THEN
    ALTER TABLE tags
      ADD CONSTRAINT tags_type_check CHECK (type IN ('influencer', 'campaign'));
  END IF;
END $$;

ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Idempotent seed of the prior DEFAULT_TAGS list as influencer tags.
INSERT INTO tags (name, type, is_active)
VALUES
  ('Luxury', 'influencer', true),
  ('Hospitality', 'influencer', true),
  ('Celebrity', 'influencer', true),
  ('Reliable', 'influencer', true),
  ('Delhi', 'influencer', true),
  ('Mumbai', 'influencer', true),
  ('High Conversion', 'influencer', true),
  ('Trending', 'influencer', true),
  ('Alco Bev', 'influencer', true),
  ('Chef', 'influencer', true),
  ('Stylist', 'influencer', true),
  ('Interior', 'influencer', true),
  ('UGC', 'influencer', true),
  ('Parenting', 'influencer', true),
  ('Camellias', 'influencer', true)
ON CONFLICT ((lower(name))) DO NOTHING;
