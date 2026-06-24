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
 * Click data (fbc/fbclid/fbp/ip) should be passed straight from the SAME inbound
 * webhook payload (the lead's own `tracking` block) — that's guaranteed to be
 * this lead's click. Only when none is supplied do we fall back to a
 * fbclid_tracking lookup (used by the lead_confirmed CRM path, which has no
 * inbound tracking block). Prefer `fbc` (already a valid `fb.1.<clickTime>.<fbclid>`)
 * so Meta gets a correct creationTime and n8n never has to fabricate one.
 *
 * @param {object} args
 * @param {'lead'|'schedule'} args.event
 * @param {string|null} args.calendlyId  numeric iClosed event call id (joins fbclid_tracking.calendly_event_uri); null for pre-booking events
 * @param {string|null} args.email
 * @param {string|null} args.phone
 * @param {string|null} [args.fbc]    full Meta `_fbc` cookie value from the payload (preferred)
 * @param {string|null} [args.fbclid] raw fbclid from the payload
 * @param {string|null} [args.fbp]    Meta `_fbp` cookie value from the payload
 * @param {string|null} [args.ipAddress] lead IP from the payload (top-level ipAddress)
 * @param {string|null} [args.fallbackIp] legacy fallback IP
 * @returns {Promise<{event: string, sent: boolean, fbc_included: boolean, fbclid_included: boolean, error?: string}>}
 */
export async function sendFunnelEventToN8n({
  event,
  calendlyId,
  email,
  phone,
  fbc = null,
  fbclid = null,
  fbp = null,
  ipAddress = null,
  fallbackIp = null,
}) {
  const result = { event, sent: false, fbc_included: false, fbclid_included: false };

  // Nothing for Meta to match on — don't emit an empty event.
  if (!email && !phone && !calendlyId) {
    result.error = 'no_identifiers';
    return result;
  }

  try {
    // Prefer click data from the inbound payload (this lead's own click).
    let resolvedFbc = fbc || null;
    let resolvedFbclid = fbclid || null;
    let resolvedIp = ipAddress || fallbackIp || null;

    // Fallback ONLY when the caller supplied no click data (e.g. lead_confirmed).
    if (!resolvedFbc && !resolvedFbclid && calendlyId) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data, error } = await supabase
          .from('fbclid_tracking')
          .select('fbclid, ip_address, created_at')
          .eq('calendly_event_uri', String(calendlyId))
          .maybeSingle();

        if (error) {
          console.warn('[n8nAttribution] fbclid_tracking lookup error:', error.message);
        } else if (data) {
          if (data.fbclid) resolvedFbclid = data.fbclid;
          if (data.ip_address && !resolvedIp) resolvedIp = data.ip_address;
          // Build a valid fbc from the stored click time so the creationTime is
          // correct (fb.1.<clickTimeMs>.<fbclid>) instead of fabricated by n8n.
          if (data.fbclid && data.created_at) {
            resolvedFbc = `fb.1.${new Date(data.created_at).getTime()}.${data.fbclid}`;
          }
        }
      }
    }

    const payload = {
      event,
      calendly_id: calendlyId || null,
      email: email || null,
      phone: phone || null,
      ...(resolvedFbc && { fbc: resolvedFbc }),
      ...(resolvedFbclid && { fbclid: resolvedFbclid }),
      ...(fbp && { fbp }),
      ip_address: resolvedIp,
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    result.sent = response.ok;
    result.fbc_included = !!resolvedFbc;
    result.fbclid_included = !!resolvedFbclid;

    if (response.ok) {
      console.log(
        '[n8nAttribution] sent',
        event,
        JSON.stringify({
          calendly_id: payload.calendly_id,
          fbc_included: result.fbc_included,
          fbclid_included: result.fbclid_included,
        }),
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
