import { todayIstIso, addDaysToIsoDate, toDateInputValue } from './dates.js';
import { deliverableHasProof } from './deliverableLogging.js';
import {
  formatVisitTimeForDisplay,
  resolveEngagementOutletName,
} from './visitFields.js';
import { isTerminalEngagement } from './contactProfile.js';

export const MODULE_ROW_LIMIT = 8;

const DASHBOARD_MODULE = {
  TASKS: 'tasks',
  PENDING_DELIVERABLES: 'pending_deliverables',
  AT_RISK: 'at_risk',
};

/** Normalize API / DB date values to YYYY-MM-DD (IST calendar for Date objects). */
function dashboardDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(value);
  }
  const normalized = toDateInputValue(value);
  return normalized || null;
}

/** Scheduled visit day — mirrors campaign board card logic (visit_date, else follow-up). */
function scheduledVisitDate(engagement) {
  return dashboardDate(engagement.visit_date ?? engagement.next_follow_up_date);
}

const TERMINAL_STATUSES = new Set([
  'collaboration_complete',
  'dropped_profile_rejected',
  'dropped_not_interested',
  'dropped_terms_disagreement',
  'dropped',
]);

const OWNER_NAME_TO_ID = {
  'Priya Sharma': '1',
  'Ankit Rao': '2',
  'Rhea Kapoor': '3',
};

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status) || status?.startsWith('dropped_');
}

export function resolveAssignedManagerId(engagement) {
  if (engagement?.assigned_manager != null) return String(engagement.assigned_manager);
  return OWNER_NAME_TO_ID[engagement?.owner_name] ?? null;
}

export function daysBetweenIso(fromIso, toIso) {
  const from = dashboardDate(fromIso);
  const to = dashboardDate(toIso);
  if (!from || !to) return 0;
  const fromD = new Date(`${from}T12:00:00`);
  const toD = new Date(`${to}T12:00:00`);
  return Math.round((toD - fromD) / 86400000);
}

function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function taskActionForEngagement(engagement) {
  if (engagement.conversation_status === 'scheduled') return 'visit_done';
  if (engagement.conversation_status === 'awaiting_final_deliverables') return 'log_deliverable';
  return 'log_contact';
}

function hasOpenDeliverables(engagementId, getDeliverables) {
  return getDeliverables(engagementId).some(
    (d) => d.status !== 'posted' || !deliverableHasProof(d),
  );
}

function qualifiesAtRisk(engagement, today) {
  if (isTerminalEngagement(engagement.conversation_status)) return false;
  if (engagement.no_reply_count >= 3 || engagement.conversation_status === 'no_response') {
    return true;
  }
  if (engagement.conversation_status === 'scheduled') {
    const visitDay = scheduledVisitDate(engagement);
    if (visitDay && visitDay < today) return true;
  }
  const lastActivity = dashboardDate(engagement.last_contact_date ?? engagement.initial_contact_date);
  const stalledDays = lastActivity ? daysBetweenIso(lastActivity, today) : null;
  return stalledDays != null
    && stalledDays >= 10
    && !['no_response'].includes(engagement.conversation_status);
}

function qualifiesTodaysTask(engagement, today, getDeliverables) {
  if (isTerminalStatus(engagement.conversation_status)) return false;
  if (hasOpenDeliverables(engagement.id, getDeliverables)) return false;

  const visitToday =
    engagement.conversation_status === 'scheduled' && scheduledVisitDate(engagement) === today;
  if (visitToday) return false;

  const followUp = dashboardDate(engagement.next_follow_up_date);
  if (!followUp) return false;
  if (followUp > today) return false;
  if (followUp === today) return true;

  const lastContact = dashboardDate(engagement.last_contact_date);
  return !lastContact || lastContact < followUp;
}

function qualifiesPendingDeliverables(engagement, getDeliverables) {
  if (isTerminalStatus(engagement.conversation_status)) return false;
  return hasOpenDeliverables(engagement.id, getDeliverables);
}

