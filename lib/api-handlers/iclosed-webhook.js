// iClosed webhook receiver — qualified/potential contacts (not yet booked).
//
// Flow:
//   1. Always log raw payload to iclosed_webhook_logs.
//   2. Extract contact fields defensively (iClosed payload shape may vary;
//      mapping is configurable via env QUALIFIED_STATUS_VALUES and the
//      pickField helper supports several common field paths).
//   3. Only act when the contact status is in the qualified/potential set.
//   4. Idempotent UPSERT on iclosed_contact_id.
//   5. If new row, assign:
//      a. setter currently on shift, else
//      b. next-scheduled setter (within 72h), else
//      c. leave unassigned.
//
// Required env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// Optional env: ICLOSED_QUALIFIED_STATUSES (comma list, default below)

import { createClient } from '@supabase/supabase-js';
import { getCurrentSetterOnShift, getNextScheduledSetter } from '../setterOnShift.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
);

// Confirmed against a real iClosed export (Scheduling status column):
//   POTENTIAL, QUALIFIED               → treat as potential lead
//   STRATEGY_CALL_BOOKED, BOOKED, etc. → already in pipeline, skip
const DEFAULT_QUALIFIED = [
  'potential',
  'qualified',
  // historical / future-proofing
  'lead_qualified',
  'qualified_lead',
  'mql',
  'sql',
];

// Statuses that mean "already booked" — explicitly excluded even if a future
// payload variant accidentally tags them as qualified.
const ALREADY_BOOKED_STATUSES = new Set([
  'strategy_call_booked',
  'discovery_call_booked',
  'call_booked',
  'booked',
]);

function getQualifiedStatusSet() {
  const raw = process.env.ICLOSED_QUALIFIED_STATUSES || '';
  const fromEnv = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(fromEnv.length ? fromEnv : DEFAULT_QUALIFIED);
}

