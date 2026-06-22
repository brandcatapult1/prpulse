/** Idempotent schema repairs for tables that must exist at runtime. */
export async function ensureCriticalSchema(pool) {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_settings (
      id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      logo_url   text,
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO org_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;
  `);
}
