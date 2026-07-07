import {
  contactsApi,
  engagementsApi,
  campaignsApi,
  dashboardApi,
  reportsApi,
} from './api.js';

/** Patch engagement fields; returns updated row from server. */
export async function patchEngagement(id, patch) {
  return engagementsApi.update(id, patch);
}

/** Sanctioned reopen from Collaboration Complete (Admin / Senior Manager). */
export async function reopenEngagement(id) {
  return engagementsApi.reopen(id);
}

export async function fetchEngagementsForCampaign(campaignId) {
  return engagementsApi.byCampaign(campaignId);
}

export async function fetchEngagement(id) {
  return engagementsApi.get(id);
}

export async function fetchDeliverables(engagementId) {
  return engagementsApi.deliverables(engagementId);
}

export async function fetchDeliverablesForCampaign(campaignId) {
  return engagementsApi.deliverablesByCampaign(campaignId);
}

export async function createDeliverable(engagementId, body) {
  return engagementsApi.createDeliverable(engagementId, body);
}

export async function updateDeliverable(engagementId, deliverableId, body) {
  return engagementsApi.updateDeliverable(engagementId, deliverableId, body);
}

export async function deleteDeliverable(engagementId, deliverableId) {
  return engagementsApi.deleteDeliverable(engagementId, deliverableId);
}

/**
 * Persist proof on a single deliverable as a direct write (PATCH for an
 * existing row, POST for an unsaved temp row). Resolves with the saved row
 * from the server, or rejects on a non-2xx response — never optimistic.
 */
export async function logDeliverableProof(engagementId, deliverable) {
  const isTempId = String(deliverable?.id ?? '').startsWith('d-');
  if (isTempId) {
    const { id: _omit, ...body } = deliverable;
    return createDeliverable(engagementId, body);
  }
  return updateDeliverable(engagementId, deliverable.id, deliverable);
}

/** Replace full deliverable list via diff (create/update/delete). */
export async function syncDeliverables(engagementId, beforeList, afterList) {
  const beforeIds = new Set(beforeList.map((d) => d.id));
  const afterIds = new Set(afterList.map((d) => d.id));
  const touchedExisting = new Set();

  for (const item of beforeList) {
    if (!afterIds.has(item.id)) {
      await deleteDeliverable(engagementId, item.id);
    }
  }

  const results = [];
  for (const item of afterList) {
    const isTempId = String(item.id ?? '').startsWith('d-');
    const isNew = isTempId || !beforeIds.has(item.id);

    if (isNew) {
      const { id: _omit, ...body } = item;
      try {
        const created = await createDeliverable(engagementId, body);
        results.push(created);
      } catch (err) {
        err.deliverable = item;
        throw err;
      }
      continue;
    }

    if (touchedExisting.has(item.id)) continue;
    touchedExisting.add(item.id);

    try {
      const updated = await updateDeliverable(engagementId, item.id, item);
      results.push(updated);
    } catch (err) {
      err.deliverable = item;
      throw err;
    }
  }
  return results;
}

export async function saveFeedback(engagementId, record) {
  return engagementsApi.saveFeedback(engagementId, record);
}

export async function fetchFeedback(engagementId) {
  return engagementsApi.feedback(engagementId);
}

export async function fetchFeedbackForCampaign(campaignId) {
  return engagementsApi.feedbackByCampaign(campaignId);
}

export async function patchContact(id, patch) {
  return contactsApi.update(id, patch);
}

export async function blacklistContact(contactId, reason) {
  return contactsApi.blacklist(contactId, reason);
}

export async function clearBlacklist(contactId) {
  return contactsApi.clearBlacklist(contactId);
}

export async function populateCampaign(campaignId, contactIds, assignedManager) {
  return campaignsApi.populate(campaignId, {
    contact_ids: contactIds,
    assigned_manager: assignedManager,
  });
}

export async function fetchPopulationContacts(campaignId) {
  return contactsApi.populationForCampaign(campaignId);
}

export async function fetchDashboardWorkspace(scopeUserId) {
  return dashboardApi.workspace(scopeUserId);
}

export async function logVisitReminder(engagementId, details) {
  return engagementsApi.visitReminder(engagementId, details);
}

export async function fetchReportBrands() {
  return reportsApi.brands();
}

export async function fetchReportBrandCampaigns(brandId) {
  return reportsApi.brandCampaigns(brandId);
}

export async function fetchReportCampaignCycles(campaignId) {
  return reportsApi.campaignCycles(campaignId);
}

export async function fetchCycleReport(cycleId) {
  return reportsApi.cycleReport(cycleId);
}

export async function exportCycleReportPdf(cycleId) {
  return reportsApi.cyclePdf(cycleId);
}

export async function fetchEngagementTimeline(engagementId) {
  return engagementsApi.timeline(engagementId);
}

/** Atomically sync deliverables and move engagement to scheduled. */
export async function commitScheduleEngagement(engagementId, body) {
  return engagementsApi.schedule(engagementId, body);
}
