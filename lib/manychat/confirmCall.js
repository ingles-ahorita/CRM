// lib/manychat/confirmCall.js
//
// Server-side port of the frontend "ManyChat-first" confirm sequence
// (src/utils/confirmLeadFlow.js). Used by the CRM auto-confirm hook so a
// setter's CRM booking fires the SAME ManyChat side-effect the manual
// /setter confirm toggle sends — but without a browser open.
//
// It reuses the existing /api/manychat endpoint verbatim (no edits there),
// exactly like lib/api-handlers/create-calendar-event.js already does.

// FIELD_MAP.confirmed from src/utils/manychatService.js (owner bot).
const OWNER_CONFIRMED_FIELD_ID = 13312466;

function apiBase() {
  return process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function postManychat(payload) {
  const res = await fetch(`${apiBase()}/api/manychat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Mirror of buildCloserMcFields() in src/utils/confirmLeadFlow.js so the closer
 * bot receives byte-for-byte the same custom fields as the manual flow.
 */
export function buildCloserMcFields(call) {
  const tz = call?.timezone || 'UTC';
  return [
    { name: 'SETTER', value: call?.setters?.name },
    { name: 'CLOSER', value: call?.closers?.name },
    { name: 'CALL LINK', value: call?.call_link },
    {
      name: 'DATE (LEAD TZ)',
      value: call?.call_date
        ? new Date(call.call_date).toLocaleDateString('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        : '',
    },
    {
      name: 'CALL TIME (LEAD TZ)',
      value: call?.call_date
        ? new Date(call.call_date).toLocaleTimeString('en-US', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
    },
    { name: 'call_date', value: call?.call_date },
  ];
}

/**
 * Resolve the subscriber in the closer's ManyChat bot. Reuses closer_mc_id when
 * present, otherwise creates/finds by phone (create-user handles the
 * "already exists → find" fallback internally; we add an explicit find as the
 * frontend sendToCloserMC does).
 */
async function resolveCloserSubscriber(call) {
  if (call?.closer_mc_id) return String(call.closer_mc_id);

  const apiKey = call?.closers?.mc_api_key;
  const name = call?.name;
  const phone = call?.phone;
  if (!apiKey) throw new Error('no api key for closer');
  if (!name || !phone) throw new Error('Name and phone are required to create ManyChat user');

  const parts = String(name).trim().split(/\s+/);
  const first_name = parts[0] || '';
  const last_name = parts.slice(1).join(' ') || '';

  const create = await postManychat({
    action: 'create-user',
    apiKey,
    first_name,
    last_name,
    whatsapp_phone: phone,
  });
  if (create.ok && create.data?.subscriberId) return String(create.data.subscriberId);

  const find = await postManychat({
    action: 'find-user-by-phone',
    apiKey,
    whatsapp_phone: phone,
  });
  if (find.ok && find.data?.subscriberId) return String(find.data.subscriberId);

  const err = new Error(
    find.data?.error || create.data?.error || 'Subscriber ID not returned from API',
  );
  err.debug = find.data?.debug || create.data?.debug;
  throw err;
}

/**
 * Run the confirm ManyChat sequence for a hydrated calls row. Mirrors
 * confirmLead(): closer-bot subscriber + fields, persist closer_mc_id, owner-bot
 * confirmed=true, then the n8n lead_confirmed webhook.
 *
 * Note: calls.picked_up / calls.confirmed are set by the DB trigger, not here.
 *
 * @param {object} call - calls row joined with closers(name, mc_api_key), setters(name)
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient }} deps
 * @returns {Promise<{ subscriberId: string, setFieldsOk: boolean, ownerSynced: boolean }>}
 * @throws when the closer-bot subscriber cannot be resolved (caller logs it)
 */
export async function confirmCallManychat(call, { supabase } = {}) {
  // 1) Closer bot: resolve subscriber, then set the call fields.
  const subscriberId = await resolveCloserSubscriber(call);

  const setRes = await postManychat({
    action: 'set-fields-by-name',
    subscriberId,
    fieldsByName: buildCloserMcFields(call),
    apiKey: call?.closers?.mc_api_key,
  });
  // set-fields is best-effort in the manual flow too (its errors are swallowed).

  // 2) Persist closer_mc_id — the idempotency marker for this hook.
  if (supabase && subscriberId && !call?.closer_mc_id) {
    const { error } = await supabase
      .from('calls')
      .update({ closer_mc_id: String(subscriberId) })
      .eq('id', call.id);
    if (error) console.warn('[crm-booking-confirm] failed to store closer_mc_id:', error.message);
  }

  // 3) Owner bot: set confirmed=true (default owner key applied by /api/manychat).
  let ownerSynced = false;
  if (call?.manychat_user_id) {
    const ownerRes = await postManychat({
      subscriberId: String(call.manychat_user_id),
      fieldId: OWNER_CONFIRMED_FIELD_ID,
      value: true,
    });
    ownerSynced = ownerRes.ok;
    if (!ownerRes.ok) {
      console.warn('[crm-booking-confirm] owner-bot confirmed update failed:', ownerRes.data?.error);
    }
  }

  // 4) n8n lead_confirmed webhook — best-effort, never throws.
  try {
    await fetch(`${apiBase()}/api/n8n-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'lead_confirmed',
        calendly_id: call?.calendly_id,
        email: call?.email,
        phone: call?.phone,
      }),
    });
  } catch (e) {
    console.warn('[crm-booking-confirm] n8n webhook error:', e?.message || e);
  }

  return { subscriberId: String(subscriberId), setFieldsOk: setRes.ok, ownerSynced };
}
