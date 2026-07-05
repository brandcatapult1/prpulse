/** Server-side activity event writer — actor always from req.user, never request body. */

import {
  formatDeliverableType,
  formatEngagementStatus,
  formatLegacyAction,
  formatLegacyStatusChange,
  formatStageTransition,
  formatTimelineNotes,
} from './activityTimelineLabels.mjs';

export const ACTIVITY_ACTION = {
  STAGE_CHANGED: 'stage_changed',
  FIRST_OUTREACH: 'first_outreach',
  CONTACT_REPLIED: 'contact_replied',
  CONTACT_NO_REPLY: 'contact_no_reply',
  DELIVERABLE_POSTED: 'deliverable_posted',
  DELIVERABLE_DEMOTED: 'deliverable_demoted',
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

const ACTION_LABELS = {
  [ACTIVITY_ACTION.STAGE_CHANGED]: 'Status changed',
  [ACTIVITY_ACTION.FIRST_OUTREACH]: 'First outreach logged',
  [ACTIVITY_ACTION.CONTACT_REPLIED]: 'Contact logged — replied',
  [ACTIVITY_ACTION.CONTACT_NO_REPLY]: 'Contact logged — no reply',
  [ACTIVITY_ACTION.DELIVERABLE_POSTED]: 'Deliverable posted',
  [ACTIVITY_ACTION.DELIVERABLE_DEMOTED]: 'Deliverable moved off Posted',
  [ACTIVITY_ACTION.REJECT]: 'Profile rejected',
  [ACTIVITY_ACTION.REOPEN]: 'Engagement reopened',
  [ACTIVITY_ACTION.DIDNT_DELIVER]: "Didn't deliver",
  [ACTIVITY_ACTION.BLACKLIST_SET]: 'Contact blacklisted',
  [ACTIVITY_ACTION.BLACKLIST_CLEARED]: 'Blacklist cleared',
  [ACTIVITY_ACTION.FEEDBACK_LOGGED]: 'Feedback logged',
  contact_tags_added: 'Contact tag added',
  visit_reminded: 'Visit reminder sent',
};

function formatStatusChangeForRow(row, details) {
  if (row.action === ACTIVITY_ACTION.STAGE_CHANGED && details.toStage) {
    return formatStageTransition(details.fromStage, details.toStage, details);
  }
  if (row.action === ACTIVITY_ACTION.FIRST_OUTREACH) {
    return formatEngagementStatus('in_conversation');
  }
  if (row.action === ACTIVITY_ACTION.REOPEN && details.toStage) {
    return formatEngagementStatus(details.toStage);
  }
  if (row.action === ACTIVITY_ACTION.DIDNT_DELIVER) {
    return formatEngagementStatus('dropped', { dropReason: 'didnt_deliver' });
  }
  if (row.action === ACTIVITY_ACTION.DELIVERABLE_POSTED && details.deliverableType) {
    const label = formatDeliverableType(details.deliverableType);
    const qty = details.quantity > 1 ? ` ×${details.quantity}` : '';
    return label ? `${label}${qty}` : null;
  }
  if (row.action === ACTIVITY_ACTION.DELIVERABLE_DEMOTED && details.deliverableType) {
    const label = formatDeliverableType(details.deliverableType);
    return label ? `${label} → Pending` : 'Pending';
  }
  if (row.action === 'contact_tags_added' && details.tag_name) {
    return details.tag_name;
  }
  return null;
}

export function activityRowToTimelineEntry(row) {
  const details = row.details ?? {};
  const statusChange = formatStatusChangeForRow(row, details);

  return {
    id: row.id,
    occurred_at: row.occurred_at,
    user_name: row.actor_name,
    user_role: row.actor_role ?? null,
    action: ACTION_LABELS[row.action] ?? formatLegacyAction(row.action),
    status_change: statusChange,
    notes: formatTimelineNotes(row, details, { statusChange }),
  };
}

export function legacyTimelineRowToEntry(row) {
  return {
    id: row.id,
    occurred_at: row.occurred_at,
    user_name: row.user_name ?? 'System',
    action: formatLegacyAction(row.action),
    status_change: row.status_change ? formatLegacyStatusChange(row.status_change) : null,
    notes: row.notes ?? null,
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
