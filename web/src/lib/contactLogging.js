import { formatDate } from './format.jsx';
import { todayIso } from './dates.js';

/** Log an unanswered outreach attempt — distinct from a conversation for reporting. */
export function logNoReplyAttempt(engagement, retryDate) {
  const noReplyCount = (engagement.no_reply_count ?? 0) + 1;
  return {
    patch: {
      last_contact_date: todayIso(),
      last_contact_log_type: 'no_reply_attempt',
      no_reply_count: noReplyCount,
      next_follow_up_date: retryDate,
    },
    noReplyCount,
    toastMessage: `Logged — retry ${formatDate(retryDate)}`,
  };
}

/** Log a successful two-way contact today; resets consecutive no-reply streak. */
export function logRepliedContact() {
  return {
    patch: {
      last_contact_date: todayIso(),
      last_contact_log_type: 'conversation',
      no_reply_count: 0,
    },
    toastMessage: 'Logged contact for today',
  };
}
