export function parseRequiredTargetCollaborations(value) {
  if (value === '' || value == null) {
    const err = new Error('target_collaborations is required');
    err.status = 400;
    throw err;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error('target_collaborations must be a non-negative number');
    err.status = 400;
    throw err;
  }
  return n;
}

export function parseTermMonths(value, campaignType) {
  if (campaignType !== 'monthly') {
    return null;
  }
  if (value === '' || value == null) {
    const err = new Error('term_months is required for monthly recurring campaigns');
    err.status = 400;
    throw err;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    const err = new Error('term_months must be a positive integer');
    err.status = 400;
    throw err;
  }
  return n;
}

export function assertMonthlyTermMonths(campaignType, termMonths) {
  if (campaignType === 'monthly' && (termMonths == null || termMonths === '')) {
    const err = new Error('term_months is required for monthly recurring campaigns');
    err.status = 400;
    throw err;
  }
}
