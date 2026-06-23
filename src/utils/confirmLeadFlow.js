// confirmLeadFlow.js
//
// Shared "ManyChat-first" confirm sequence used when a lead's Confirmed status
// is set to YES. The contract is intentionally strict so the frontend never
// shows "confirmed" unless the underlying writes actually succeeded:
//
//   1. ManyChat sync (create/find the subscriber in the closer's bot) MUST
//      succeed first  — UNLESS dbOnly is passed (explicit user override).
//   2. Only then is calls.confirmed written to the DB.
//   3. The caller updates the frontend value only after this resolves ok.
//
// On any failure this throws an enriched error: { stage, code, reason,
// phone, subscriberId?, debug? } so the caller can open a retry modal with a
// plain-language reason and (for DB-stage failures) reuse the subscriberId on
// retry instead of re-hitting ManyChat.

import { supabase } from '../lib/supabaseClient';
import { sendToCloserMC } from './manychatService';

/**
 * Build the ManyChat custom-field payload from a lead/call row.
 * Mirrors the inline payload that previously lived in LeadItem / CloserTodaysLeads
 * so behavior is byte-for-byte identical.
 */
export function buildCloserMcFields(lead) {
  const tz = lead?.timezone || 'UTC';
  return [
    { name: 'SETTER', value: lead?.setters?.name },
    { name: 'CLOSER', value: lead?.closers?.name },
    { name: 'CALL LINK', value: lead?.call_link },
    {
      name: 'DATE (LEAD TZ)',
      value: lead?.call_date
        ? new Date(lead.call_date).toLocaleDateString('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        : '',
    },
    {
      name: 'CALL TIME (LEAD TZ)',
      value: lead?.call_date
        ? new Date(lead.call_date).toLocaleTimeString('en-US', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
    },
    { name: 'call_date', value: lead?.call_date },
  ];
}

/**
 * Map a raw ManyChat/network error to a stable code + a short, setter-friendly
 * reason. Codes drive UI behavior (e.g. whether to show the editable phone field).
 */
export function classifyManychatError(err) {
  const msg = (err?.message || String(err || '')).toLowerCase();

  if (/failed to fetch|networkerror|network request failed|load failed/.test(msg)) {
    return {
      code: 'NETWORK',
      reason:
        "Couldn't reach ManyChat (connection issue). Check your connection and retry.",
    };
  }
  if (/no api key|missing.*apikey|apikey/.test(msg)) {
    return {
      code: 'NO_API_KEY',
      reason:
        "This closer has no ManyChat connected. Ask an admin to add their ManyChat key in Users.",
    };
  }
  if (/name and phone are required|whatsapp_phone/.test(msg)) {
    return {
      code: 'NO_PHONE',
      reason: "This lead has no phone number, so ManyChat can't be updated.",
    };
  }
  if (/401|403|unauthor|api key|rejected the request/.test(msg)) {
    return {
      code: 'AUTH',
      reason:
        "This closer's ManyChat key looks invalid. Ask an admin to update it in Users.",
    };
  }
  if (/phone field not found/.test(msg)) {
    return {
      code: 'PHONE_FIELD_MISSING',
      reason:
        "This closer's ManyChat has no phone field configured. Ask an admin to check the bot setup.",
    };
  }
  if (/subscriber not found|subscriber id not (found|returned)|failed to create or find|already exists/.test(msg)) {
    return {
      code: 'PHONE_NOT_FOUND',
      reason:
        "This number may not be on WhatsApp, so ManyChat couldn't add the contact. Fix the number and retry, or confirm without ManyChat.",
    };
  }
  return {
    code: 'UNKNOWN',
    reason:
      (err?.message ? `ManyChat update failed: ${err.message}` : 'ManyChat update failed.') +
      ' You can retry or confirm without ManyChat.',
  };
}

function dbErrorReason(error, noRows) {
  const message = error?.message || '';
  if (noRows) {
    return 'Could not save Confirmed — no rows updated (check your permissions).';
  }
  if (/permission|rls|policy/i.test(message)) {
    return 'You do not have permission to update Confirmed for this call.';
  }
  return message ? `Could not save Confirmed: ${message}` : 'Could not save Confirmed in the CRM.';
}

/**
 * Write a rich, traceable row to function_errors WITHOUT requiring a schema
 * change — everything goes into the existing error_message / error_details
 * text columns. error_message carries an at-a-glance summary; error_details
 * carries structured JSON (including the ManyChat debug.steps when available).
 */
export async function logConfirmError({ lead, stage, code, error, source, phoneTried, debug, note }) {
  try {
    const closerName = lead?.closers?.name;
    const summary =
      `[${code || 'UNKNOWN'}] confirmLead/${stage} — ` +
      `call ${lead?.id ?? 'n/a'}, ${lead?.name || 'no-name'}, ` +
      `${phoneTried || lead?.phone || 'no-phone'}, ` +
      `closer ${closerName || lead?.closer_id || 'n/a'}` +
      (note ? ` — ${note}` : '') +
      (error ? `: ${error?.message || String(error)}` : '');

    const details = {
      callId: lead?.id ?? null,
      leadName: lead?.name ?? null,
      phone: lead?.phone ?? null,
      phoneTried: phoneTried && phoneTried !== lead?.phone ? phoneTried : undefined,
      closerId: lead?.closer_id ?? null,
      closerName: closerName ?? null,
      stage,
      errorCode: code ?? null,
      manychatDebug: debug ?? error?.debug ?? undefined,
      note: note ?? undefined,
      stack: error ? error?.stack || String(error) : undefined,
    };

    await supabase.from('function_errors').insert({
      function_name: 'sendToCloserMC',
      error_message: summary.slice(0, 1000),
      error_details: JSON.stringify(details),
      source: source || 'confirmLeadFlow',
    });
  } catch (e) {
    console.error('[confirmLeadFlow] failed to log function_errors:', e);
  }
}

/**
 * Fire the n8n lead_confirmed webhook. Best-effort; never throws.
 */
export async function fireLeadConfirmedWebhook(lead) {
  try {
    await fetch('/api/n8n-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'lead_confirmed',
        calendly_id: lead?.calendly_id,
        email: lead?.email,
        phone: lead?.phone,
      }),
    });
  } catch (webhookError) {
    console.error('[confirmLeadFlow] n8n webhook error:', webhookError);
  }
}

