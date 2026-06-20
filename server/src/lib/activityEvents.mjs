/** Server-side activity event writer — actor always from req.user, never request body. */

export const ACTIVITY_ACTION = {
  STAGE_CHANGED: 'stage_changed',
  FIRST_OUTREACH: 'first_outreach',
  CONTACT_REPLIED: 'contact_replied',
  CONTACT_NO_REPLY: 'contact_no_reply',
  DELIVERABLE_POSTED: 'deliverable_posted',
  REJECT: 'reject',
  REOPEN: 'reopen',
  DIDNT_DELIVER: 'didnt_deliver',
  BLACKLIST_SET: 'blacklist_set',
  BLACKLIST_CLEARED: 'blacklist_cleared',
  FEEDBACK_LOGGED: 'feedback_logged',
};

export async function insertActivityEvent(client, user, { campaignId, engagementId, action, details = {} }) {
  if (!user?.id) {
    throw new Error('Authenticated user required for activity events');
  }
  if (!campaignId || !action) {
    throw new Error('campaignId and action are required');
  }

  const { rows } = await client.query(
    `INSERT INTO activity_events
       (campaign_id, engagement_id, actor_user_id, actor_name, actor_role, action, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [
      campaignId,
      engagementId ?? null,
      user.id,
      user.full_name,
      user.role,
      action,
      JSON.stringify(details),
    ],
  );
  return rows[0];
}

/** Log activity when the table exists; skip silently until migration 003 is applied. */
export async function tryInsertActivityEvent(client, user, payload) {
  try {
    return await insertActivityEvent(client, user, payload);
  } catch (err) {
    if (err.code === '42P01') return null;
    throw err;
  }
}

function formatStatusLabel(status) {
  return (status ?? '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const ACTION_LABELS = {
  [ACTIVITY_ACTION.STAGE_CHANGED]: 'Status changed',
  [ACTIVITY_ACTION.FIRST_OUTREACH]: 'First outreach logged',
  [ACTIVITY_ACTION.CONTACT_REPLIED]: 'Contact logged — replied',
  [ACTIVITY_ACTION.CONTACT_NO_REPLY]: 'Contact logged — no reply',
  [ACTIVITY_ACTION.DELIVERABLE_POSTED]: 'Deliverable posted',
  [ACTIVITY_ACTION.REJECT]: 'Profile rejected',
  [ACTIVITY_ACTION.REOPEN]: 'Engagement reopened',
  [ACTIVITY_ACTION.DIDNT_DELIVER]: "Didn't deliver",
  [ACTIVITY_ACTION.BLACKLIST_SET]: 'Contact blacklisted',
  [ACTIVITY_ACTION.BLACKLIST_CLEARED]: 'Blacklist cleared',
  [ACTIVITY_ACTION.FEEDBACK_LOGGED]: 'Feedback logged',
};

export function activityRowToTimelineEntry(row) {
  const details = row.details ?? {};
  let statusChange = null;
  if (row.action === ACTIVITY_ACTION.STAGE_CHANGED && details.toStage) {
    statusChange = `${formatStatusLabel(details.fromStage)} → ${formatStatusLabel(details.toStage)}`;
  } else if (row.action === ACTIVITY_ACTION.FIRST_OUTREACH) {
    statusChange = 'In Conversation';
  } else if (row.action === ACTIVITY_ACTION.REOPEN && details.toStage) {
    statusChange = formatStatusLabel(details.toStage);
  }

  return {
    id: row.id,
    occurred_at: row.occurred_at,
    user_name: row.actor_name,
    action: ACTION_LABELS[row.action] ?? row.action,
    status_change: statusChange,
    notes: details.note ?? details.reason ?? null,
  };
}

export async function listActivityEventsForEngagement(client, engagementId) {
  try {
    const { rows } = await client.query(
      `SELECT * FROM activity_events
       WHERE engagement_id = $1
       ORDER BY occurred_at DESC`,
      [engagementId],
    );
    return rows;
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
}

export async function listActivityEventsForCampaign(client, campaignId) {
  const { rows } = await client.query(
    `SELECT * FROM activity_events
     WHERE campaign_id = $1
     ORDER BY occurred_at DESC`,
    [campaignId],
  );
  return rows;
}
