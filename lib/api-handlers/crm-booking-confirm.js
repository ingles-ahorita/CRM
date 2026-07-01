// lib/api-handlers/crm-booking-confirm.js
//
// Called by a Supabase database webhook (pg_net) when a row is INSERTed into
// `calls` with booking_origin ~ 'true' (a CRM booking made by a setter via the
// Edit Lead modal). It fires the ManyChat confirm side-effect server-side.
//
// The picked_up / confirmed flags are set by the BEFORE INSERT DB trigger
// (see supabase/migrations/*_calls_crm_autoconfirm.sql), NOT here — so a
// ManyChat failure never loses the confirmation. Failures are recorded in
// function_errors for traceback.

import { createClient } from '@supabase/supabase-js';
import { confirmCallManychat } from '../manychat/confirmCall.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const CALL_SELECT =
  'id, name, email, phone, timezone, call_link, call_date, calendly_id, ' +
  'closer_id, setter_id, manychat_user_id, closer_mc_id, booking_origin, ' +
  'closers (id, name, mc_api_key), setters (id, name)';

/** Case-insensitive "booked through CRM" gate — matches the LT5 booking_origin check. */
function isCrmBooked(origin) {
  return String(origin ?? '').trim().toLowerCase() === 'true';
}

/** Best-effort traceable log to the existing function_errors table. Never throws. */
async function logFunctionError({ call, recordId, error, stage }) {
  try {
    const closerName = call?.closers?.name;
    const summary =
      `[${stage || 'ERROR'}] crmBookingAutoConfirm — ` +
      `call ${call?.id ?? recordId ?? 'n/a'}, ${call?.name || 'no-name'}, ` +
      `${call?.phone || 'no-phone'}, closer ${closerName || call?.closer_id || 'n/a'}` +
      (error ? `: ${error?.message || String(error)}` : '');

    const details = {
      callId: call?.id ?? recordId ?? null,
      leadName: call?.name ?? null,
      phone: call?.phone ?? null,
      closerId: call?.closer_id ?? null,
      closerName: closerName ?? null,
      stage: stage ?? null,
      manychatDebug: error?.debug ?? undefined,
      stack: error ? error?.stack || String(error) : undefined,
    };

    await supabase.from('function_errors').insert({
      function_name: 'crmBookingAutoConfirm',
      error_message: summary.slice(0, 1000),
      error_details: JSON.stringify(details),
      source: 'crm-booking-confirm',
    });
  } catch (e) {
    console.error('[crm-booking-confirm] failed to log function_errors:', e?.message || e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!supabase) {
    console.error('[crm-booking-confirm] Supabase env not configured');
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  // 1) Auth — shared secret sent by the DB webhook.
  const secret = process.env.CRM_BOOKING_HOOK_SECRET;
  const provided = req.headers['x-crm-hook-secret'];
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2) Extract the inserted row from the webhook payload.
  const body = req.body || {};
  const record = body.record || body.new || body;
  const recordId = record?.id;
  if (!recordId) {
    return res.status(200).json({ ok: true, skipped: 'no-record-id' });
  }

  // 3) Gate (defense-in-depth; the trigger already filters to booking_origin~'true').
  if (!isCrmBooked(record.booking_origin)) {
    return res.status(200).json({ ok: true, skipped: 'not-crm-booked' });
  }

  // 4) Hydrate the call with closer + setter joins (needed for ManyChat).
  let call = null;
  try {
    const { data, error } = await supabase
      .from('calls')
      .select(CALL_SELECT)
      .eq('id', recordId)
      .single();
    if (error) throw error;
    call = data;
  } catch (error) {
    await logFunctionError({ call: { id: recordId }, recordId, error, stage: 'load' });
    return res.status(200).json({ ok: false, logged: true, stage: 'load' });
  }

  if (!call || !isCrmBooked(call.booking_origin)) {
    return res.status(200).json({ ok: true, skipped: 'gate-recheck' });
  }

  // 5) Idempotency — closer_mc_id set means it was already confirmed/synced
  //    (manual flow or a prior run). Skip so ManyChat/n8n never double-fire.
  if (call.closer_mc_id) {
    return res.status(200).json({ ok: true, skipped: 'already-synced' });
  }

  // 6) ManyChat confirm. Flags are already set by the DB trigger.
  try {
    const result = await confirmCallManychat(call, { supabase });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    await logFunctionError({ call, recordId, error, stage: 'manychat' });
    return res.status(200).json({ ok: false, logged: true, stage: 'manychat' });
  }
}
