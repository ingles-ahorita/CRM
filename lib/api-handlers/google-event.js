/* global process */
// /api/google-event — status + cancellation for recovered (Google Calendar) bookings.
//   GET  ?callId=<calls.id>            → { found, canceled }
//        (or ?eventId=&closerEmail=)
//   POST { callId } or { eventId, closerEmail, sendUpdates? } → cancel the event
//
// Auth mirrors create-calendar-event.js: a service account impersonating the
// closer (subject = closer calendar email), scope calendar.events, calendarId 'primary'.
import { google } from 'googleapis';
import { getSupabaseAdmin } from '../getSupabaseAdmin.js';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function getQueryValue(req, key) {
  const value = req.query?.[key];
  if (value != null) return Array.isArray(value) ? value[0] : value;
  try {
    const url = new URL(req.url || '', 'http://localhost');
    return url.searchParams.get(key);
  } catch {
    return undefined;
  }
}

function loadCalendarClient(closerEmail) {
  const json = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  if (!json) return { error: 'GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON not configured' };
  let credentials;
  try {
    credentials = JSON.parse(json);
  } catch (e) {
    return { error: `Invalid GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: ${e.message}` };
  }
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [CALENDAR_SCOPE],
    subject: closerEmail, // impersonate the closer who owns the event
  });
  return { calendar: google.calendar({ version: 'v3', auth }) };
}

// Resolve the Google eventId + the closer's calendar email for a call.
// Prefers explicit eventId/closerEmail; otherwise looks them up from the calls row.
async function resolveCall({ callId, eventId, closerEmail }) {
  if (eventId && closerEmail) return { eventId, closerEmail };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: 'Supabase not configured' };
  if (!callId) return { error: 'Missing callId (or eventId + closerEmail)' };
  const { data: call, error } = await supabase
    .from('calls')
    .select('calendly_id, closers ( email )')
    .eq('id', callId)
    .single();
  if (error) return { error: error.message };
  return {
    eventId: eventId || call?.calendly_id || null,
    closerEmail: closerEmail || call?.closers?.email || null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const callId = String(getQueryValue(req, 'callId') || '').trim() || null;
      const eventId = String(getQueryValue(req, 'eventId') || '').trim() || null;
      const closerEmail = String(getQueryValue(req, 'closerEmail') || '').trim() || null;

      const resolved = await resolveCall({ callId, eventId, closerEmail });
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      // Nothing to check → report not found (fail-open: caller treats this as "not cancelled").
      if (!resolved.eventId || !resolved.closerEmail) {
        return res.status(200).json({ found: false, canceled: false });
      }

      const { calendar, error: clientErr } = loadCalendarClient(resolved.closerEmail);
      if (clientErr) return res.status(503).json({ error: clientErr });

      try {
        const { data } = await calendar.events.get({
          calendarId: 'primary',
          eventId: resolved.eventId,
        });
        return res.status(200).json({ found: true, canceled: data?.status === 'cancelled' });
      } catch (err) {
        const code = err?.code || err?.response?.status;
        // 404/410 → the event no longer exists → effectively cancelled.
        if (code === 404 || code === 410) {
          return res.status(200).json({ found: false, canceled: true });
        }
        return res.status(502).json({
          error: `Google Calendar status check failed: ${err?.message || 'unknown error'}`,
        });
      }
    }

    if (req.method === 'POST') {
      const { callId, eventId, closerEmail, sendUpdates } = req.body || {};

      const resolved = await resolveCall({ callId, eventId, closerEmail });
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      if (!resolved.eventId) return res.status(400).json({ error: 'No Google eventId found for this call' });
      if (!resolved.closerEmail) return res.status(400).json({ error: 'No closer calendar email found for this call' });

      const { calendar, error: clientErr } = loadCalendarClient(resolved.closerEmail);
      if (clientErr) return res.status(503).json({ error: clientErr });

      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: resolved.eventId,
          sendUpdates: sendUpdates || 'all',
        });
        return res.status(200).json({ success: true, data: { message: 'Event cancelled' } });
      } catch (err) {
        const code = err?.code || err?.response?.status;
        // 404/410 → already deleted/cancelled: treat as success.
        if (code === 404 || code === 410) {
          return res.status(200).json({ success: true, data: { message: 'Event is already canceled' } });
        }
        return res.status(code === 403 ? 403 : 500).json({
          error: `Google Calendar cancel failed: ${err?.message || 'unknown error'}`,
        });
      }
    }

    return res.status(405).json({ error: `Method not allowed: ${req.method}` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}