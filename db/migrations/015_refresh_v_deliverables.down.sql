-- Recreate the view definition (same shape). The historical frozen-column form
-- is not meaningfully reproducible, so down simply re-asserts the view.
DROP VIEW IF EXISTS v_deliverables;

CREATE VIEW v_deliverables AS
SELECT d.*,
       (d.status <> 'posted'
        AND d.due_date IS NOT NULL
        AND d.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS is_overdue
FROM deliverables d;
