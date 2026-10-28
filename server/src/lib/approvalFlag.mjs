/**
 * Creator Instagram approval is paused. Set INSTAGRAM_APPROVAL=on to use stored approvals again
 * (sync from the creator's own insights, measured reach/saves/shares) and to accept new ones.
 */
export function approvalEnabled() {
  return String(process.env.INSTAGRAM_APPROVAL ?? '').toLowerCase() === 'on';
}

/** While paused, measured private numbers from an approval are not shown (the stored rows are kept). */
export function maskApprovalMetrics(row) {
  if (approvalEnabled() || row?.source !== 'insights') return row;
  return { ...row, reach: null, shares: null, reposts: null, saves: null };
}
