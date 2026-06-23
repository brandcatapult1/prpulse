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

function hasOpenDeliverables(engagementId, getDeliverables) {
  return getDeliverables(engagementId).some(
    (d) => d.status !== 'posted' || !deliverableHasProof(d),
  );
}

function isAwaitingDeliverableTask(engagement, getDeliverables) {
  return engagement.conversation_status === 'awaiting_final_deliverables'
    && hasOpenDeliverables(engagement.id, getDeliverables);
}

function buildTodaysTasks(engagements, today, getDeliverables) {
  return engagements
    .filter((e) => !isTerminalStatus(e.conversation_status))
    .filter((e) => !(e.conversation_status === 'scheduled' && scheduledVisitDate(e) === today))
    .filter((e) => {
      const followUp = dashboardDate(e.next_follow_up_date);
      const hasDueFollowUp = Boolean(followUp && followUp <= today);
      return hasDueFollowUp || isAwaitingDeliverableTask(e, getDeliverables);
    })
    .map((e) => {
      const followUp = dashboardDate(e.next_follow_up_date);
      const hasDueFollowUp = Boolean(followUp && followUp <= today);
      const awaitingDeliverables = isAwaitingDeliverableTask(e, getDeliverables);
      const overdue = hasDueFollowUp && followUp < today;
      const days = hasDueFollowUp ? daysBetweenIso(followUp, today) : 0;

      const qualifiers = [];
      if (hasDueFollowUp) {
        qualifiers.push(overdue ? 'follow_up_overdue' : 'follow_up_due_today');
      }
      if (awaitingDeliverables) qualifiers.push('awaiting_deliverables');

      let situation = 'awaiting deliverables';
      let urgency = 'default';
      if (hasDueFollowUp) {
        situation = overdue ? `overdue ${days}d` : 'due today';
        urgency = overdue ? 'danger' : 'default';
      } else {
        const pending = getDeliverables(e.id).filter(
          (d) => d.status !== 'posted' || !deliverableHasProof(d),
        );
        const earliestDue = pending
          .map((d) => dashboardDate(d.due_date))
          .filter(Boolean)
          .sort()[0];
        if (earliestDue && earliestDue < today) {
          situation = 'deliverables overdue';
          urgency = 'warning';
        }
      }

      const pendingDueDates = getDeliverables(e.id)
        .map((d) => dashboardDate(d.due_date))
        .filter(Boolean)
        .sort();
      const sortDate = hasDueFollowUp ? followUp : (pendingDueDates[0] ?? today);

      return {
        id: e.id,
        engagementId: e.id,
        contactId: e.contact_id,
        fullName: e.contact_name,
        initials: initials(e.contact_name),
        campaignName: e.campaign_name,
        situation,
        urgency,
        isOverdue: overdue,
        action: taskActionForEngagement(e),
        engagement: e,
        sortDate,
        qualifiers,
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

/**
 * Unique engagements with at least one open AM task: follow-up due today/overdue,
 * awaiting deliverables, pending deliverable, or at-risk flag.
 * Today's scheduled visits are excluded (reminder/support only).
 * Dedupes by engagement id (same creator in two campaigns = two engagements).
 */
export function countEngagementsNeedingAttention({ todaysTasks, pendingDeliverables, atRisk }) {
  return buildAttentionBreakdown({ todaysTasks, pendingDeliverables, atRisk }).total;
}

/**
 * Audit helper: exact engagement set behind the headline, grouped by qualification.
 */
export function buildAttentionBreakdown({ todaysTasks, pendingDeliverables, atRisk }) {
  const followUpDueToday = [];
  const followUpOverdue = [];
  const awaitingDeliverables = [];

  for (const row of todaysTasks ?? []) {
    const entry = {
      engagementId: row.engagementId,
      contactId: row.contactId ?? null,
      contactName: row.fullName,
      campaignName: row.campaignName,
      followUpDate: row.sortDate,
    };
    const qualifiers = row.qualifiers ?? [];
    if (qualifiers.includes('follow_up_due_today')) followUpDueToday.push(entry);
    if (qualifiers.includes('follow_up_overdue')) followUpOverdue.push(entry);
    if (qualifiers.includes('awaiting_deliverables')) {
      awaitingDeliverables.push({
        ...entry,
        openDeliverableCount: (pendingDeliverables ?? []).filter(
          (d) => d.engagementId === row.engagementId,
        ).length,
      });
    }
  }

  const pendingDeliverableEngagements = [];
  const pendingByEngagement = new Map();
  for (const row of pendingDeliverables ?? []) {
    if (!pendingByEngagement.has(row.engagementId)) {
      const entry = {
        engagementId: row.engagementId,
        contactId: row.contactId ?? null,
        contactName: row.fullName,
        campaignName: row.campaignName,
        deliverableCount: 0,
      };
      pendingByEngagement.set(row.engagementId, entry);
      pendingDeliverableEngagements.push(entry);
    }
    pendingByEngagement.get(row.engagementId).deliverableCount += 1;
  }

  const atRiskEngagements = [];
  const atRiskByEngagement = new Map();
  for (const row of atRisk ?? []) {
    if (!atRiskByEngagement.has(row.engagementId)) {
      const entry = {
        engagementId: row.engagementId,
        contactId: row.contactId ?? null,
        contactName: row.fullName,
        campaignName: row.campaignName,
        flags: [],
      };
      atRiskByEngagement.set(row.engagementId, entry);
      atRiskEngagements.push(entry);
    }
    atRiskByEngagement.get(row.engagementId).flags.push(row.flag);
  }

  const allIds = new Set([
    ...(todaysTasks ?? []).map((row) => row.engagementId).filter(Boolean),
    ...pendingByEngagement.keys(),
    ...atRiskByEngagement.keys(),
  ]);

  const perEngagement = [...allIds].map((id) => {
    const reasons = [];
    if (followUpDueToday.some((e) => e.engagementId === id)) reasons.push('follow_up_due_today');
    if (followUpOverdue.some((e) => e.engagementId === id)) reasons.push('follow_up_overdue');
    if (awaitingDeliverables.some((e) => e.engagementId === id)) reasons.push('awaiting_deliverables');
    if (pendingByEngagement.has(id)) reasons.push('pending_deliverable');
    if (atRiskByEngagement.has(id)) reasons.push('at_risk');

    const meta =
      followUpDueToday.find((e) => e.engagementId === id)
      ?? followUpOverdue.find((e) => e.engagementId === id)
      ?? pendingByEngagement.get(id)
      ?? atRiskByEngagement.get(id);

    return {
      engagementId: id,
      contactId: meta?.contactId ?? null,
      contactName: meta?.contactName ?? '?',
      campaignName: meta?.campaignName ?? '?',
      reasons,
    };
  }).sort((a, b) =>
    a.contactName.localeCompare(b.contactName)
    || a.campaignName.localeCompare(b.campaignName));

  return {
    total: allIds.size,
    followUpDueToday,
    followUpOverdue,
    awaitingDeliverables,
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
      /** AM tasks: follow-ups due/overdue plus awaiting-deliverable follow-ups. */
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
