import { pool } from '../db.mjs';
import {
  assertCanApplyDidntDeliver,
  assertStaffUser,
  assertUserManagesCampaign,
  assertUserManagesEngagement,
  forbidUnlessAdmin,
  forbidUnlessSeniorOrAdmin,
} from '../lib/permissions.mjs';

export function requireAdmin(req, res, next) {
  try {
    forbidUnlessAdmin(req.user);
    next();
  } catch (err) {
    res.status(err.status ?? 403).json({ error: err.message });
  }
}

export function requireSeniorOrAdmin(req, res, next) {
  try {
    forbidUnlessSeniorOrAdmin(req.user);
    next();
  } catch (err) {
    res.status(err.status ?? 403).json({ error: err.message });
  }
}

export function requireStaffRole(req, res, next) {
  try {
    assertStaffUser(req.user);
    next();
  } catch (err) {
    res.status(err.status ?? 403).json({ error: err.message });
  }
}

export function requireCampaignWriteAccess(param = 'id') {
  return async (req, res, next) => {
    try {
      await assertUserManagesCampaign(pool, req.user, req.params[param]);
      next();
    } catch (err) {
      res.status(err.status ?? 403).json({ error: err.message });
    }
  };
}

export function requireEngagementWriteAccess(param = 'id') {
  return async (req, res, next) => {
    try {
      await assertUserManagesEngagement(pool, req.user, req.params[param]);
      next();
    } catch (err) {
      res.status(err.status ?? 403).json({ error: err.message });
    }
  };
}

export function requireDidntDeliverPermission(req, res, next) {
  try {
    assertCanApplyDidntDeliver(req.user, req.body ?? {});
    next();
  } catch (err) {
    res.status(err.status ?? 403).json({ error: err.message });
  }
}
