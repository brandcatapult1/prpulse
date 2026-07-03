/** Contact/campaign tag sync. Campaign-type contact_tags are system-derived only. */

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

/**
 * Manual/user contact-edit write path.
 * Reconciles ONLY influencer-type contact_tags against incoming tag_ids.
 * Campaign-type rows are left untouched (owned by recompute_contact_campaign_tags).
 * Campaign-type ids in the incoming payload are ignored.
 */
export async function syncContactTags(client, contactId, tagIds, { userId, extra = {} } = {}) {
  const incomingIds = [...new Set((tagIds ?? []).filter(Boolean))];

  const { rows: influencerIncoming } = incomingIds.length
    ? await client.query(
      `SELECT id FROM tags WHERE id = ANY($1::uuid[]) AND type = 'influencer'`,
      [incomingIds],
    )
    : { rows: [] };
  const nextIds = influencerIncoming.map((r) => r.id);

  const { rows: existing } = await client.query(
    `SELECT ct.tag_id, t.name
     FROM contact_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = $1 AND t.type = 'influencer'`,
    [contactId],
  );

  const existingIds = new Set(existing.map((r) => r.tag_id));

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

/** Replace campaign_tags, then re-derive campaign-type tags on counted-complete contacts. */
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
    await client.query('SELECT recompute_contacts_for_campaign_tags($1::uuid)', [campaignId]);
  }
}

export async function loadCampaignTags(client, campaignId) {
  const { rows } = await client.query(
    `SELECT t.id, t.name, t.type, t.is_active
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
    `SELECT t.id, t.name, t.type, t.is_active
     FROM contact_tags ct
     JOIN tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = $1
     ORDER BY t.name`,
    [contactId],
  );
  return rows;
}