/** Walk an object by dotted path. Returns undefined on miss. */
function get(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

/** Returns first non-empty string among the candidate paths. */
function pickField(payload, paths) {
  for (const p of paths) {
    const v = get(payload, p);
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/**
 * Defensive extraction. Field paths reflect the real iClosed export columns
 * (Global Data – contacts xlsx) plus common webhook-payload variants:
 *   Contact                    → email
 *   First Name / Last Name     → name
 *   Phone Number               → phone
 *   Scheduling status          → status (POTENTIAL / QUALIFIED / STRATEGY_CALL_BOOKED…)
 *   UTM Source                 → source
 *   Country / Time zone / UTM* / Current Closer Owner / Last Interaction Type
 *   No. of strategy calls / No. of discovery calls
 */
function extractContact(body) {
  // The webhook may wrap data as { event, data } or { event, payload } or send raw.
  const payload =
    body?.data ?? body?.payload ?? body?.contact ?? body ?? {};
  const event = body?.event || body?.type || body?.event_type || null;

  // iClosed export has no separate contact-id column — email IS the identity.
  // Webhook payloads may still send an id, so prefer it when present.
  const contactId =
    pickField(payload, [
      'id',
      'contact_id',
      'iclosed_contact_id',
      'uuid',
      'contact.id',
    ]) ||
    // fallback: lowercase email as stable dedup key
    (() => {
      const e = pickField(payload, [
        'email',
        'Contact',
        'contact_email',
        'contact.email',
      ]);
      return e ? e.toLowerCase() : null;
    })();

  // Primary actionable status is "Scheduling status"
  const status = pickField(payload, [
    'scheduling_status',
    'Scheduling status',
    'schedulingStatus',
    'status',
    'contact_status',
    'stage',
    'contact_stage',
    'Contact Stage',
    'lifecycle_stage',
    'contact.status',
  ]);

  const firstName = pickField(payload, [
    'first_name', 'firstName', 'First Name', 'contact.first_name',
  ]);
  const lastName = pickField(payload, [
    'last_name', 'lastName', 'Last Name', 'contact.last_name',
  ]);
  const composedName =
    pickField(payload, ['name', 'full_name', 'contact_name', 'contact.name']) ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    null;

  const email = pickField(payload, [
    'email', 'Contact', 'contact_email', 'contact.email',
  ]);
  const phone = pickField(payload, [
    'phone', 'phone_number', 'Phone Number', 'phoneNumber',
    'contact.phone', 'contact_phone',
  ]);

  // UTM source preferred; fall back to general source / lead_source
  const source = pickField(payload, [
    'utm_source', 'UTM Source', 'utmSource',
    'source', 'lead_source', 'contact.source',
  ]);

  // Pull a few extras into metadata explicitly so they're easy to read.
  const enrichedMeta = {
    ...payload,
    _normalized: {
      first_name: firstName,
      last_name: lastName,
      country: pickField(payload, ['country', 'Country']),
      timezone: pickField(payload, ['time_zone', 'timezone', 'Time zone']),
      utm_campaign: pickField(payload, ['utm_campaign', 'UTM Campaign']),
      utm_medium: pickField(payload, ['utm_medium', 'UTM Medium']),
      utm_content: pickField(payload, ['utm_content', 'UTM Content']),
      utm_term: pickField(payload, ['utm_term', 'UTM Term']),
      current_closer_owner: pickField(payload, [
        'current_closer_owner', 'Current Closer Owner', 'closer_owner',
      ]),
      last_interaction_type: pickField(payload, [
        'last_interaction_type', 'Last Interaction Type',
      ]),
      no_of_strategy_calls: pickField(payload, [
        'no_of_strategy_calls', 'No. of strategy calls', 'strategy_calls_count',
      ]),
      no_of_discovery_calls: pickField(payload, [
        'no_of_discovery_calls', 'No. of discovery calls', 'discovery_calls_count',
      ]),
      initial_scheduling_status: pickField(payload, [
        'initial_scheduling_status', 'Initial Scheduling Status',
      ]),
      ip_address: pickField(payload, ['ip_address', 'IP Address']),
      contact_creation_date: pickField(payload, [
        'contact_creation_date', 'Contact Creation Date', 'created_at',
      ]),
      status_last_modified_at: pickField(payload, [
        'status_last_modified_at', 'Status last modified at', 'updated_at', 'Updated on',
      ]),
    },
  };

  return {
    event,
    contactId,
    status,
    name: composedName,
    email,
    phone,
    source,
    metadata: enrichedMeta,
  };
}

async function logWebhook(row) {
  try {
    await supabase.from('iclosed_webhook_logs').insert([row]);
  } catch (err) {
    console.error('[iclosed-webhook] log insert failed', err);
  }
}

async function assignSetter() {
  // a) currently on shift
  const current = await getCurrentSetterOnShift(new Date());
  if (current) {
    return {
      assigned_setter_id: current.id,
      assignment_reason: 'on_shift',
      assigned_at: new Date().toISOString(),
      scheduled_handoff_at: null,
    };
  }
  // b) next scheduled within 72h
  const next = await getNextScheduledSetter(new Date(), 72);
  if (next) {
    return {
      assigned_setter_id: next.id,
      assignment_reason: 'next_scheduled',
      assigned_at: new Date().toISOString(),
      scheduled_handoff_at: next.scheduled_for || null,
    };
  }
  // c) unassigned
  return {
    assigned_setter_id: null,
    assignment_reason: 'unassigned',
    assigned_at: null,
    scheduled_handoff_at: null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let raw = req.body || {};
  let extracted = null;

  try {
    extracted = extractContact(raw);

    // Always log the inbound webhook first.
    await logWebhook({
      event: extracted.event,
      status_in: extracted.status,
      payload: extracted.metadata,
      raw_body: raw,
      process: 'received',
    });

    // Decide if this status counts as qualified/potential.
    const qualifiedSet = getQualifiedStatusSet();
    const statusLower = (extracted.status || '').toLowerCase();

    // 1) Explicit "already booked" guard — never enters potential leads.
    if (ALREADY_BOOKED_STATUSES.has(statusLower)) {
      await logWebhook({
        event: extracted.event,
        status_in: extracted.status,
        process: 'skipped',
        result: { reason: 'already_booked', received: extracted.status },
      });
      return res.status(200).json({
        received: true,
        skipped: true,
        reason: 'already_booked',
        status: extracted.status,
      });
    }

    // 2) Must be in the qualified set.
    const isQualified = statusLower && qualifiedSet.has(statusLower);
    if (!isQualified) {
      await logWebhook({
        event: extracted.event,
        status_in: extracted.status,
        process: 'skipped',
        result: { reason: 'status_not_qualified', received: extracted.status },
      });
      return res.status(200).json({
        received: true,
        skipped: true,
        reason: 'status_not_qualified',
        status: extracted.status,
      });
    }

    if (!extracted.contactId) {
      // Without an ID we can't dedupe. Still process but warn.
      console.warn('[iclosed-webhook] no contactId in payload; inserting without dedupe key');
    }

    // Idempotent path: see if we already have this contact.
    let existing = null;
    if (extracted.contactId) {
      const { data: found } = await supabase
        .from('potential_leads')
        .select('id, status, assigned_setter_id')
        .eq('iclosed_contact_id', extracted.contactId)
        .maybeSingle();
      existing = found || null;
    }

    if (existing) {
      // Update non-destructively: refresh status/contact info, leave assignment + CRM status alone.
      const updates = {
        iclosed_status: extracted.status,
        name: extracted.name,
        email: extracted.email,
        phone: extracted.phone,
        source: extracted.source,
        metadata: extracted.metadata,
        raw_payload: raw,
      };
      const { error: upErr } = await supabase
        .from('potential_leads')
        .update(updates)
        .eq('id', existing.id);

      if (upErr) {
        await logWebhook({
          event: extracted.event,
          status_in: extracted.status,
          process: 'error',
          error: upErr.message,
          result: { potential_lead_id: existing.id, op: 'update' },
        });
        return res.status(200).json({ received: true, error: upErr.message });
      }

      await logWebhook({
        event: extracted.event,
        status_in: extracted.status,
        process: 'updated',
        result: { potential_lead_id: existing.id },
      });
      return res.status(200).json({
        received: true,
        potential_lead_id: existing.id,
        action: 'updated',
      });
    }

    // New row — assign and insert.
    const assignment = await assignSetter();
    const insertRow = {
      iclosed_contact_id: extracted.contactId,
      iclosed_status: extracted.status,
      name: extracted.name,
      email: extracted.email,
      phone: extracted.phone,
      source: extracted.source,
      metadata: extracted.metadata,
      raw_payload: raw,
      status: 'new',
      ...assignment,
    };

    const { data: inserted, error: insErr } = await supabase
      .from('potential_leads')
      .insert([insertRow])
      .select('id')
      .single();

    if (insErr) {
      await logWebhook({
        event: extracted.event,
        status_in: extracted.status,
        process: 'error',
        error: insErr.message,
        result: { op: 'insert' },
      });
      return res.status(200).json({ received: true, error: insErr.message });
    }

    await logWebhook({
      event: extracted.event,
      status_in: extracted.status,
      process: 'created',
      result: {
        potential_lead_id: inserted.id,
        assigned_setter_id: assignment.assigned_setter_id,
        assignment_reason: assignment.assignment_reason,
      },
    });

    return res.status(200).json({
      received: true,
      potential_lead_id: inserted.id,
      action: 'created',
      assignment_reason: assignment.assignment_reason,
      assigned_setter_id: assignment.assigned_setter_id,
    });
  } catch (err) {
    console.error('[iclosed-webhook] uncaught error', err);
    await logWebhook({
      event: extracted?.event ?? null,
      status_in: extracted?.status ?? null,
      raw_body: raw,
      process: 'error',
      error: err.message,
    });
    // Always 200 so iClosed doesn't retry-storm; we've logged it.
    return res.status(200).json({ received: true, error: err.message });
  }
}
