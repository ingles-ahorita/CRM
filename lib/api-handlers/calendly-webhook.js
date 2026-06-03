import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../getSupabaseAdmin.js';
import { logPlatformEvent } from '../platformEvents.js';
import { sendDiscordDm } from '../discordNotify.js';

// In Vercel serverless functions, use the raw env var names
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const WEBHOOK_LOG_TABLE =
  process.env.SUPABASE_WEBHOOK_TABLE || 'calendly_webhook_logs';

export default async function handler(req, res) {
    console.log('Supabase URL:', process.env.VITE_SUPABASE_URL ? 'Found' : 'Missing');
  console.log('Supabase Key:', process.env.VITE_SUPABASE_ANON_KEY ? 'Found' : 'Missing');

  try {
    console.log('Webhook received!');
    console.log('Method:', req.method);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { event, payload } = req.body || {};

    // Always log the webhook payload to Supabase first
    await logWebhook({
      event,
      payload,
      rawBody: req.body,
      status: 'received'
    });

    if (!event || !payload) {
      console.warn('Missing event or payload in Calendly webhook');
      return res.status(200).json({
        received: true,
        warning: 'Missing event or payload',
        timestamp: new Date().toISOString()
      });
    }

    if (event === 'invitee.created') {
    //   console.log('New invitee created:');
    //   console.log('Name:', payload.name);
    //   console.log('Email:', payload.email);
    //   console.log('Event:', payload.scheduled_event?.name);
    //   console.log('Start time:', payload.scheduled_event?.start_time);
      await handleNewBooking(payload);
    } else if (event === 'invitee.canceled') {
      await handleCancellation(payload);
    } else if (event === 'invitee_no_show.created') {
      await handleNoShow(payload);
    } else {
      console.log(`Unhandled Calendly event type: ${event}`);
    }

    return res.status(200).json({
      received: true,
      event,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(200).json({
      received: true,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

async function logCalendlyPlatformEvent(eventType, summary, payload) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const key = payload?.uri || payload?.email || payload?.scheduled_event?.start_time || Date.now();
  try {
    await logPlatformEvent(admin, {
      event_type: eventType,
      category: 'booking',
      priority: 2,
      summary,
      actor_type: 'webhook',
      actor_display: 'Calendly',
      lead_name: payload?.name ?? null,
      lead_email: payload?.email ?? null,
      source: 'calendly',
      dedupe_key: `calendly:${eventType}:${key}`,
      metadata: { href: '/management?tab=leads' },
    });
  } catch (err) {
    console.warn('[calendly-webhook] platform_events:', err?.message);
  }
}

async function handleNewBooking(payload) {
  console.log('Processing new booking payload for Discord notification');
  console.log('Payload:', payload);
  await notifyDiscord(payload);
  const name = payload?.name || 'Unknown';
  const email = payload?.email || '';
  await logCalendlyPlatformEvent(
    'booking.created',
    `Calendly booking — ${name}${email ? ` (${email})` : ''}`,
    payload,
  );
}

async function handleCancellation(payload) {
  console.log('Cancellation received:', payload);
  const name = payload?.name || 'Unknown';
  await logCalendlyPlatformEvent('booking.canceled', `Calendly canceled — ${name}`, payload);
}

async function handleNoShow(payload) {
  console.log('No-show received:', payload);
  const name = payload?.name || 'Unknown';
  await logCalendlyPlatformEvent('booking.no_show', `Calendly no-show — ${name}`, payload);
}

async function sendToManyChat(data) {
  // We'll fill this in next - what data do you send to ManyChat currently?
}

async function notifyDiscord(payload) {
  const inviteeName = payload?.name || 'Unknown name';
  const inviteeEmail = payload?.email || 'Unknown email';
  const eventName = payload?.scheduled_event?.name || 'Unknown event';
  const startTime = payload?.scheduled_event?.start_time || 'Unknown start time';

  const messageLines = [
    `📅 New Calendly booking: ${eventName}`,
    `👤 ${inviteeName}`,
    `✉️ ${inviteeEmail}`,
    `🕒 Starts at: ${startTime}`,
  ];

  try {
    await sendDiscordDm({
      message: messageLines.join('\n'),
      userId: '447184380939599880',
    });
    console.log('Discord notification sent successfully');
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

async function logWebhook({ event, payload, rawBody, status, error }) {
    console.log('Logging webhook to Supabase');
  if (!supabase) {
    console.warn(
      'Supabase environment variables missing; skipping webhook logging'
    );
    return null;
  }

  try {
    const entry = {
      source: 'calendly',
      event: event || 'unknown',
      payload,
      raw_body: rawBody,
      status: status || 'received',
      error: error || null,
      created_at: new Date().toISOString()
    };

    const { data, error: insertError } = await supabase
      .from(WEBHOOK_LOG_TABLE)
      .insert(entry)
      .select('id')
      .maybeSingle();

    if (insertError) {
      console.error('Failed to log webhook to Supabase:', insertError);
      return null;
    }

    if (data?.id) {
      console.log(`Webhook logged to Supabase with id ${data.id}`);
    }

    return data;
  } catch (logError) {
    console.error('Unexpected error logging webhook to Supabase:', logError);
    return null;
  }
}