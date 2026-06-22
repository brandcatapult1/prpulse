-- Per-unit posting progress on a single deliverable row (quantity > 1).

ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS posted_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_proofs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS ck_deliverable_posted_quantity;
ALTER TABLE deliverables ADD CONSTRAINT ck_deliverable_posted_quantity
  CHECK (posted_quantity >= 0 AND posted_quantity <= quantity);

UPDATE deliverables
SET posted_quantity = quantity
WHERE status = 'posted' AND posted_quantity = 0;

COMMENT ON COLUMN deliverables.posted_quantity IS 'How many quantity units have been logged posted with proof.';
COMMENT ON COLUMN deliverables.unit_proofs IS 'Per-unit proof payloads [{content_link, screenshots, published_date}, …].';
