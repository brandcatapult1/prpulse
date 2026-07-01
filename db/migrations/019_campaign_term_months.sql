-- Retainer length for monthly recurring campaigns (cycle logic comes later).

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS term_months integer;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS ck_campaigns_term_months;
ALTER TABLE campaigns ADD CONSTRAINT ck_campaigns_term_months
  CHECK (term_months IS NULL OR term_months >= 1);