/**
 * Core confirm sequence.
 *
 * @param {Object} lead - call/lead row (must include id, phone, closers.mc_api_key, setters, closers)
 * @param {Object} opts
 * @param {string} [opts.phoneOverride]      - phone the user corrected in the retry modal
 * @param {string} [opts.cachedSubscriberId] - reuse a subscriber id from a prior successful ManyChat step (DB-retry)
 * @param {boolean} [opts.dbOnly]            - explicit override: confirm in DB only, skip ManyChat
 * @param {string} [opts.source]             - source label for function_errors
 * @returns {Promise<{ ok:true, mcSynced:boolean, subscriberId?:string }>}
 * @throws  {{ stage, code, reason, phone, subscriberId?, debug? }}
 */
export async function confirmLead(lead, { phoneOverride, cachedSubscriberId, dbOnly, source } = {}) {
  const callId = lead?.id;
  const phone = phoneOverride || lead?.phone;

  if (!callId) {
    throw { stage: 'db', code: 'NO_ID', reason: 'Missing lead id — cannot confirm.', phone };
  }

  // ── Explicit DB-only override ────────────────────────────────────────────
  if (dbOnly) {
    const { data, error } = await supabase
      .from('calls')
      .update({ confirmed: true })
      .eq('id', callId)
      .select('id');
    if (error || !data || data.length === 0) {
      const reason = dbErrorReason(error, !error);
      await logConfirmError({ lead, stage: 'db-only', code: 'DB', error: error || new Error('no rows'), source, phoneTried: phone });
      throw { stage: 'db', code: 'DB', reason, phone };
    }
    // Audit trail: confirmed without ManyChat sync, by user choice.
    await logConfirmError({
      lead,
      stage: 'db-only-success',
      code: 'DB_ONLY',
      error: null,
      source,
      phoneTried: phone,
      note: 'Confirmed in DB without ManyChat sync (user override)',
    });
    return { ok: true, mcSynced: false };
  }

  // ── Step A: ManyChat (skip if we already have a subscriber id) ────────────
  let subscriberId = cachedSubscriberId || null;
  if (!subscriberId) {
    try {
      const mcResult = await sendToCloserMC({
        id: callId,
        name: lead?.name,
        phone,
        apiKey: lead?.closers?.mc_api_key,
        fieldsToSet: buildCloserMcFields(lead),
      });
      subscriberId = mcResult?.subscriberId;
      if (!subscriberId) {
        throw new Error('Subscriber ID not returned from API');
      }
    } catch (rawErr) {
      const { code, reason } = classifyManychatError(rawErr);
      await logConfirmError({ lead, stage: 'manychat', code, error: rawErr, source, phoneTried: phone, debug: rawErr?.debug });
      throw { stage: 'manychat', code, reason, phone, debug: rawErr?.debug };
    }
  }

  // ── Step B: DB write (confirmed + closer_mc_id together) ──────────────────
  const { data, error } = await supabase
    .from('calls')
    .update({ confirmed: true, closer_mc_id: String(subscriberId) })
    .eq('id', callId)
    .select('id');
  if (error || !data || data.length === 0) {
    const reason = dbErrorReason(error, !error);
    await logConfirmError({ lead, stage: 'db', code: 'DB', error: error || new Error('no rows'), source, phoneTried: phone });
    // Surface subscriberId so a retry can skip the ManyChat step.
    throw { stage: 'db', code: 'DB', reason, phone, subscriberId: String(subscriberId) };
  }

  return { ok: true, mcSynced: true, subscriberId: String(subscriberId) };
}
