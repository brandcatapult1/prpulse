-- Single-row org branding (agency logo, etc.)

CREATE TABLE org_settings (
  id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_url   text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO org_settings (id) VALUES (1);
