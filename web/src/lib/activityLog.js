import { ACTIVITY_ACTION } from './activityEvents.js';
import { getActivityActor } from './activityActor.js';
import { appendActivityEvent, getActivityEvents } from './demoStore.js';
import { formatDate, formatStatus } from './format.jsx';

const pendingStageByEngagement = new Map();

function newEventId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

/** Called from transitionStage on every successful stage move (before commit). */
export function queueStageTransitionActivity(event) {
  if (!event?.engagementId) return;
  pendingStageByEngagement.set(event.engagementId, event);
}

export function consumePendingStageActivity(engagementId) {
  const event = pendingStageByEngagement.get(engagementId) ?? null;
  pendingStageByEngagement.delete(engagementId);
  return event;
}

/**
 * Append a single activity event. Actor fields are always taken from the trusted session user.
 */
export function recordActivityEvent({ campaignId, engagementId, action, details = {} }) {
  const actor = getActivityActor();
  if (!actor?.id) {
    console.warn('[activity] Skipped event — no authenticated actor', action);
    return null;
  }
  if (!campaignId || !action) return null;

  const event = {
    id: newEventId(),
    campaignId,
    engagementId: engagementId ?? null,
    actorUserId: actor.id,
    actorName: actor.full_name,
    actorRole: actor.role,
    action,
    details,
    timestamp: nowIso(),
  };

  appendActivityEvent(event);
  return event;
}

function inferDiscreteEngagementEvents(before, patch) {
  const events = [];

  if (patch.initial_contact_date && !before.initial_contact_date) {
    events.push({
      action: ACTIVITY_ACTION.FIRST_OUTREACH,
      details: {
        contactDate: patch.initial_contact_date,
        followUpDate: patch.next_follow_up_date ?? null,
      },
    });
  }

  if (patch.last_contact_log_type === 'no_reply_attempt') {
    events.push({
      action: ACTIVITY_ACTION.CONTACT_NO_REPLY,
      details: {
        retryDate: patch.next_follow_up_date ?? null,
        noReplyCount: patch.no_reply_count ?? null,
        contactDate: patch.last_contact_date ?? null,
      },
    });
  }

  if (
    patch.last_contact_log_type === 'conversation'
    && !patch.initial_contact_date
    && patch.conversation_status === undefined
  ) {
    events.push({
      action: ACTIVITY_ACTION.CONTACT_REPLIED,
      details: {
        contactDate: patch.last_contact_date ?? null,
      },
    });
  }

  if (
    patch.conversation_status === 'dropped_profile_rejected'
    && before.conversation_status === 'not_contacted'
  ) {
    events.push({
      action: ACTIVITY_ACTION.REJECT,
      details: { reason: 'profile_rejected' },
    });
  }

  if (
    before.conversation_status?.startsWith('dropped_')
    && patch.conversation_status
    && !patch.conversation_status.startsWith('dropped_')
  ) {
    events.push({
      action: ACTIVITY_ACTION.REOPEN,
      details: {
        fromDroppedStatus: before.conversation_status,
        toStage: patch.conversation_status,
        priorDroppedFrom: before.dropped_from ?? before.drop_failed_at_stage ?? null,
      },
    });
  }

  return events;
}

function stageChangedEvent(before, patch) {
  const fromStage = before.conversation_status;
  const toStage = patch.conversation_status;
  if (!toStage || fromStage === toStage) return null;
  return {
    action: ACTIVITY_ACTION.STAGE_CHANGED,
    details: {
      fromStage,
      toStage,
      reason: toStage.startsWith('dropped_') ? toStage : null,
      droppedFrom: patch.dropped_from ?? null,
    },
  };
}

/** Record all activity inferred from an engagement field patch (after save). */
export function recordEngagementPatchActivity(engagementId, before, patch) {
  if (!before?.campaign_id) return [];

  const events = [];
  const pending = consumePendingStageActivity(engagementId);
  if (pending) {
    events.push(pending);
  } else {
    const stageEvt = stageChangedEvent(before, patch);
    if (stageEvt) events.push(stageEvt);
  }

  for (const evt of inferDiscreteEngagementEvents(before, patch)) {
    events.push(evt);
  }

  const recorded = [];
  for (const evt of events) {
    const row = recordActivityEvent({
      campaignId: before.campaign_id,
      engagementId,
      action: evt.action,
      details: evt.details ?? {},
    });
    if (row) recorded.push(row);
  }
  return recorded;
}

export function recordDeliverablesPatchActivity(engagementId, campaignId, beforeList, afterList) {
  const recorded = [];
  for (const after of afterList) {
    const before = beforeList.find((d) => d.id === after.id);
    if (before?.status === 'posted' || after.status !== 'posted') continue;

    const row = recordActivityEvent({
      campaignId,
      engagementId,
      action: ACTIVITY_ACTION.DELIVERABLE_POSTED,
      details: {
        deliverableId: after.id,
        deliverableType: after.deliverable_type,
        quantity: after.quantity,
        contentLink: after.content_link ?? null,
        screenshotCount: after.screenshots?.length ?? 0,
        publishedDate: after.published_date ?? null,
      },
    });
    if (row) recorded.push(row);
  }
  return recorded;
}

