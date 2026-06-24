import { ROLES } from './constants.mjs';

export const STAFF_ROLES = new Set([
  ROLES.CAMPAIGN_MANAGER,
  ROLES.SENIOR_MANAGER,
  ROLES.ADMIN,
]);

export function isBroadRole(role) {
  return role === ROLES.SENIOR_MANAGER || role === ROLES.ADMIN;
}

export function isAdmin(role) {
  return role === ROLES.ADMIN;
}

export function forbidUnlessAdmin(user) {
  if (!user?.id || !isAdmin(user.role)) {
    const err = new Error('Admin access required');
    err.status = 403;
    throw err;
  }
}

export function forbidUnlessSeniorOrAdmin(user) {
  if (!user?.id || !isBroadRole(user.role)) {
    const err = new Error('Senior Manager or Admin access required');
    err.status = 403;
    throw err;
  }
}

export function assertStaffUser(user) {
  if (!user?.id || !STAFF_ROLES.has(user.role)) {
    const err = new Error('Insufficient permissions');
    err.status = 403;
    throw err;
  }
}

/** Block drop_reason=didnt_deliver unless Senior Manager / Admin. */
export function assertCanApplyDidntDeliver(user, body) {
  if (body?.drop_reason === 'didnt_deliver') {
    forbidUnlessSeniorOrAdmin(user);
  }
}

export async function assertUserManagesCampaign(db, user, campaignId) {
  assertStaffUser(user);
  if (isBroadRole(user.role)) return;

  const { rows } = await db.query(
    `SELECT 1 FROM campaign_managers WHERE campaign_id = $1 AND user_id = $2 LIMIT 1`,
    [campaignId, user.id],
  );
  if (!rows[0]) {
    const err = new Error('Insufficient permissions for this campaign');
    err.status = 403;
    throw err;
  }
}

export async function getEngagementCampaignId(db, engagementId) {
  const { rows } = await db.query(
    `SELECT campaign_id FROM engagements WHERE id = $1`,
    [engagementId],
  );
  if (!rows[0]) {
    const err = new Error('Engagement not found');
    err.status = 404;
    throw err;
  }
  return rows[0].campaign_id;
}

export async function assertUserManagesEngagement(db, user, engagementId) {
  const campaignId = await getEngagementCampaignId(db, engagementId);
  await assertUserManagesCampaign(db, user, campaignId);
}

/** Campaign Manager must be in assigned_managers when creating a campaign. */
export function assertCreatorAssignedForCampaignManager(user, managerIds) {
  if (isBroadRole(user.role)) return;
  const ids = new Set((managerIds ?? []).map(String));
  if (!ids.has(String(user.id))) {
    const err = new Error('Campaign managers must include you');
    err.status = 403;
    throw err;
  }
}
