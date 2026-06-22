import { todayIstIso, addDaysToIsoDate, toDateInputValue } from './dates.js';
import { deliverableHasProof } from './deliverableLogging.js';

export const MODULE_ROW_LIMIT = 8;

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

function buildTodaysTasks(engagements, today, getDeliverables) {
  return engagements
    .filter((e) => !isTerminalStatus(e.conversation_status))
    .filter((e) => {
      const followUp = dashboardDate(e.next_follow_up_date);
      return followUp && followUp <= today;
    })
    .filter((e) => !(e.conversation_status === 'scheduled' && scheduledVisitDate(e) === today))
    .filter((e) => {
      if (e.conversation_status !== 'awaiting_final_deliverables') return true;
      const pending = getDeliverables(e.id).some(
        (d) => d.status !== 'posted' || !deliverableHasProof(d),
      );
      return !pending;
    })
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
      visitTime: e.visit_time ?? null,
      venue: e.visit_outlet ?? 'Visit',
      engagement: e,
    };
    })
    .sort((a, b) => String(a.visitTime ?? '').localeCompare(String(b.visitTime ?? '')));
}

function buildPendingDeliverables(engagements, getDeliverables, today) {
  const rows = [];
  for (const e of engagements) {
    if (isTerminalStatus(e.conversation_status)) continue;
    const deliverables = getDeliverables(e.id).filter((d) => d.status !== 'posted' || !deliverableHasProof(d));
    for (const d of deliverables) {
      const daysSinceVisit =
        e.visit_completed_date ? daysBetweenIso(e.visit_completed_date, today) : null;
      const atRisk = daysSinceVisit != null && daysSinceVisit >= 7;
      const dueDay = dashboardDate(d.due_date);
      const overdue = dueDay && dueDay < today;
      let situation = 'pending';
      let urgency = 'default';
      if (atRisk) {
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
        sortKey: atRisk ? 0 : overdue ? 1 : 2,
      });
    }
  }
  return rows.sort((a, b) => a.sortKey - b.sortKey || a.fullName.localeCompare(b.fullName));
}

function buildAtRisk(engagements, _getDeliverables, today) {
  const rows = [];
  for (const e of engagements) {
    if (isTerminalStatus(e.conversation_status)) continue;

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
      completed: c.completed_collaborations ?? 0,
      target: c.target_collaborations,
      pct: Math.round(Number(c.achievement_pct) || 0),
      health: c.campaign_health,
    }));
}

function countOverdue(engagements, getDeliverables, today) {
  let count = 0;
  for (const e of engagements) {
    if (isTerminalStatus(e.conversation_status)) continue;
    const followUp = dashboardDate(e.next_follow_up_date);
    if (followUp && followUp < today) count += 1;
    if (e.conversation_status === 'scheduled') {
      const visitDay = scheduledVisitDate(e);
      if (visitDay && visitDay < today) count += 1;
    }
    for (const d of getDeliverables(e.id)) {
      const dueDay = dashboardDate(d.due_date);
      if (d.status !== 'posted' && dueDay && dueDay < today) count += 1;
    }
  }
  return count;
}

function countUniqueActionEngagements(todaysTasks, todaysVisits, pendingDeliverables, atRisk) {
  const ids = new Set();
  for (const row of [...todaysTasks, ...todaysVisits, ...pendingDeliverables, ...atRisk]) {
    if (row.engagementId) ids.add(row.engagementId);
  }
  return ids.size;
}

/**
 * Build AM dashboard modules from engagements in the user's workspace.
 * API scopes: campaign_manager → assigned_manager only; admin/senior_manager → all.
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
  const atRisk = buildAtRisk(scoped, getDeliverables, today);
  const campaignTargets = buildCampaignTargets(campaigns, scoped);

  const actionCount = countUniqueActionEngagements(
    todaysTasks,
    todaysVisits,
    pendingDeliverables,
    atRisk,
  );

  return {
    today,
    todaysTasks,
    todaysVisits,
    pendingDeliverables,
    atRisk,
    campaignTargets,
    glance: {
      overdue: countOverdue(scoped, getDeliverables, today),
      visits: todaysVisits.length,
      pending: pendingDeliverables.length,
    },
    actionCount,
    allClear:
      todaysTasks.length === 0
      && todaysVisits.length === 0
      && pendingDeliverables.length === 0
      && atRisk.length === 0,
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
