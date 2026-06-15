// Meta funnel events (lead / schedule) → n8n → Meta CAPI.
//
// Best-effort by design: this must never throw and never affect webhook
// processing — failures are logged and returned in the result summary only.
// The "lead_confirmed" event is sent separately by lib/api-handlers/n8n-webhook.js
// (manual CRM confirm); keep the payload shape in sync with it.

import { getSupabaseAdmin } from './getSupabaseAdmin.js';

const WEBHOOK_URL = 'https://inglesahorita.app.n8n.cloud/webhook/1b560f1a-d0e7-4695-a15b-6501c47aa101';

// Hard cap on the n8n call so a hung n8n can never stall webhook processing
// past the platform function timeout (the send is best-effort; the webhook isn't).
const SEND_TIMEOUT_MS = 5000;

/**
 * Send a funnel event to the n8n Meta CAPI workflow.
 *
 * @param {object} args
 * @param {'lead'|'schedule'} args.event
 * @param {string|null} args.calendlyId  numeric iClosed event call id (joins fbclid_tracking.calendly_event_uri); null for pre-booking events
 * @param {string|null} args.email
 * @param {string|null} args.phone
 * @param {string|null} [args.fallbackIp]  lead IP from the webhook payload, used when no fbclid_tracking row matches
 * @returns {Promise<{event: string, sent: boolean, fbclid_included: boolean, error?: string}>}
 */
export async function sendFunnelEventToN8n({ event, calendlyId, email, phone, fallbackIp = null, fbp = null }) {
  const result = { event, sent: false, fbclid_included: false };

  // Nothing for Meta to match on — don't emit an empty event.
  if (!email && !phone && !calendlyId) {
    result.error = 'no_identifiers';
    return result;
  }

  try {
    let fbclid = null;
    let ipAddress = fallbackIp || null;

    const supabase = getSupabaseAdmin();
    if (supabase && calendlyId) {
      const { data, error } = await supabase
        .from('fbclid_tracking')
        .select('fbclid, ip_address')
        .eq('calendly_event_uri', String(calendlyId))
        .maybeSingle();

      if (error) {
        console.warn('[n8nAttribution] fbclid_tracking lookup error:', error.message);
      } else if (data) {
        if (data.fbclid) fbclid = data.fbclid;
        if (data.ip_address) ipAddress = data.ip_address;
      }
    }

    const payload = {
      event,
      calendly_id: calendlyId || null,
      email: email || null,
      phone: phone || null,
      ...(fbclid && { fbclid }),
      ...(fbp && { fbp }),
      ip_address: ipAddress,
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    result.sent = response.ok;
    result.fbclid_included = !!fbclid;

    if (response.ok) {
      console.log(
        '[n8nAttribution] sent',
        event,
        JSON.stringify({ calendly_id: payload.calendly_id, fbclid_included: result.fbclid_included }),
      );
    } else {
      const text = await response.text();
      result.error = `n8n responded ${response.status}`;
      console.error('[n8nAttribution]', event, 'webhook failed:', response.status, text);
    }
  } catch (err) {
    result.error = err.message;
    console.error('[n8nAttribution]', event, 'send error:', err.message);
  }

  return result;
}