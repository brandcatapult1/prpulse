-- Brand outlets (V1: one default per brand) and engagement visit outlet reference.

CREATE TABLE outlets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  outlet_name  text NOT NULL,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_outlets_one_default_per_brand
  ON outlets (brand_id) WHERE is_default;

CREATE TRIGGER trg_outlets_touch
  BEFORE UPDATE ON outlets
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

ALTER TABLE engagements
  ADD COLUMN visit_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL;

-- One default outlet per existing brand (prefer legacy visit_outlet text when present).
INSERT INTO outlets (brand_id, outlet_name, is_default)
SELECT b.id,
  COALESCE(
    (
      SELECT e.visit_outlet
      FROM engagements e
      JOIN campaigns c ON c.id = e.campaign_id
      WHERE c.brand_id = b.id AND e.visit_outlet IS NOT NULL AND btrim(e.visit_outlet) <> ''
      ORDER BY e.updated_at DESC
      LIMIT 1
    ),
    b.brand_name
  ),
  true
FROM brands b
WHERE NOT EXISTS (
  SELECT 1 FROM outlets o WHERE o.brand_id = b.id AND o.is_default
);

UPDATE engagements e
SET visit_outlet_id = o.id
FROM campaigns c
JOIN outlets o ON o.brand_id = c.brand_id AND o.is_default
WHERE e.campaign_id = c.id
  AND e.visit_outlet_id IS NULL;

UPDATE engagements e
SET visit_outlet = o.outlet_name
FROM outlets o
WHERE e.visit_outlet_id = o.id
  AND (e.visit_outlet IS NULL OR btrim(e.visit_outlet) = '');

COMMENT ON TABLE outlets IS 'Physical brand locations; V1 uses one default outlet per brand.';
COMMENT ON COLUMN engagements.visit_outlet_id IS 'Outlet for scheduled visit; defaults to brand default outlet.';
