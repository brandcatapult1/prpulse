import { formatDate } from './format.jsx';
import { todayIso } from './dates.js';

export function buildFirstOutreachPatch(followUpDate) {
  const today = todayIso();
  return {
    initial_contact_date: today,
    last_contact_date: today,
    last_contact_log_type: 'conversation',
    no_reply_count: 0,
  };
}

export function firstOutreachToastMessage(followUpDate) {
  return `Logged first outreach — follow-up ${formatDate(followUpDate)}`;
}

export function rejectProfileToastMessage() {
  return 'Rejected — Profile rejected';
}

export function reopenToastMessage(stageLabel) {
  return `Reopened — back to ${stageLabel}`;
}
