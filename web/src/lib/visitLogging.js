import { formatDate } from './format.jsx';

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
