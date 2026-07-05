/**
 * Deliverable write eligibility — mirror web/src/lib/engagementRules.js deliverablesRules.
 * Editable only in active working stages; locked when complete, dropped, or not_contacted.
 */

export const DELIVERABLE_EDITABLE_STATUSES = new Set([
  'awaiting_final_deliverables',
  'in_conversation',
  'scheduled',
  'no_response',
]);

export function engagementStatusAllowsDeliverableEdits(status) {
  return DELIVERABLE_EDITABLE_STATUSES.has(status);
}

export function deliverablesEditBlockedMessage(status) {
  if (status === 'collaboration_complete') {
    return 'Deliverables are locked while collaboration is complete. Reopen the engagement to amend.';
  }
  if (status === 'dropped' || status?.startsWith('dropped_')) {
    return "Deliverables can't be edited while the engagement is dropped.";
  }
  if (status === 'not_contacted') {
    return "Deliverables can't be edited before outreach has started.";
  }
  return "Deliverables can't be edited at this engagement stage.";
}

export function deliverablesEditBlockedStatus(status) {
  if (status === 'collaboration_complete') return 409;
  return 422;
}

export async function assertDeliverablesEditable(client, engagementId) {
  const { rows } = await client.query(
    'SELECT conversation_status FROM engagements WHERE id = $1',
    [engagementId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Engagement not found'), { status: 404 });
  }
  const status = rows[0].conversation_status;
  if (engagementStatusAllowsDeliverableEdits(status)) return;
  throw Object.assign(
    new Error(deliverablesEditBlockedMessage(status)),
    { status: deliverablesEditBlockedStatus(status) },
  );
}
