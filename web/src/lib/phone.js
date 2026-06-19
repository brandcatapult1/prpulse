/** Normalize mobile for dedup comparison (last 10 digits). */
export function normalizeMobile(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function findContactByMobile(mobile, contacts) {
  const norm = normalizeMobile(mobile);
  if (!norm) return null;
  return contacts.find(
    (c) => c.mobile_number && normalizeMobile(c.mobile_number) === norm,
  ) ?? null;
}
