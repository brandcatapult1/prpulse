-- Persist the country selected on the public creator signup form.

ALTER TABLE registration_submissions
  ADD COLUMN IF NOT EXISTS country_code text;

UPDATE registration_submissions
SET country_code = 'IN'
WHERE country_code IS NULL;

ALTER TABLE registration_submissions
  ALTER COLUMN country_code SET DEFAULT 'IN';

