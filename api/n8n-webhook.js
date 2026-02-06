import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const WEBHOOK_URL = 'https://inglesahorita.app.n8n.cloud/webhook/1b560f1a-d0e7-4695-a15b-6501c47aa101';

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

    let fbclid = null;
    if (calendly_id) {
      try {
        const { data, error } = await supabase
          .from('fbclid_tracking')
          .select('fbclid')
          .eq('calendly_event_uri', calendly_id)
          .maybeSingle();

        if (!error && data?.fbclid) {
          fbclid = data.fbclid;
        }
      } catch (dbError) {
        console.warn('⚠️ fbclid_tracking query error:', dbError.message);
      }
    }

    const webhookPayload = {
      event: event || 'lead_confirmed',
      calendly_id,
      email,
      phone,
      ...(fbclid && { fbclid }),
      ip_address: getIpAddress(req),
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

    return res.status(200).json({ success: true, data, fbclid_included: !!fbclid });
  } catch (error) {
    console.error('❌ N8N webhook proxy error:', error);
    return res.status(500).json({ error: 'Failed to proxy webhook request', details: error.message });
  }
}
