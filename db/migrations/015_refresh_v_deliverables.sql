-- v_deliverables (001) was created as `SELECT d.*, ...` which Postgres freezes to
-- the column list present at creation time. Migration 006 added posted_quantity
-- and unit_proofs to the deliverables TABLE but never recreated the view, so the
-- view kept returning only pre-006 columns. Result: a logged deliverable was
-- written correctly (status='posted', posted_quantity advanced) but read back
-- through the view without posted_quantity, so the UI count stayed 0/Y.
-- Recreate the view so `d.*` re-expands to the current deliverables columns.
DROP VIEW IF EXISTS v_deliverables;

CREATE VIEW v_deliverables AS
SELECT d.*,
       (d.status <> 'posted'
        AND d.due_date IS NOT NULL
        AND d.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS is_overdue
FROM deliverables d;
