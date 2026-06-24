/* global process */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const WEBHOOK_URL = 'https://inglesahorita.app.n8n.cloud/webhook/1b560f1a-d0e7-4695-a15b-6501c47aa101';

// Only Meta-sourced leads should produce Meta CAPI funnel events. Matches the
// gate in lib/api-handlers/iclosed-webhook.js (keep in sync): paid Meta traffic
// is tagged utm_source = 'meta' (case-insensitive); facebook/instagram/etc. are
// intentionally NOT treated as Meta.
function isMetaSource(source) {
  return String(source ?? '').trim().toLowerCase() === 'meta';
}

// Resolve the lead's utm_source from the calls table (well-populated, unlike
// potential_leads.source). Prefer the calendly_id match; fall back to email.
async function resolveCallUtmSource({ calendly_id, email }) {
  if (calendly_id) {
    const { data } = await supabase
      .from('calls')
      .select('utm_source')
      .eq('calendly_id', String(calendly_id))
      .order('book_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.utm_source ?? null;
  }
  if (email) {
    const { data } = await supabase
      .from('calls')
      .select('utm_source')
      .ilike('email', String(email))
      .order('book_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.utm_source ?? null;
  }
  return null;
}

function getIpAddress(req) {
  const headers = req.headers || {};
  if (headers['x-forwarded-for']) {
    const forwarded = headers['x-forwarded-for'].split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  if (headers['x-real-ip']) return headers['x-real-ip'];
  if (headers['cf-connecting-ip']) return headers['cf-connecting-ip'];
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { calendly_id, email, phone, event } = req.body || {};

    // Meta funnel gate: only forward lead_confirmed for Meta-sourced leads
    // (utm_source = 'meta'). Source comes from the calls table; unknown/non-meta
    // is skipped (fail-closed), consistent with the lead/schedule events.
    const resolvedEvent = event || 'lead_confirmed';
    if (resolvedEvent === 'lead_confirmed') {
      const utmSource = await resolveCallUtmSource({ calendly_id, email });
      if (!isMetaSource(utmSource)) {
        console.log('[n8n-webhook] lead_confirmed skipped — not Meta source:', utmSource ?? null);
        return res.status(200).json({
          success: true,
          skipped: true,
          reason: 'not_meta_source',
          utm_source: utmSource ?? null,
        });
      }
    }

    // Pull the lead's click data from fbclid_tracking (lead_confirmed is a CRM
    // action with no inbound tracking block). Build a valid fbc from the stored
    // click time so Meta gets a correct creationTime, and use the LEAD's stored
    // IP — not getIpAddress(req), which is the closer's browser IP.
    let fbclid = null;
    let fbc = null;
    let leadIp = null;
    if (calendly_id) {
      try {
        const { data, error } = await supabase
          .from('fbclid_tracking')
          .select('fbclid, ip_address, created_at')
          .eq('calendly_event_uri', calendly_id)
          .maybeSingle();

        if (!error && data) {
          if (data.fbclid) fbclid = data.fbclid;
          if (data.ip_address) leadIp = data.ip_address;
          if (data.fbclid && data.created_at) {
            fbc = `fb.1.${new Date(data.created_at).getTime()}.${data.fbclid}`;
          }
        }
      } catch (dbError) {
        console.warn('⚠️ fbclid_tracking query error:', dbError.message);
      }
    }

    const webhookPayload = {
      event: resolvedEvent,
      calendly_id,
      email,
      phone,
      ...(fbc && { fbc }),
      ...(fbclid && { fbclid }),
      ip_address: leadIp || getIpAddress(req),
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    const data = await response.text();

    if (!response.ok) {
      console.error('❌ N8N webhook error:', response.status, data);
      return res.status(response.status).json({ error: 'Webhook request failed', details: data });
    }

    return res.status(200).json({ success: true, data, fbc_included: !!fbc, fbclid_included: !!fbclid });
  } catch (error) {
    console.error('❌ N8N webhook proxy error:', error);
    return res.status(500).json({ error: 'Failed to proxy webhook request', details: error.message });
  }
}