export function recordDidntDeliverActivity(engagementId, campaignId, { engagementPatch, blacklist, contactId }) {
  const recorded = [];
  const didntDeliver = recordActivityEvent({
    campaignId,
    engagementId,
    action: ACTIVITY_ACTION.DIDNT_DELIVER,
    details: {
      droppedFrom: engagementPatch.dropped_from ?? null,
      toStage: engagementPatch.conversation_status,
    },
  });
  if (didntDeliver) recorded.push(didntDeliver);

  if (blacklist && contactId) {
    const bl = recordActivityEvent({
      campaignId,
      engagementId,
      action: ACTIVITY_ACTION.BLACKLIST_SET,
      details: {
        contactId,
        reason: "Didn't deliver",
      },
    });
    if (bl) recorded.push(bl);
  }
  return recorded;
}

export function recordReopenActivity(engagementId, campaignId, { engagementPatch, clearBlacklist, contactId, before }) {
  const recorded = recordEngagementPatchActivity(engagementId, before, engagementPatch);

  if (clearBlacklist && contactId) {
    const cleared = recordActivityEvent({
      campaignId,
      engagementId,
      action: ACTIVITY_ACTION.BLACKLIST_CLEARED,
      details: { contactId },
    });
    if (cleared) recorded.push(cleared);
  }
  return recorded;
}

export function recordFeedbackActivity(engagementId, campaignId, { engagementFeedback }) {
  return recordActivityEvent({
    campaignId,
    engagementId,
    action: ACTIVITY_ACTION.FEEDBACK_LOGGED,
    details: {
      rating: engagementFeedback.content_quality,
      wouldWorkAgain: engagementFeedback.would_work_again,
      note: engagementFeedback.internal_notes ?? null,
    },
  });
}

export function getActivityEventsForEngagement(engagementId) {
  return getActivityEvents()
    .filter((e) => e.engagementId === engagementId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getActivityEventsForCampaign(campaignId) {
  return getActivityEvents()
    .filter((e) => e.campaignId === campaignId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function activityNotes(event) {
  const { action, details } = event;
  switch (action) {
    case ACTIVITY_ACTION.STAGE_CHANGED:
      if (details.reason && details.reason !== details.toStage) {
        return `Reason: ${formatStatus(details.reason)}`;
      }
      return details.droppedFrom ? `Dropped from ${formatStatus(details.droppedFrom)}` : null;
    case ACTIVITY_ACTION.FIRST_OUTREACH:
      return details.followUpDate ? `Follow-up ${formatDate(details.followUpDate)}` : null;
    case ACTIVITY_ACTION.CONTACT_NO_REPLY:
      return details.retryDate ? `Retry ${formatDate(details.retryDate)}` : null;
    case ACTIVITY_ACTION.DELIVERABLE_POSTED: {
      const label = `${details.deliverableType ?? 'Deliverable'}${details.quantity ? ` ×${details.quantity}` : ''}`;
      const proof = details.contentLink ? 'Link saved' : `${details.screenshotCount ?? 0} screenshot(s)`;
      return `${label} — ${proof}`;
    }
    case ACTIVITY_ACTION.REJECT:
      return 'Profile rejected';
    case ACTIVITY_ACTION.REOPEN:
      return `Restored to ${formatStatus(details.toStage)}`;
    case ACTIVITY_ACTION.DIDNT_DELIVER:
      return details.droppedFrom ? `From ${formatStatus(details.droppedFrom)}` : null;
    case ACTIVITY_ACTION.BLACKLIST_SET:
      return details.reason ?? null;
    case ACTIVITY_ACTION.BLACKLIST_CLEARED:
      return 'Contact removed from blacklist';
    case ACTIVITY_ACTION.FEEDBACK_LOGGED:
      return `★${details.rating} · ${details.wouldWorkAgain ? 'Would work again' : 'Would not repeat'}`;
    default:
      return null;
  }
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

/** Map an ActivityEvent to the engagement timeline modal shape. */
export function activityEventToTimelineEntry(event) {
  let statusChange = null;
  if (event.action === ACTIVITY_ACTION.STAGE_CHANGED && event.details?.toStage) {
    statusChange = `${formatStatus(event.details.fromStage)} → ${formatStatus(event.details.toStage)}`;
  } else if (event.action === ACTIVITY_ACTION.FIRST_OUTREACH) {
    statusChange = 'In Conversation';
  } else if (event.action === ACTIVITY_ACTION.DELIVERABLE_POSTED) {
    statusChange = formatStatus('posted');
  } else if (event.action === ACTIVITY_ACTION.REOPEN && event.details?.toStage) {
    statusChange = formatStatus(event.details.toStage);
  }

  return {
    id: event.id,
    occurred_at: event.timestamp,
    user_name: event.actorName,
    action: ACTION_LABELS[event.action] ?? event.action,
    status_change: statusChange,
    notes: activityNotes(event),
  };
}
