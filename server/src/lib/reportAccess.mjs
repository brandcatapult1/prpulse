import { assertStaffUser, isAdmin } from './permissions.mjs';

/** Campaign ids the requester may view in Reports (server-enforced). */
export async function listAccessibleCampaignIds(pool, user) {
  assertStaffUser(user);

  if (isAdmin(user.role)) {
    const { rows } = await pool.query(
      `SELECT id FROM campaigns WHERE status <> 'archived'`,
    );
    return rows.map((r) => r.id);
  }

  if (user.role === 'senior_manager') {
    const { rows } = await pool.query(
      `SELECT DISTINCT cam.id
       FROM campaigns cam
       JOIN campaign_managers cm ON cm.campaign_id = cam.id
       LEFT JOIN users u ON u.id = cm.user_id
       WHERE cam.status <> 'archived'
         AND (cm.user_id = $1 OR u.reports_to = $1)`,
      [user.id],
    );
    return rows.map((r) => r.id);
  }

  const { rows } = await pool.query(
    `SELECT cam.id
     FROM campaigns cam
     JOIN campaign_managers cm ON cm.campaign_id = cam.id
     WHERE cam.status <> 'archived' AND cm.user_id = $1`,
    [user.id],
  );
  return rows.map((r) => r.id);
}

export async function assertCanViewCampaignReport(pool, user, campaignId) {
  assertStaffUser(user);
  if (isAdmin(user.role)) return;

  const ids = await listAccessibleCampaignIds(pool, user);
  if (!ids.includes(campaignId)) {
    const err = new Error('Insufficient permissions for this campaign report');
    err.status = 403;
    throw err;
  }
}

export async function assertCanViewCycleReport(pool, user, cycleId) {
  const { rows } = await pool.query(
    `SELECT campaign_id FROM campaign_cycles WHERE id = $1`,
    [cycleId],
  );
  if (!rows[0]) {
    const err = new Error('Cycle not found');
    err.status = 404;
    throw err;
  }
  await assertCanViewCampaignReport(pool, user, rows[0].campaign_id);
  return rows[0].campaign_id;
}