function buildTodaysTasks(engagements, today, getDeliverables) {
  return engagements
    .filter((e) => qualifiesTodaysTask(e, today, getDeliverables))
    .map((e) => {
      const followUp = dashboardDate(e.next_follow_up_date);
      const overdue = followUp < today;
      const days = daysBetweenIso(followUp, today);
      return {
        id: e.id,
        engagementId: e.id,
        contactId: e.contact_id,
        fullName: e.contact_name,
        initials: initials(e.contact_name),
        campaignName: e.campaign_name,
        situation: overdue ? `overdue ${days}d` : 'due today',
        urgency: overdue ? 'danger' : 'default',
        isOverdue: overdue,
        action: taskActionForEngagement(e),
        engagement: e,
        sortDate: followUp,
        moduleReason: overdue ? 'follow_up_overdue' : 'follow_up_due_today',
      };
    })
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return a.sortDate.localeCompare(b.sortDate);
    });
}

function buildTodaysVisits(engagements, today) {
  return engagements
    .filter((e) => e.conversation_status === 'scheduled' && scheduledVisitDate(e) === today)
    .map((e) => {
      const visitDate = scheduledVisitDate(e);
      return {
        id: e.id,
        engagementId: e.id,
        contactId: e.contact_id,
        fullName: e.contact_name,
        initials: initials(e.contact_name),
        campaignName: e.campaign_name,
        visitDate,
        visitTime: formatVisitTimeForDisplay(e.visit_time),
        venue: resolveEngagementOutletName(e) ?? 'Visit',
        engagement: e,
      };
    })
    .sort((a, b) => String(a.visitTime ?? '').localeCompare(String(b.visitTime ?? '')));
}

function buildPendingDeliverables(engagements, getDeliverables, today) {
  const rows = [];
  for (const e of engagements) {
    if (!qualifiesPendingDeliverables(e, getDeliverables)) continue;
    const deliverables = getDeliverables(e.id).filter(
      (d) => d.status !== 'posted' || !deliverableHasProof(d),
    );
    for (const d of deliverables) {
      const daysSinceVisit =
        e.visit_completed_date ? daysBetweenIso(e.visit_completed_date, today) : null;
      const deliverableAtRisk = daysSinceVisit != null && daysSinceVisit >= 7;
      const dueDay = dashboardDate(d.due_date);
      const overdue = dueDay && dueDay < today;
      let situation = 'pending';
      let urgency = 'default';
      if (deliverableAtRisk) {
        situation = `at risk ${daysSinceVisit}d`;
        urgency = 'warning';
      } else if (overdue) {
        situation = 'overdue';
        urgency = 'warning';
      }
      rows.push({
        id: d.id,
        deliverableId: d.id,
        engagementId: e.id,
        contactId: e.contact_id,
        fullName: e.contact_name,
        initials: initials(e.contact_name),
        campaignName: e.campaign_name,
        deliverableType: d.deliverable_type,
        situation,
        urgency,
        deliverable: d,
        engagement: e,
        sortKey: deliverableAtRisk ? 0 : overdue ? 1 : 2,
      });
    }
  }
  return rows.sort((a, b) => a.sortKey - b.sortKey || a.fullName.localeCompare(b.fullName));
}

function buildAtRisk(engagements, today) {
  const rows = [];
  for (const e of engagements) {
    if (!qualifiesAtRisk(e, today)) continue;

    if (e.no_reply_count >= 3 || e.conversation_status === 'no_response') {
      rows.push({
        id: `${e.id}-no-response`,
        engagementId: e.id,
        contactId: e.contact_id,
        fullName: e.contact_name,
        initials: initials(e.contact_name),
        campaignName: e.campaign_name,
        flag: 'no response',
        flagDetail: e.no_reply_count >= 3 ? `${e.no_reply_count}x` : null,
        action: 'log_contact',
        engagement: e,
        sortKey: 0,
      });
    }

    if (e.conversation_status === 'scheduled') {
      const visitDay = scheduledVisitDate(e);
      if (visitDay && visitDay < today) {
        const days = daysBetweenIso(visitDay, today);
        rows.push({
          id: `${e.id}-visit-overdue`,
          engagementId: e.id,
          contactId: e.contact_id,
          fullName: e.contact_name,
          initials: initials(e.contact_name),
          campaignName: e.campaign_name,
          flag: 'visit overdue',
          flagDetail: `${days}d`,
          action: 'visit_done',
          engagement: e,
          sortKey: 1,
        });
      }
    }

    const lastActivity = dashboardDate(e.last_contact_date ?? e.initial_contact_date);
    const stalledDays = lastActivity ? daysBetweenIso(lastActivity, today) : null;
    const isStalled =
      stalledDays != null
      && stalledDays >= 10
      && !['no_response'].includes(e.conversation_status);
    if (isStalled) {
      rows.push({
        id: `${e.id}-stalled`,
        engagementId: e.id,
        contactId: e.contact_id,
        fullName: e.contact_name,
        initials: initials(e.contact_name),
        campaignName: e.campaign_name,
        flag: 'stalled',
        flagDetail: `${stalledDays}d`,
        action: 'log_contact',
        engagement: e,
        sortKey: 2,
      });
    }
  }
  return rows.sort((a, b) => a.sortKey - b.sortKey || a.fullName.localeCompare(b.fullName));
}

