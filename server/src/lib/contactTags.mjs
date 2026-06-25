/** Sync contact_tags with audit logging for manual assignment changes. */

export async function logContactTagAudit(
  client,
  { contactId, userId, action, tagId, tagName, extra = {} },
) {
  await client.query(
    `INSERT INTO audit_logs(user_id, entity_type, entity_id, action_type, previous_value, new_value)
     VALUES ($1, 'contact', $2, $3, $4, $5::jsonb)`,
    [
      userId ?? null,
      contactId,
      action,
      action === 'tag_removed' ? { tag_id: tagId, tag_name: tagName, ...extra } : null,
      action === 'tag_added' ? { tag_id: tagId, tag_name: tagName, ...extra } : null,
    ],
  );
}

export async function syncContactTags(client, contactId, tagIds, { userId, extra = {} } = {}) {
  const { rows: existing } = await client.query(
    `SELECT ct.tag_id, t.name
     FROM contact_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = $1`,
    [contactId],
  );

  const existingIds = new Set(existing.map((r) => r.tag_id));
  const nextIds = [...new Set((tagIds ?? []).filter(Boolean))];

  for (const row of existing) {
    if (!nextIds.includes(row.tag_id)) {
      await client.query(
        'DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2',
        [contactId, row.tag_id],
      );
      await logContactTagAudit(client, {
        contactId,
        userId,
        action: 'tag_removed',
        tagId: row.tag_id,
        tagName: row.name,
        extra: { source: 'manual' },
      });
    }
  }

  for (const tagId of nextIds) {
    if (existingIds.has(tagId)) continue;

    const { rows: inserted } = await client.query(
      `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING tag_id`,
      [contactId, tagId],
    );
    if (!inserted[0]) continue;

    const { rows: tagRows } = await client.query('SELECT name FROM tags WHERE id = $1', [tagId]);
    const tagName = tagRows[0]?.name ?? tagId;

    await logContactTagAudit(client, {
      contactId,
      userId,
      action: 'tag_added',
      tagId,
      tagName,
      extra: { source: 'manual', ...extra },
    });
  }
}

export async function syncCampaignTags(client, campaignId, tagIds) {
  const nextIds = [...new Set((tagIds ?? []).filter(Boolean))];

  if (tagIds !== undefined) {
    await client.query('DELETE FROM campaign_tags WHERE campaign_id = $1', [campaignId]);
    for (const tagId of nextIds) {
      await client.query(
        `INSERT INTO campaign_tags (campaign_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [campaignId, tagId],
      );
    }
  }
}

export async function loadCampaignTags(client, campaignId) {
  const { rows } = await client.query(
    `SELECT t.id, t.name
     FROM campaign_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.campaign_id = $1
     ORDER BY t.name`,
    [campaignId],
  );
  return rows;
}

export async function loadContactDetailTags(client, contactId) {
  const { rows } = await client.query(
    `SELECT t.id, t.name
     FROM contact_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = $1
     ORDER BY t.name`,
    [contactId],
  );
  return rows;
}
