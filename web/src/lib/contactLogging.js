import { formatDate } from './format.jsx';
import { todayIso } from './dates.js';

/** Log an unanswered outreach attempt — distinct from a conversation for reporting. */
export function logNoReplyAttempt(engagement, retryDate) {
  const noReplyCount = (engagement.no_reply_count ?? 0) + 1;
  const patch = {
    last_contact_date: todayIso(),
    last_contact_log_type: 'no_reply_attempt',
    no_reply_count: noReplyCount,
    next_follow_up_date: retryDate,
  };
  if (noReplyCount >= 3) {
    patch.conversation_status = 'no_response';
  }
  return {
    patch,
    noReplyCount,
    toastMessage: `Logged — retry ${formatDate(retryDate)}`,
  };
}

/** Contact fields for a successful two-way reply; persist only at terminal confirm. */
export function buildRepliedContactLogPatch() {
  return {
    last_contact_date: todayIso(),
    last_contact_log_type: 'conversation',
    no_reply_count: 0,
  };
}

export function repliedContactToastMessage(outcomeSuffix) {
  if (!outcomeSuffix) return 'Logged contact for today';
  return `Logged contact for today — ${outcomeSuffix}`;
}
