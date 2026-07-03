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

export function reopenCompleteToastMessage() {
  return 'Reopened — back to Awaiting Deliverables';
}

export const REOPEN_COMPLETE_CONFIRM = {
  title: 'Reopen this collaboration?',
  body:
    'This engagement will leave Collaboration Complete and no longer count toward the campaign’s completed total. Any campaign tag it earned for the creator may be removed. Deliverables will be editable again.',
};
