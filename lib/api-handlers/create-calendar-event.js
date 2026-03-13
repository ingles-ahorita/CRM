/**
 * POST /api/create-calendar-event
 * Creates a 1-hour event in the closer's Google Calendar and a new call in the CRM.
 * Body: { closerEmail, startDateTime, leadName?, leadId?, leadEmail?, closerId?, setterId?, leadPhone? }
 * startDateTime: ISO 8601 string (e.g. "2025-02-24T14:30:00")
 * Env: GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { closerEmail, startDateTime, leadName, leadId, leadEmail, closerId, setterId, leadPhone, sourceType, mcApiKey, closer_mc_id } = body;

  if (!closerEmail || !startDateTime) {
    return res.status(400).json({
      error: 'Missing required fields: closerEmail, startDateTime',
    });
  }

  let credentials;
  try {
    const json = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
    if (!json) {
      return res.status(503).json({
        error: 'GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON not configured',
      });
    }
    credentials = JSON.parse(json);
  } catch (e) {
    return res.status(503).json({
      error: 'Invalid GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON',
      details: e.message,
    });
  }

  try {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [CALENDAR_SCOPE],
      subject: closerEmail, // impersonate the closer (requires domain-wide delegation)
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const start = new Date(startDateTime);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid startDateTime format' });
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const eventTitle = leadName ? 'Entrevista Personalizada (Inglés Ahorita)' : 'Recover lead';
    const eventDescription = `💻 Esta videollamada es para aquellos que realmente se toman en serio su objetivo de hablar inglés fluido de una vez por todas.


⚠️ Importante: Solo puedes agendar una única llamada, así que asegúrate de elegir una hora en la que realmente estés disponible y aprovecharla al máximo.


🤓 Nuestro asesor experto te ayudará a identificar los desafíos que te han prevenido de aprender inglés.


💪 y te explicará el método que Martin usa para que alcances tu objetivo laboral o personal!


🏆 Aceptamos un número limitado de estudiantes en nuestra academia con Martin y solo seleccionamos los que realmente tienen ese compromiso para aprender inglés fluido.`;

    const attendees = [
      { email: closerEmail, organizer: true },
      ...(leadEmail ? [{ email: leadEmail }] : []),
    ];

    const event = {
      summary: eventTitle,
      description: eventDescription || undefined,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'UTC',
      },
      conferenceData: {
        createRequest: {
          requestId: `recover-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      attendees,
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    // Create a new call in the CRM with the new scheduled time
    let callId = null;
    let crmError = null;
    let manychatWarning = null;
    if (!supabase) {
      crmError = 'Supabase not configured (missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY)';
      console.warn('[create-calendar-event]', crmError);
    } else if (!leadId || !closerId) {
      crmError = `Missing CRM data: leadId=${leadId ? 'ok' : 'MISSING'}, closerId=${closerId ? 'ok' : 'MISSING'}`;
      console.warn('[create-calendar-event]', crmError);
    } else {
      try {
        const callPayload = {
          lead_id: leadId,
          closer_id: closerId,
          setter_id: setterId || null,
          book_date: new Date().toISOString(),
          call_date: startDateTime,
          name: leadName || null,
          email: leadEmail || null,
          phone: leadPhone || null,
          source_type: sourceType || null,
          is_reschedule: true,
          recovered: true,
        };
        const { data: newCall, error: callErr } = await supabase
          .from('calls')
          .insert(callPayload)
          .select('id')
          .single();

        if (callErr) {
          crmError = callErr.message;
          if (callErr.code) crmError += ` (code: ${callErr.code})`;
          if (callErr.details) crmError += ` | ${JSON.stringify(callErr.details)}`;
          console.error('[create-calendar-event] Failed to create CRM call:', crmError);
          console.error('[create-calendar-event] Payload:', JSON.stringify(callPayload, null, 2));
        } else if (newCall?.id) {
          callId = newCall.id;
          console.log('[create-calendar-event] CRM call created:', callId);

          // Set recovered=true in ManyChat. Use closer_mc_id if available; otherwise find by phone.
          const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
          let subscriberId = closer_mc_id ? String(closer_mc_id) : null;

          if (subscriberId && mcApiKey) {
            // We have ManyChat ID: use it directly
            try {
              const setRes = await fetch(`${apiBase}/api/manychat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'set-fields-by-name',
                  subscriberId,
                  fieldsByName: [
                    { name: 'recovered', value: true },
                    { name: 'call_date', value: startDateTime },
                  ],
                  apiKey: mcApiKey,
                }),
              });
              const setData = setRes.ok ? await setRes.json() : null;
              if (!setRes.ok) {
                manychatWarning = setData?.error || `ManyChat: failed to set recovered field (${setRes?.status || 'unknown'})`;
                console.warn('[create-calendar-event]', manychatWarning);
              } else {
                console.log('[create-calendar-event] ManyChat recovered field set to true');
              }
              // Ensure new call has closer_mc_id
              const { error: mcIdErr } = await supabase.from('calls').update({ closer_mc_id: subscriberId }).eq('id', callId);
              if (mcIdErr) console.warn('[create-calendar-event] Failed to store closer_mc_id:', mcIdErr);
            } catch (mcErr) {
              manychatWarning = `ManyChat: ${mcErr.message}`;
              console.warn('[create-calendar-event]', manychatWarning);
            }
          } else if (!subscriberId && leadPhone && mcApiKey) {
            // No closer_mc_id: find by phone
            try {
              const findRes = await fetch(`${apiBase}/api/manychat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'find-user-by-phone',
                  whatsapp_phone: leadPhone,
                  apiKey: mcApiKey,
                }),
              });
              const findData = findRes.ok ? await findRes.json() : null;
              if (!findRes.ok || !findData?.subscriberId) {
                manychatWarning = findData?.error || `ManyChat: could not find user by phone (${findRes?.status || 'unknown'})`;
                console.warn('[create-calendar-event]', manychatWarning);
              } else {
                subscriberId = String(findData.subscriberId);
                const { error: mcIdErr } = await supabase.from('calls').update({ closer_mc_id: subscriberId }).eq('id', callId);
                if (mcIdErr) console.warn('[create-calendar-event] Failed to store closer_mc_id:', mcIdErr);
                const setRes = await fetch(`${apiBase}/api/manychat`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'set-fields-by-name',
                    subscriberId,
                    fieldsByName: [
                      { name: 'recovered', value: true },
                      { name: 'call_date', value: startDateTime },
                    ],
                    apiKey: mcApiKey,
                  }),
                });
                const setData = setRes.ok ? await setRes.json() : null;
                if (!setRes.ok) {
                  manychatWarning = setData?.error || `ManyChat: failed to set recovered field (${setRes?.status || 'unknown'})`;
                  console.warn('[create-calendar-event]', manychatWarning);
                } else {
                  console.log('[create-calendar-event] ManyChat recovered field set to true');
                }
              }
            } catch (mcErr) {
              manychatWarning = `ManyChat: ${mcErr.message}`;
              console.warn('[create-calendar-event]', manychatWarning);
            }
          } else if (!subscriberId && !leadPhone) {
            manychatWarning = 'ManyChat: no closer_mc_id or phone number to find user';
            console.warn('[create-calendar-event]', manychatWarning);
          } else if (!mcApiKey) {
            manychatWarning = 'ManyChat: no API key configured';
            console.warn('[create-calendar-event]', manychatWarning);
          }
        }
      } catch (callEx) {
        crmError = callEx.message;
        console.error('[create-calendar-event] Error creating CRM call:', callEx.message, callEx.stack);
      }
    }

    return res.status(200).json({
      success: true,
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
      callId: callId || undefined,
      ...(crmError && { crmWarning: crmError }),
      ...(manychatWarning && { manychatWarning }),
    });
  } catch (err) {
    console.error('[create-calendar-event] Error:', err.message, err.stack);
    const status = err.code === 403 ? 403 : 500;
    return res.status(status).json({
      error: 'Failed to create calendar event',
      details: err.message,
      hint: err.code === 403
        ? 'Check domain-wide delegation: Admin Console > Security > API Controls > Domain-wide delegation. Add client_id with scope https://www.googleapis.com/auth/calendar'
        : undefined,
    });
  }
}
