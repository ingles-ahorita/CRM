import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function sha256(value) {
  if (!value) return undefined;
  return crypto
    .createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { calendly_id, email, phone } = req.body;

    if (!calendly_id) {
      return res.status(400).json({ error: 'calendly_id is required' });
    }

    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
    const PIXEL_ID = process.env.META_PIXEL_ID;

    // 1. Find fbclid using Calendly event URI
    let fbclid = null;

    const { data } = await supabase
      .from('fbclid_tracking')
      .select('fbclid')
      .eq('calendly_event_uri', calendly_id)
      .maybeSingle();

    if (data?.fbclid) {
      fbclid = data.fbclid;
    }

    // 2. Build user data for Meta
    const user_data = {};

    if (email) user_data.em = sha256(email);
    if (phone) user_data.ph = sha256(phone);
    if (fbclid) user_data.fbclid = fbclid;

    // 3. Standard CAPI event payload
    const metaPayload = {
      data: [
        {
          event_name: "confirmed_lead",   // standard event name
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          user_data
        }
      ],
      access_token: ACCESS_TOKEN
    };

    const url = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload)
    });

    const result = await response.json();

    return res.status(200).json({
      success: true,
      meta_response: result
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}