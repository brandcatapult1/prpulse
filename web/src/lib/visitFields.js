import { toDateInputValue } from './dates.js';

export function resolveEngagementOutletName(engagement) {
  return engagement?.visit_outlet_display
    ?? engagement?.visit_outlet_name
    ?? engagement?.visit_outlet
    ?? engagement?.brand_default_outlet_name
    ?? null;
}

export function resolveEngagementOutletId(engagement) {
  return engagement?.visit_outlet_id
    ?? engagement?.visit_outlet_id_resolved
    ?? engagement?.brand_default_outlet_id
    ?? null;
}

/** Display time as HH:MM:SS (matches seeded / legacy format). */
export function formatVisitTimeForDisplay(time) {
  if (time == null || time === '') return null;
  const s = String(time);
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

export function formatVisitTimeVenue(visitTime, outletName) {
  const time = formatVisitTimeForDisplay(visitTime);
  const outlet = outletName || 'Visit';
  return time ? `${time} · ${outlet}` : outlet;
}

export function toTimeInputValue(time) {
  if (time == null || time === '') return '';
  return String(time).slice(0, 5);
}

export function toApiVisitTime(timeInput) {
  if (timeInput == null || timeInput === '') return null;
  const s = String(timeInput).trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

export function emptyVisitFields() {
  return { visitDate: '', visitTime: '', visitNotes: '' };
}

export function visitFieldsFromEngagement(engagement) {
  if (!engagement) return emptyVisitFields();
  return {
    visitDate: toDateInputValue(engagement.visit_date) ?? '',
    visitTime: toTimeInputValue(engagement.visit_time),
    visitNotes: engagement.visit_notes ?? '',
  };
}

export function buildVisitFieldsPatch({
  visitDate,
  visitTime,
  visitNotes,
  visitOutletId,
  syncFollowUp = true,
}) {
  const patch = {
    visit_date: visitDate,
    visit_time: toApiVisitTime(visitTime),
    visit_notes: visitNotes?.trim() || null,
  };
  if (visitOutletId) patch.visit_outlet_id = visitOutletId;
  if (syncFollowUp && visitDate) patch.next_follow_up_date = visitDate;
  return patch;
}

export function buildScheduledTransitionPayload(engagement, fields) {
  return {
    visitDate: fields.visitDate,
    visitTime: fields.visitTime,
    visitNotes: fields.visitNotes,
    visitOutletId: resolveEngagementOutletId(engagement),
  };
}
