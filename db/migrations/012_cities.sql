-- Admin-configurable cities grouped by country (curated list, not world-cities dump).

CREATE TABLE IF NOT EXISTS cities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       citext NOT NULL,
  country    text NOT NULL CHECK (country IN ('IN', 'AE', 'US', 'GB')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, name)
);

CREATE INDEX IF NOT EXISTS idx_cities_country ON cities (country);
