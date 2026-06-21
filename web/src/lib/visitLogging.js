import { formatDate } from './format.jsx';
import { whatsAppUrl } from './contactSocialLinks.js';

/** Visit completed — defaults completion date to the booked visit date. */
export function buildVisitDoneTransition(engagement, transitionStage, STAGE) {
  const visitCompletedDate = engagement.visit_date ?? engagement.next_follow_up_date;
  return transitionStage(engagement, STAGE.AWAITING_FINAL_DELIVERABLES, { visitCompletedDate });
}

export function visitRescheduleToastMessage(visitDate) {
  return `Visit rescheduled — ${formatDate(visitDate)}`;
}

export function visitDoneToastMessage() {
  return 'Visit logged — moved to Awaiting Final Deliverables';
}

/** Prefilled WhatsApp reminder for a scheduled visit. */
export function buildVisitReminderMessage({
  creatorName,
  visitDate,
  visitTime,
  venue,
  campaignName,
}) {
  const when = visitTime
    ? `${formatDate(visitDate)} at ${visitTime}`
    : formatDate(visitDate);
  const place = venue ? ` at ${venue}` : '';
  return `Hi ${creatorName}, friendly reminder for your visit on ${when}${place} for ${campaignName}. See you there!`;
}

export function buildVisitReminderUrl(mobile, params) {
  const base = whatsAppUrl(mobile);
  if (!base) return null;
  const text = encodeURIComponent(buildVisitReminderMessage(params));
  return `${base}?text=${text}`;
}
