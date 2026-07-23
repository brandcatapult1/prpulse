const CONTACT_LIST_SELECT = `
  SELECT c.id, c.full_name, c.city, c.classification, c.status,
         c.is_blacklisted, c.mobile_number, c.contact_type,
         c.open_to_paid, c.open_to_barter,
         c.primary_category_id,
         pc.name AS primary_category_name,
         COALESCE(
           (
             SELECT array_agg(t.name ORDER BY t.name)
             FROM contact_tags ct
             JOIN tags t ON t.id = ct.tag_id
             WHERE ct.contact_id = c.id
           ),
           ARRAY[]::text[]
         ) AS tags
  FROM contacts c
  LEFT JOIN categories pc ON pc.id = c.primary_category_id
`;

function parsePage(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parsePageSize(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 100);
}

function parseUuidList(value) {
  if (!value?.trim()) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Build WHERE clause + params for contacts list (AND-combined filters).
 */
export function buildContactListFilters(query) {
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  const status = query.status ?? '';
  const includeArchived = query.include_archived === 'true';

  if (status === 'active' || status === 'inactive' || status === 'archived') {
    conditions.push(`c.status = $${idx}`);
    params.push(status);
    idx += 1;
  } else if (status === 'all') {
    // No status restriction — include archived when requested.
  } else if (!includeArchived) {
    conditions.push("c.status <> 'archived'");
  }

  const q = query.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(`(
      c.full_name ILIKE $${idx}
      OR c.mobile_number ILIKE $${idx}
      OR c.city ILIKE $${idx}
      OR pc.name ILIKE $${idx}
      OR EXISTS (
        SELECT 1
        FROM contact_tags ct_q
        JOIN tags t_q ON t_q.id = ct_q.tag_id
        WHERE ct_q.contact_id = c.id AND t_q.name ILIKE $${idx}
      )
    )`);
    params.push(pattern);
    idx += 1;
  }

  if (query.classification) {
    conditions.push(`c.classification = $${idx}`);
    params.push(query.classification);
    idx += 1;
  }

  if (query.city) {
    conditions.push(`c.city = $${idx}`);
    params.push(query.city);
    idx += 1;
  }

  if (query.open_to_paid === 'true') {
    conditions.push('c.open_to_paid = true');
  }

  if (query.open_to_barter === 'true') {
    conditions.push('c.open_to_barter = true');
  }

  const tagIds = parseUuidList(query.tag_ids);
  if (tagIds.length > 0) {
    conditions.push(`(
      SELECT COUNT(DISTINCT ct.tag_id)
      FROM contact_tags ct
      WHERE ct.contact_id = c.id AND ct.tag_id = ANY($${idx}::uuid[])
    ) = $${idx + 1}`);
    params.push(tagIds, tagIds.length);
    idx += 2;
  }

  const categoryIds = parseUuidList(query.primary_category_ids);
  if (categoryIds.length > 0) {
    conditions.push(`c.primary_category_id = ANY($${idx}::uuid[])`);
    params.push(categoryIds);
    idx += 1;
  }

  return {
    whereSql: conditions.join(' AND '),
    params,
  };
}

export async function listContactsPaginated(pool, query) {
  const page = parsePage(query.page);
  const pageSize = parsePageSize(query.page_size);
  const offset = (page - 1) * pageSize;

  const { whereSql, params } = buildContactListFilters(query);
  const fromSql = `${CONTACT_LIST_SELECT} WHERE ${whereSql}`;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM (${fromSql}) counted`,
    params,
  );
  const total = countResult.rows[0]?.total ?? 0;

  const listParams = [...params, pageSize, offset];
  const { rows } = await pool.query(
    `${fromSql}
     ORDER BY c.full_name
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return { rows, total, page, pageSize };
}