function buildCampaignTargets(campaigns, engagements) {
  const campaignIds = new Set(engagements.map((e) => e.campaign_id));
  return campaigns
    .filter((c) => c.status === 'active' && campaignIds.has(c.id))
    .map((c) => ({
      id: c.id,
      campaignName: c.campaign_name,
      completed: Number(c.completed_collaborations) || 0,
      target: c.target_collaborations != null ? Number(c.target_collaborations) : null,
      pct: Math.round(Number(c.achievement_pct) || 0),
      health: c.campaign_health,
    }));
}

function uniqueEngagementIds(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (row.engagementId) ids.add(row.engagementId);
  }
  return ids;
}

/**
 * Unique engagements shown across Today's tasks, Pending deliverables, and At risk.
 * Visits are excluded. Dedupes by engagementId (same creator, two campaigns = two rows).
 */
export function countEngagementsNeedingAttention({ todaysTasks, pendingDeliverables, atRisk }) {
  return buildAttentionBreakdown({ todaysTasks, pendingDeliverables, atRisk }).total;
}

/**
 * Audit helper: engagement set behind the headline. An engagement may appear in
 * multiple modules (e.g. at-risk + follow-up task); headline dedupes by engagementId.
 */
export function buildAttentionBreakdown({ todaysTasks, pendingDeliverables, atRisk }) {
  const followUpDueToday = [];
  const followUpOverdue = [];
  const byEngagement = new Map();

  function touch(engagementId, seed) {
    if (!byEngagement.has(engagementId)) {
      byEngagement.set(engagementId, {
        engagementId,
        contactId: seed.contactId ?? null,
        contactName: seed.contactName ?? seed.fullName ?? '?',
        campaignName: seed.campaignName ?? '?',
        modules: [],
        reasons: [],
        flags: [],
        deliverableCount: 0,
      });
    }
    return byEngagement.get(engagementId);
  }

  function addModule(entry, module) {
    if (!entry.modules.includes(module)) entry.modules.push(module);
  }

  for (const row of todaysTasks ?? []) {
    const entry = touch(row.engagementId, row);
    addModule(entry, DASHBOARD_MODULE.TASKS);
    if (row.moduleReason === 'follow_up_due_today') {
      followUpDueToday.push({ ...entry, reason: row.moduleReason });
      if (!entry.reasons.includes('follow_up_due_today')) entry.reasons.push('follow_up_due_today');
    }
    if (row.moduleReason === 'follow_up_overdue') {
      followUpOverdue.push({ ...entry, reason: row.moduleReason });
      if (!entry.reasons.includes('follow_up_overdue')) entry.reasons.push('follow_up_overdue');
    }
  }

  const pendingDeliverableEngagements = [];
  const pendingByEngagement = new Map();
  for (const row of pendingDeliverables ?? []) {
    const entry = touch(row.engagementId, row);
    addModule(entry, DASHBOARD_MODULE.PENDING_DELIVERABLES);
    if (!entry.reasons.includes('pending_deliverable')) entry.reasons.push('pending_deliverable');
    entry.deliverableCount += 1;

    if (!pendingByEngagement.has(row.engagementId)) {
      pendingByEngagement.set(row.engagementId, {
        engagementId: row.engagementId,
        contactId: row.contactId ?? null,
        contactName: row.fullName,
        campaignName: row.campaignName,
        module: DASHBOARD_MODULE.PENDING_DELIVERABLES,
        reason: 'pending_deliverable',
        deliverableCount: 0,
      });
      pendingDeliverableEngagements.push(pendingByEngagement.get(row.engagementId));
    }
    pendingByEngagement.get(row.engagementId).deliverableCount += 1;
  }

  const atRiskEngagements = [];
  const atRiskByEngagement = new Map();
  for (const row of atRisk ?? []) {
    const entry = touch(row.engagementId, row);
    addModule(entry, DASHBOARD_MODULE.AT_RISK);
    const flagReason = `at_risk:${row.flag}`;
    if (!entry.reasons.includes(flagReason)) entry.reasons.push(flagReason);
    if (!entry.flags.includes(row.flag)) entry.flags.push(row.flag);

    if (!atRiskByEngagement.has(row.engagementId)) {
      atRiskByEngagement.set(row.engagementId, {
        engagementId: row.engagementId,
        contactId: row.contactId ?? null,
        contactName: row.fullName,
        campaignName: row.campaignName,
        module: DASHBOARD_MODULE.AT_RISK,
        reason: 'at_risk',
        flags: [],
      });
      atRiskEngagements.push(atRiskByEngagement.get(row.engagementId));
    }
    atRiskByEngagement.get(row.engagementId).flags.push(row.flag);
  }

  const allIds = new Set(byEngagement.keys());

  const perEngagement = [...byEngagement.values()]
    .map((entry) => ({
      engagementId: entry.engagementId,
      contactId: entry.contactId,
      contactName: entry.contactName,
      campaignName: entry.campaignName,
      modules: entry.modules.join(', '),
      reasons: entry.reasons.join('; '),
      flags: entry.flags.join(', '),
      deliverableCount: entry.deliverableCount || '',
    }))
    .sort((a, b) =>
      a.contactName.localeCompare(b.contactName)
      || a.campaignName.localeCompare(b.campaignName));

  return {
    total: allIds.size,
    followUpDueToday,
    followUpOverdue,
    pendingDeliverableEngagements,
    atRiskEngagements,
    perEngagement,
  };
}

