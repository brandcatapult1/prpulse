DROP TRIGGER IF EXISTS trg_deliverables_before ON deliverables;
DROP FUNCTION IF EXISTS fn_deliverable_before() CASCADE;

ALTER TABLE deliverables DROP COLUMN IF EXISTS line_fee;
