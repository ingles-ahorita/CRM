/** Platform from calls.reschedule_link (app.iclosed.io vs calendly.com). */
export function getBookingPlatform(rescheduleLink) {
  const link = String(rescheduleLink || '').toLowerCase();
  if (link.includes('iclosed')) return 'iclosed';
  if (link.includes('calendly')) return 'calendly';
  return null;
}

export function isIclosedLead(lead) {
  return getBookingPlatform(lead?.reschedule_link) === 'iclosed';
}

/** iClosed cancel id: numeric value in calls.calendly_id (from Zapier). */
export function getIclosedEventCallId(calendlyId) {
  const raw = String(calendlyId || '').trim();
  return /^\d+$/.test(raw) ? raw : null;
}

export function getCalendlyEventUri(calendlyId) {
  const raw = String(calendlyId || '').trim();
  return raw.includes('api.calendly.com/scheduled_events') ? raw : null;
}

export const ICLOSED_CANCELLED_CONFIRMED_TOOLTIP =
  'This call is cancelled in iClosed. Confirmed status cannot be changed — Book a new call instead.';