/** @deprecated Use countEngagementsNeedingAttention — visits are not part of attention count. */
export function countDashboardActionEngagements(modules) {
  return countEngagementsNeedingAttention(modules);
}

/**
 * Build AM dashboard modules from engagements in the user's workspace.
 * API scopes: campaign_manager → assigned_manager only; admin/senior_manager without
 * scope_user_id → all active work; with scope_user_id → that person's assigned work.
 */
export function buildDashboardFromEngagements({
  engagements,
  campaigns,
  getDeliverables,
  today = todayIstIso(),
}) {
  const scoped = engagements ?? [];

  const todaysTasks = buildTodaysTasks(scoped, today, getDeliverables);
  const todaysVisits = buildTodaysVisits(scoped, today);
  const pendingDeliverables = buildPendingDeliverables(scoped, getDeliverables, today);
  const atRisk = buildAtRisk(scoped, today);
  const campaignTargets = buildCampaignTargets(campaigns, scoped);

  const actionCount = countEngagementsNeedingAttention({
    todaysTasks,
    pendingDeliverables,
    atRisk,
  });
  const attentionBreakdown = buildAttentionBreakdown({
    todaysTasks,
    pendingDeliverables,
    atRisk,
  });

  return {
    today,
    todaysTasks,
    todaysVisits,
    pendingDeliverables,
    atRisk,
    campaignTargets,
    attentionBreakdown,
    glance: {
      /** Follow-ups due today or overdue — contact/follow-up actions only. */
      tasks: todaysTasks.length,
      /** Open deliverable rows awaiting proof/post. */
      deliverables: pendingDeliverables.length,
      /** Open at-risk flags (no-response, visit-overdue, stalled). */
      atRisk: atRisk.length,
      /** Today's scheduled visits — reminders only, excluded from attention count. */
      visits: todaysVisits.length,
    },
    actionCount,
    allClear:
      actionCount === 0
      && todaysVisits.length === 0,
  };
}

/** Greeting for IST hour. */
export function dashboardGreeting(firstName) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${salutation}, ${firstName}`;
}

/** Long date for hero, e.g. "Tuesday, 21 June". */
export function dashboardDateLabel(today = todayIstIso()) {
  const d = new Date(`${today}T12:00:00`);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function firstPendingDeliverable(engagementId, getDeliverables) {
  return getDeliverables(engagementId).find(
    (d) => d.status !== 'posted' || !deliverableHasProof(d),
  ) ?? null;
}

export { addDaysToIsoDate, initials };
