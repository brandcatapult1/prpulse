import { ACTIVITY_ACTION, tryInsertActivityEvent } from './activityEvents.mjs';

export { ACTIVITY_ACTION };

function stageChangedEvent(before, patch) {
  const fromStage = before.conversation_status;
  const toStage = patch.conversation_status;
  if (!toStage || fromStage === toStage) return null;
  return {
    action: ACTIVITY_ACTION.STAGE_CHANGED,
    details: {
      fromStage,
      toStage,
      reason: patch.drop_reason ?? (toStage.startsWith('dropped_') ? toStage : null),
      droppedFrom: patch.dropped_from ?? before.dropped_from ?? null,
    },
  };
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
    && patch.last_contact_date
    && patch.last_contact_date !== before.last_contact_date
    && !patch.initial_contact_date
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

  const wasDropped = before.conversation_status?.startsWith('dropped_')
    || before.conversation_status === 'dropped';
  if (
    wasDropped
    && patch.conversation_status
    && !patch.conversation_status.startsWith('dropped_')
    && patch.conversation_status !== 'dropped'
  ) {
    events.push({
      action: ACTIVITY_ACTION.REOPEN,
      details: {
        fromDroppedStatus: before.conversation_status,
        toStage: patch.conversation_status,
        priorDroppedFrom: before.dropped_from ?? null,
      },
    });
  }

  return events;
}

export async function recordEngagementPatchActivity(client, user, before, updated, explicitPatch = {}) {
  const patch = { ...explicitPatch };
  for (const key of Object.keys(explicitPatch)) {
    if (explicitPatch[key] === undefined) delete patch[key];
  }

  const events = [];
  const stageEvt = stageChangedEvent(before, patch);
  if (stageEvt) events.push(stageEvt);
  events.push(...inferDiscreteEngagementEvents(before, patch));

  for (const evt of events) {
    await tryInsertActivityEvent(client, user, {
      campaignId: before.campaign_id,
      engagementId: before.id,
      action: evt.action,
      details: evt.details ?? {},
    });
  }
  return updated;
}

export async function recordDeliverablePostedActivity(client, user, { campaignId, engagementId, deliverable }) {
  await tryInsertActivityEvent(client, user, {
    campaignId,
    engagementId,
    action: ACTIVITY_ACTION.DELIVERABLE_POSTED,
    details: {
      deliverableId: deliverable.id,
      deliverableType: deliverable.deliverable_type,
      quantity: deliverable.quantity,
      contentLink: deliverable.content_link ?? null,
      screenshotCount: deliverable.screenshots?.length ?? 0,
      publishedDate: deliverable.published_date ?? null,
    },
  });
}

export async function recordDidntDeliverActivity(client, user, { campaignId, engagementId, engagementPatch, blacklist, contactId }) {
  await tryInsertActivityEvent(client, user, {
    campaignId,
    engagementId,
    action: ACTIVITY_ACTION.DIDNT_DELIVER,
    details: {
      droppedFrom: engagementPatch.dropped_from ?? null,
      toStage: engagementPatch.conversation_status,
    },
  });
  if (blacklist && contactId) {
    await tryInsertActivityEvent(client, user, {
      campaignId,
      engagementId,
      action: ACTIVITY_ACTION.BLACKLIST_SET,
      details: { contactId, reason: "Didn't deliver" },
    });
  }
}

export async function recordBlacklistClearedActivity(client, user, { campaignId, engagementId, contactId }) {
  await tryInsertActivityEvent(client, user, {
    campaignId,
    engagementId,
    action: ACTIVITY_ACTION.BLACKLIST_CLEARED,
    details: { contactId },
  });
}

export async function recordFeedbackActivity(client, user, { campaignId, engagementId, feedback }) {
  await tryInsertActivityEvent(client, user, {
    campaignId,
    engagementId,
    action: ACTIVITY_ACTION.FEEDBACK_LOGGED,
    details: {
      rating: feedback.content_quality,
      wouldWorkAgain: feedback.would_work_again,
      note: feedback.internal_notes ?? null,
    },
  });
}

export async function recordVisitRemindedActivity(client, user, { campaignId, engagementId, details }) {
  await tryInsertActivityEvent(client, user, {
    campaignId,
    engagementId,
    action: 'visit_reminded',
    details,
  });
}
