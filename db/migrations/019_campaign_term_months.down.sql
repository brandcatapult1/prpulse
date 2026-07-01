ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS ck_campaigns_term_months;
ALTER TABLE campaigns DROP COLUMN IF EXISTS term_months;
