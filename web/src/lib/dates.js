/** Today as YYYY-MM-DD (local calendar). */
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Today + N days as YYYY-MM-DD (local calendar). */
export function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add days to an existing YYYY-MM-DD date string. */
export function addDaysToIsoDate(isoDate, days) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toDateInputValue(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
}
