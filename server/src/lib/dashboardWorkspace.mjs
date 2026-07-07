import { isBroadRole } from './permissions.mjs';
import { loadDeliverablesByEngagementIds } from './deliverableRows.mjs';
import {
  ENGAGEMENT_OUTLET_JOINS,
  ENGAGEMENT_OUTLET_SELECT,
} from './outlets.mjs';

function mapCampaignRow(row) {
  return {
    ...row,
    completed_collaborations:
      row.completed_collaborations != null ? Number(row.completed_collaborations) : 0,
    target_collaborations:
      row.target_collaborations != null ? Number(row.target_collaborations) : null,
    achievement_pct: row.achievement_pct != null ? Number(row.achievement_pct) : null,
  };
}

/**
 * Load dashboard workspace engagements, campaigns, and deliverables.
 * @param {string|null} scopeUserId When set, scopes to that user's assigned work (CM-style).
 * @param {string} requesterId Current user — used for legacy CM scope when scopeUserId is omitted.
 * @param {string} requesterRole Used for legacy broad scope when scopeUserId is omitted.
 */
export async function loadDashboardWorkspace(pool, scopeUserId, requesterId, requesterRole) {
  const personalScope = Boolean(scopeUserId);
  const broadLegacy = !personalScope && isBroadRole(requesterRole);
  const ownerId = scopeUserId ?? requesterId;

  const engagementScopeSql = personalScope || !broadLegacy
    ? `cam.status <> 'archived' AND e.assigned_manager = $1`
    : `cam.status <> 'archived'`;

  const campaignScopeSql = personalScope || !broadLegacy
    ? `cam.status = 'active' AND EXISTS (
         SELECT 1 FROM campaign_managers cm
         WHERE cm.campaign_id = cam.id AND cm.user_id = $1
       )`
    : `cam.status = 'active'`;

  const engagementParams = personalScope || !broadLegacy ? [ownerId] : [];
  const campaignParams = personalScope || !broadLegacy ? [ownerId] : [];

  const [engagementsRes, campaignsRes] = await Promise.all([
    pool.query(
      `SELECT e.*, c.full_name AS contact_name, u.full_name AS owner_name,
              cam.campaign_name, cam.status AS campaign_status, ${ENGAGEMENT_OUTLET_SELECT}
       FROM engagements e
       JOIN contacts c ON c.id = e.contact_id
       JOIN users u ON u.id = e.assigned_manager
       JOIN campaigns cam ON cam.id = e.campaign_id
       ${ENGAGEMENT_OUTLET_JOINS}
       WHERE ${engagementScopeSql}
       ORDER BY e.updated_at DESC`,
      engagementParams,
    ),
    pool.query(
      `SELECT cam.*, b.brand_name
       FROM campaigns cam
       JOIN brands b ON b.id = cam.brand_id
       WHERE ${campaignScopeSql}
       ORDER BY cam.updated_at DESC`,
      campaignParams,
    ),
  ]);

  const engagements = engagementsRes.rows;
  const engagementIds = engagements.map((eng) => eng.id);

  const client = await pool.connect();
  let deliverablesByEngagement;
  try {
    deliverablesByEngagement = await loadDeliverablesByEngagementIds(client, engagementIds);
  } finally {
    client.release();
  }

  return {
    scope_user_id: scopeUserId ?? null,
    engagements,
    campaigns: campaignsRes.rows.map(mapCampaignRow),
    deliverablesByEngagement,
  };
}
