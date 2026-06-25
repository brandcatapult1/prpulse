-- Primary category on registration submissions (FK to admin-managed categories).
ALTER TABLE registration_submissions
  ADD COLUMN primary_category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX idx_registration_primary_category ON registration_submissions (primary_category_id);
