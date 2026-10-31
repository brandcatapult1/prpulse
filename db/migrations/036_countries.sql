-- Admin-managed countries (ISO code, name, phone extension). Cities hang off countries.code.

CREATE TABLE IF NOT EXISTS countries (
  code       text PRIMARY KEY,
  label      text NOT NULL,
  dial_code  text NOT NULL,
  sort_order int  NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO countries (code, label, dial_code, sort_order) VALUES
  ('IN', 'India', '+91', 1),
  ('AE', 'UAE',   '+971', 2),
  ('US', 'USA',   '+1', 3),
  ('GB', 'UK',    '+44', 4)
ON CONFLICT (code) DO NOTHING;

-- Cities were limited to the four built-in countries; any managed country is allowed now.
ALTER TABLE cities DROP CONSTRAINT IF EXISTS cities_country_check;
