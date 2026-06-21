/** In-memory deliverables cache keyed by engagement id — set by campaign/dashboard views after API load. */

let byEngagement = {};

export function setDeliverablesCache(map) {
  byEngagement = map ?? {};
}

export function getDeliverablesForEngagement(engagementId) {
  return byEngagement[engagementId] ?? [];
}

export function updateEngagementDeliverables(engagementId, list) {
  byEngagement = { ...byEngagement, [engagementId]: list };
}
