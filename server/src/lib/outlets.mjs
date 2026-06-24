/** SQL fragments for resolving visit outlet on engagement rows. */
export const ENGAGEMENT_OUTLET_SELECT = `
  vo.outlet_name AS visit_outlet_name,
  COALESCE(vo.outlet_name, brand_default_outlet.outlet_name) AS visit_outlet_display,
  COALESCE(e.visit_outlet_id, brand_default_outlet.id) AS visit_outlet_id_resolved,
  brand_default_outlet.id AS brand_default_outlet_id,
  brand_default_outlet.outlet_name AS brand_default_outlet_name`;

export const ENGAGEMENT_OUTLET_JOINS = `
  LEFT JOIN outlets vo ON vo.id = e.visit_outlet_id
  LEFT JOIN outlets brand_default_outlet
    ON brand_default_outlet.brand_id = cam.brand_id AND brand_default_outlet.is_default`;

export async function getDefaultOutletForCampaign(client, campaignId) {
  const { rows } = await client.query(
    `SELECT o.id, o.outlet_name
     FROM campaigns c
     JOIN outlets o ON o.brand_id = c.brand_id AND o.is_default
     WHERE c.id = $1`,
    [campaignId],
  );
  return rows[0] ?? null;
}

export async function getDefaultOutletForBrand(client, brandId) {
  const { rows } = await client.query(
    `SELECT id, outlet_name FROM outlets WHERE brand_id = $1 AND is_default`,
    [brandId],
  );
  return rows[0] ?? null;
}

export async function ensureDefaultOutletForBrand(client, brandId, outletName) {
  const existing = await getDefaultOutletForBrand(client, brandId);
  if (existing) return existing;

  let name = outletName?.trim() || null;
  if (!name) {
    const { rows } = await client.query('SELECT brand_name FROM brands WHERE id = $1', [brandId]);
    name = rows[0]?.brand_name ?? 'Default outlet';
  }

  const { rows } = await client.query(
    `INSERT INTO outlets (brand_id, outlet_name, is_default)
     VALUES ($1, $2, true)
     RETURNING id, outlet_name`,
    [brandId, name],
  );
  return rows[0];
}

export async function syncVisitOutletText(client, outletId) {
  if (!outletId) return null;
  const { rows } = await client.query('SELECT outlet_name FROM outlets WHERE id = $1', [outletId]);
  return rows[0]?.outlet_name ?? null;
}

/** Normalize browser time input (HH:MM) to Postgres time (HH:MM:SS). */
export function normalizeVisitTime(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}
