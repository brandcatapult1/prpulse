ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS ck_deliverable_posted_quantity;
ALTER TABLE deliverables
  DROP COLUMN IF EXISTS unit_proofs,
  DROP COLUMN IF EXISTS posted_quantity;
