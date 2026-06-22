/** Client-side activity helpers — persistence is server-side; these are no-ops kept for call-site compatibility. */

import { formatTimelineEntry } from './activityTimelineLabels.js';

export function queueStageTransitionActivity() {}

export function consumePendingStageActivity() {
  return null;
}

export function recordActivityEvent() {
  return null;
}

export function recordEngagementPatchActivity() {
  return [];
}

export function recordDeliverablesPatchActivity() {
  return [];
}

export function recordDidntDeliverActivity() {
  return [];
}

export function recordReopenActivity() {
  return [];
}

export function recordFeedbackActivity() {
  return null;
}

export function getActivityEventsForEngagement() {
  return [];
}

export function getActivityEventsForCampaign() {
  return [];
}

export function activityEventToTimelineEntry(event) {
  return formatTimelineEntry(event);
}
