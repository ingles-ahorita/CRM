/** Platform from calls.reschedule_link (app.iclosed.io vs calendly.com vs Google).
 *  A null/empty reschedule_link means the call was booked directly via the Google
 *  Calendar API (a recovered lead). Non-empty links that are neither iClosed nor
 *  Calendly stay unknown (null) so existing behavior is preserved. */
export function getBookingPlatform(rescheduleLink) {
  const link = String(rescheduleLink || '').toLowerCase();
  if (link.includes('iclosed')) return 'iclosed';
  if (link.includes('calendly')) return 'calendly';
  if (!link) return 'google';
  return null;
}

export function isIclosedLead(lead) {
  return getBookingPlatform(lead?.reschedule_link) === 'iclosed';
}

export function isGoogleLead(lead) {
  return getBookingPlatform(lead?.reschedule_link) === 'google';
}

export function isCalendlyLead(lead) {
  return getBookingPlatform(lead?.reschedule_link) === 'calendly';
}

/** Google Calendar eventId stored in calls.calendly_id for recovered (Google) bookings.
 *  Returns null for iClosed (numeric id) and Calendly (api.calendly.com URI) values. */
export function getGoogleEventId(calendlyId) {
  const raw = String(calendlyId || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return null;                // iClosed numeric event-call id
  if (raw.includes('api.calendly.com')) return null; // Calendly event URI
  return raw;                                        // Google Calendar eventId
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

export const CALENDLY_CANCELLED_CONFIRMED_TOOLTIP =
  'This call is cancelled in Calendly. Confirmed status cannot be changed — Book a new call instead.';
