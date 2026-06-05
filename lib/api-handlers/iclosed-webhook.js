/* global process, Buffer */
// iClosed webhook receiver — Potential / Qualified contacts; booked statuses update rows in place (not deleted).
//
// iClosed lead statuses (docs): Potential, Qualified, Disqualified,
// Strategy call booked, Discovery call booked.
//
// Required env: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)
// Optional env:
//   ICLOSED_WEBHOOK_SECRET — HMAC verification (see verifyIclosedSignature)
//   ICLOSED_QUALIFIED_STATUSES — comma list overriding which statuses ingest (default: potential,qualified)
//   ICLOSED_SLA_CRON_SECRET — auth for /api/iclosed-potential-lead-sla-cron (see discordNotify.js)

import crypto from 'crypto';
import { getSupabaseAdmin } from '../getSupabaseAdmin.js';
import {
  ICLOSED_STATUS,
  ICLOSED_BOOKED_STATUSES,
  ICLOSED_INGEST_STATUSES,
  normalizeIclosedStatus,
  rowIclosedStatus,
} from '../iclosedLeadStatus.js';
import { getCurrentSetterOnShift, getNextScheduledSetter } from '../setterOnShift.js';

export { ICLOSED_STATUS, normalizeIclosedStatus };

const supabase = getSupabaseAdmin();

function getIngestStatusSet() {
  const raw = process.env.ICLOSED_QUALIFIED_STATUSES || '';
  const fromEnv = raw
    .split(',')
    .map((part) => normalizeIclosedStatus(part.trim()))
    .filter(Boolean);
  return new Set(fromEnv.length ? fromEnv : ICLOSED_INGEST_STATUSES);
}

function get(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function pickField(payload, paths) {
  for (const p of paths) {
    const v = get(payload, p);
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function resolvePayload(body) {
  if (!body || typeof body !== 'object') return {};
  return (
    get(body, 'data.contact') ||
    body?.contact ||
    body?.data ||
    body?.payload ||
    body
  );
}

function collectManualCrmMetadata(value, depth = 0, acc = {}) {
  if (depth > 8 || value == null) return acc;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'manual_crm') acc.booking_origin = 'manual_crm';
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        collectManualCrmMetadata(JSON.parse(trimmed), depth + 1, acc);
      } catch {
        // Not JSON despite looking like it; ignore.
      }
    }
    return acc;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectManualCrmMetadata(item, depth + 1, acc));
    return acc;
  }

  if (typeof value !== 'object') return acc;

  Object.entries(value).forEach(([key, val]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (
      normalizedKey === 'booking_origin' ||
      normalizedKey === 'crm_booking_origin' ||
      normalizedKey === 'source_origin'
    ) {
      const s = String(val ?? '').trim();
      if (s) acc.booking_origin = s;
    }
    if (normalizedKey === 'potential_lead_id') acc.potential_lead_id = String(val ?? '').trim() || null;
    if (normalizedKey === 'setter_id') acc.setter_id = String(val ?? '').trim() || null;
    if (normalizedKey === 'crm_manual_booking_id') acc.crm_manual_booking_id = String(val ?? '').trim() || null;
    if (normalizedKey === 'crm_action') acc.crm_action = String(val ?? '').trim() || null;

    collectManualCrmMetadata(val, depth + 1, acc);
  });

  return acc;
}

/**
 * Extract contact fields from iClosed webhook JSON (Settings → Developer webhooks)
 * and Global Data export-shaped payloads.
 */
export function extractContact(body) {
  const payload = resolvePayload(body);
  const event =
    body?.hookType ||
    body?.event ||
    body?.type ||
    body?.event_type ||
    null;

  const email = pickField(payload, [
    'email',
    'Contact',
    'contact_email',
    'contact.email',
  ]);

  const contactId =
    pickField(payload, [
      'id',
      'contact_id',
      'iclosed_contact_id',
      'uuid',
      'contact.id',
      'previewId',
      'preview_id',
    ]) || (email ? email.toLowerCase() : null);

  const statusRaw = pickField(payload, [
    'status',
    'scheduling_status',
    'Scheduling status',
    'schedulingStatus',
    'contact_status',
    'stage',
    'contact_stage',
    'Contact Stage',
    'lifecycle_stage',
    'contact.status',
  ]);

  const firstName = pickField(payload, [
    'firstName',
    'first_name',
    'First Name',
    'contact.first_name',
  ]);
  const lastName = pickField(payload, [
    'lastName',
    'last_name',
    'Last Name',
    'contact.last_name',
  ]);
  const composedName =
    pickField(payload, ['name', 'full_name', 'contact_name', 'contact.name']) ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    null;

  const phone = pickField(payload, [
    'phoneNumber',
    'phone_number',
    'phone',
    'Phone Number',
    'phoneNumber',
    'contact.phone',
    'contact_phone',
    'text_reminder_number',
  ]);

  const source = pickField(payload, [
    'utm_source',
    'first_utm_source',
    'UTM Source',
    'utmSource',
    'source',
    'lead_source',
    'contact.source',
  ]);

  const enrichedMeta = {
    ...payload,
    _normalized: {
      first_name: firstName,
      last_name: lastName,
      status_raw: statusRaw,
      status: normalizeIclosedStatus(statusRaw),
      country: pickField(payload, ['country', 'Country']),
      timezone: pickField(payload, ['timeZone', 'time_zone', 'timezone', 'Time zone']),
      utm_campaign: pickField(payload, ['utm_campaign', 'first_utm_campaign', 'UTM Campaign']),
      utm_medium: pickField(payload, ['utm_medium', 'first_utm_medium', 'UTM Medium']),
      utm_content: pickField(payload, ['utm_content', 'first_utm_content', 'UTM Content']),
      utm_term: pickField(payload, ['utm_term', 'first_utm_term', 'UTM Term']),
      current_closer_owner: pickField(payload, [
        'current_closer_owner',
        'Current Closer Owner',
        'closer_owner',
      ]),
      last_interaction_type: pickField(payload, [
        'last_interaction_type',
        'Last Interaction Type',
      ]),
      no_of_strategy_calls: pickField(payload, [
        'no_of_strategy_calls',
        'No. of strategy calls',
        'strategy_calls_count',
      ]),
      no_of_discovery_calls: pickField(payload, [
        'no_of_discovery_calls',
        'No. of discovery calls',
        'discovery_calls_count',
      ]),
      initial_scheduling_status: pickField(payload, [
        'initial_scheduling_status',
        'Initial Scheduling Status',
      ]),
      ip_address: pickField(payload, ['ipAddress', 'ip_address', 'IP Address']),
      contact_creation_date: pickField(payload, [
        'createdAt',
        'contact_creation_date',
        'Contact Creation Date',
        'created_at',
      ]),
      status_last_modified_at: pickField(payload, [
        'updatedAt',
        'status_last_modified_at',
        'Status last modified at',
        'updated_at',
        'Updated on',
      ]),
      preview_id: pickField(payload, ['previewId', 'preview_id']),
    },
  };

  return {
    event,
    contactId,
    statusRaw,
    status: normalizeIclosedStatus(statusRaw),
    name: composedName,
    email: email || null,
    phone,
    source,
    manualCrmMetadata: collectManualCrmMetadata(body),
    metadata: enrichedMeta,
  };
}

// ── Call rescheduled helpers ──────────────────────────────────────────────────

/**
 * Returns true when the webhook body represents an iClosed "Call rescheduled"
 * event (hookType field). Case-insensitive; also matches "call.rescheduled".
 */
export function isCallRescheduledWebhook(body) {
  const hook = String(body?.hookType || body?.event || '').trim().toLowerCase();
  return hook === 'call rescheduled' || hook === 'call.rescheduled';
}

/**
 * Derive a human-readable status_in value for iclosed_webhook_logs from the
 * iClosed event.type field (STRATEGY_CALL, DISCOVERY_CALL, etc.).
 */
function deriveRescheduleStatusIn(eventType) {
  const t = String(eventType || '').trim().toUpperCase();
  if (t.includes('STRATEGY')) return 'STRATEGY_CALL_BOOKED';
  if (t.includes('DISCOVERY')) return 'DISCOVERY_CALL_BOOKED';
  return t || 'CALL_RESCHEDULED';
}

/**
 * Extract all relevant fields from an iClosed "Call rescheduled" webhook body.
 * Maps from the confirmed admin11 raw_body shape (event, contact, invitee, tracking).
 * Returns { statusIn, summary, result } for use in logWebhook().
 */
export function extractCallReschedule(body) {
  const ev = body?.event || {};
  const contact = body?.contact || {};
  const invitee = body?.invitee || {};
  const tracking = body?.tracking || {};

  const callUuid = ev.uuid != null ? String(ev.uuid) : null;
  const callType = ev.type || null;
  const oldStartTime = ev.old_start_time || null;
  const newStartTime = ev.utc_start_time || null;
  const rescheduleLink = ev.rescheduleLink || null;
  const closerEmail = ev.closerEmail || null;
  const closerId = ev.closerId != null ? String(ev.closerId) : null;

  const contactId = contact.id != null ? String(contact.id) : (invitee.uuid != null ? String(invitee.uuid) : null);
  const email = contact.email || invitee.email || null;
  const phone = contact.phoneNumber || invitee.text_reminder_number || null;
  const firstName = contact.firstName || invitee.first_name || null;
  const lastName = contact.lastName || invitee.last_name || null;
  const name = invitee.name || [firstName, lastName].filter(Boolean).join(' ').trim() || null;

  const rescheduleReason = invitee.reschedule_reason || null;
  const rescheduleBy = invitee.reschedule_by || null;
  const isReschedule = invitee.is_reschedule === true;
  const callBookedFrom = body?.call_booked_from || null;

  const statusIn = deriveRescheduleStatusIn(callType);

  const summary = {
    hookType: body?.hookType || 'Call rescheduled',
    contact: { id: contactId, email, phone, name },
    call: {
      uuid: callUuid,
      type: callType,
      old_start_time: oldStartTime,
      utc_start_time: newStartTime,
      rescheduleLink,
      closerEmail,
      closerId,
      call_booked_from: callBookedFrom,
    },
    invitee: {
      is_reschedule: isReschedule,
      reschedule_reason: rescheduleReason,
      reschedule_by: rescheduleBy,
    },
    tracking: {
      utm_source: tracking.utm_source || null,
      utm_medium: tracking.utm_medium || null,
      utm_campaign: tracking.utm_campaign || null,
      utm_term: tracking.utm_term || null,
    },
    _normalized: {
      status_in: statusIn,
      call_type: callType,
    },
  };

  const result = {
    op: 'call_rescheduled',
    call_uuid: callUuid,
    old_start_time: oldStartTime,
    new_start_time: newStartTime,
    contact_id: contactId,
    email,
    phone,
    reschedule_reason: rescheduleReason,
    reschedule_by: rescheduleBy,
    is_reschedule: isReschedule,
  };

  return { statusIn, summary, result };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify iClosed webhook HMAC when ICLOSED_WEBHOOK_SECRET is set.
 * Checks common signature headers (exact header name varies — confirm from first live delivery).
 */
export function verifyIclosedSignature(req, rawBody) {
  const secret = process.env.ICLOSED_WEBHOOK_SECRET;
  if (!secret) return { ok: true, skipped: true };

  const headers = req.headers || {};
  const headerSig =
    headers['x-iclosed-signature'] ||
    headers['x-iclosed-signature-256'] ||
    headers['x-webhook-signature'] ||
    headers['x-signature'] ||
    headers['x-hub-signature-256'];

  if (!headerSig) {
    return { ok: false, reason: 'missing_signature_header' };
  }

  const raw =
    typeof rawBody === 'string'
      ? rawBody
      : rawBody != null
        ? String(rawBody)
        : typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : '';

  let provided = String(headerSig).trim();
  if (provided.includes('=')) {
    const [, value] = provided.split('=');
    provided = value || provided;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(raw, 'utf8')
    .digest('hex');

  try {
    const a = Buffer.from(provided, provided.length === 64 ? 'hex' : 'utf8');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return { ok: false, reason: 'signature_mismatch' };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature_mismatch' };
    return { ok: true, skipped: false };
  } catch {
    return { ok: false, reason: 'signature_mismatch' };
  }
}

async function logWebhook(row) {
  if (!supabase) return;
  try {
    await supabase.from('iclosed_webhook_logs').insert([row]);
  } catch (err) {
    console.error('[iclosed-webhook] log insert failed', err);
  }
}

async function getRoundRobinActiveSetter() {
  const { data: setters, error } = await supabase
    .from('setters')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error || !setters?.length) return null;

  const { data: lastLead } = await supabase
    .from('potential_leads')
    .select('assigned_setter_id')
    .not('assigned_setter_id', 'is', null)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastId = lastLead?.assigned_setter_id;
  const lastIdx = lastId ? setters.findIndex((s) => s.id === lastId) : -1;
  return setters[(lastIdx + 1) % setters.length];
}

async function assignSetterForPotentialLead() {
  const now = new Date();
  const current = await getCurrentSetterOnShift(now);
  if (current) {
    return {
      assigned_setter_id: current.id,
      assignment_reason: 'on_shift',
      assigned_at: now.toISOString(),
      scheduled_handoff_at: null,
    };
  }
  const next = await getNextScheduledSetter(now, 72);
  if (next) {
    return {
      assigned_setter_id: next.id,
      assignment_reason: 'next_scheduled',
      assigned_at: now.toISOString(),
      scheduled_handoff_at: next.scheduled_for || null,
    };
  }
  const rr = await getRoundRobinActiveSetter();
  if (rr) {
    return {
      assigned_setter_id: rr.id,
      assignment_reason: 'round_robin',
      assigned_at: now.toISOString(),
      scheduled_handoff_at: null,
    };
  }
  return {
    assigned_setter_id: null,
    assignment_reason: 'unassigned',
    assigned_at: null,
    scheduled_handoff_at: null,
  };
}

function hasPotentialLeadPhone(phone) {
  return String(phone ?? '').trim().length > 0;
}

function unassignedAssignmentFields() {
  return {
    assigned_setter_id: null,
    assignment_reason: 'unassigned',
    assigned_at: null,
    scheduled_handoff_at: null,
  };
}

/**
 * No phone → stay unassigned. Has phone and no setter yet → auto-assign.
 * Has phone and already assigned → null (do not overwrite setter on update).
 */
async function resolvePotentialLeadAssignment(phone, existing) {
  if (!hasPotentialLeadPhone(phone)) {
    return unassignedAssignmentFields();
  }
  if (existing?.assigned_setter_id) {
    return null;
  }
  return assignSetterForPotentialLead();
}

function applyAssignmentToPatch(patch, assignment) {
  if (!assignment) return patch;
  return { ...patch, ...assignment };
}

const POTENTIAL_LEAD_INGEST_SELECT =
  'id, iclosed_contact_id, iclosed_status, assigned_setter_id, metadata, name, email, phone, source, created_at';

function normalizeEmailForDedupe(email) {
  if (email == null) return null;
  const s = String(email).trim().toLowerCase();
  return s || null;
}

function normalizePhoneForDedupe(phone) {
  if (phone == null) return null;
  const s = String(phone).trim();
  return s || null;
}

function phoneDigitsOnly(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

function emailsMatch(stored, incoming) {
  const a = normalizeEmailForDedupe(stored);
  const b = normalizeEmailForDedupe(incoming);
  return Boolean(a && b && a === b);
}

function phonesMatch(stored, incoming) {
  const a = normalizePhoneForDedupe(stored);
  const b = normalizePhoneForDedupe(incoming);
  if (!a || !b) return false;
  if (a === b) return true;
  const da = phoneDigitsOnly(a);
  const db = phoneDigitsOnly(b);
  return da.length >= 10 && da === db;
}

function pickNewestPotentialLeadRow(rows) {
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];
  console.warn('[iclosed-webhook] multiple potential_leads email/phone matches; using newest');
  return [...rows].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  })[0];
}

/**
 * Secondary dedupe before insert: same email or phone as an existing row.
 * @returns {{ row: object, matchKind: 'email'|'phone'|'both' } | null}
 */
async function findExistingByEmailOrPhone(email, phone) {
  const normEmail = normalizeEmailForDedupe(email);
  const normPhone = normalizePhoneForDedupe(phone);
  if (!normEmail && !normPhone) return null;

  if (normEmail && normPhone) {
    const { data: byEmail, error } = await supabase
      .from('potential_leads')
      .select(POTENTIAL_LEAD_INGEST_SELECT)
      .ilike('email', normEmail)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('[iclosed-webhook] email+phone dedupe lookup failed:', error.message);
      return null;
    }

    const both = (byEmail || []).filter((r) => emailsMatch(r.email, normEmail) && phonesMatch(r.phone, normPhone));
    if (both.length) {
      return { row: pickNewestPotentialLeadRow(both), matchKind: 'both' };
    }

    const emailOnly = (byEmail || []).filter((r) => emailsMatch(r.email, normEmail));
    if (emailOnly.length) {
      return { row: pickNewestPotentialLeadRow(emailOnly), matchKind: 'email' };
    }
  }

  if (normEmail) {
    const { data: rows, error } = await supabase
      .from('potential_leads')
      .select(POTENTIAL_LEAD_INGEST_SELECT)
      .ilike('email', normEmail)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[iclosed-webhook] email dedupe lookup failed:', error.message);
    } else {
      const matched = (rows || []).filter((r) => emailsMatch(r.email, normEmail));
      if (matched.length) {
        return { row: pickNewestPotentialLeadRow(matched), matchKind: 'email' };
      }
    }
  }

  if (normPhone) {
    const { data: exactRows, error } = await supabase
      .from('potential_leads')
      .select(POTENTIAL_LEAD_INGEST_SELECT)
      .eq('phone', normPhone)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!error && exactRows?.length) {
      return { row: pickNewestPotentialLeadRow(exactRows), matchKind: 'phone' };
    }

    const digits = phoneDigitsOnly(normPhone);
    if (digits.length >= 10) {
      const { data: candidates, error: candErr } = await supabase
        .from('potential_leads')
        .select(POTENTIAL_LEAD_INGEST_SELECT)
        .not('phone', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!candErr) {
        const matched = (candidates || []).filter((r) => phonesMatch(r.phone, normPhone));
        if (matched.length) {
          return { row: pickNewestPotentialLeadRow(matched), matchKind: 'phone' };
        }
      }
    }
  }

  return null;
}

/** Booked webhooks: match by iclosed_contact_id, then email/phone (landing id vs book id). */
async function findPotentialLeadForBookedUpdate(extracted) {
  const { data: byContactId, error } = await supabase
    .from('potential_leads')
    .select(POTENTIAL_LEAD_INGEST_SELECT)
    .eq('iclosed_contact_id', extracted.contactId)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (byContactId) {
    return { row: byContactId, mergedByEmailPhone: false, matchKind: null };
  }

  const dup = await findExistingByEmailOrPhone(extracted.email, extracted.phone);
  if (dup?.row) {
    return {
      row: dup.row,
      mergedByEmailPhone: true,
      matchKind: dup.matchKind,
    };
  }

  return { row: null };
}

function buildBookedUpdatePatch(existing, extracted, normalized, rawPayload, mergedByEmailPhone) {
  const patch = buildIclosedPatch(existing, extracted, normalized, rawPayload);
  if (mergedByEmailPhone && extracted.contactId) {
    return { ...patch, iclosed_contact_id: extracted.contactId };
  }
  return patch;
}

async function updateIngestedPotentialLead({
  existing,
  iclosedFields,
  extracted,
  normalized,
  mergedByEmailPhone,
  matchKind,
}) {
  const assignment = await resolvePotentialLeadAssignment(iclosedFields.phone, existing);
  let patch = applyAssignmentToPatch(iclosedFields, assignment);
  if (mergedByEmailPhone && extracted.contactId) {
    patch = { ...patch, iclosed_contact_id: extracted.contactId };
  }

  const { error: upErr } = await supabase
    .from('potential_leads')
    .update(patch)
    .eq('id', existing.id);

  if (upErr) {
    return { error: upErr.message };
  }

  return {
    assignment,
    logResult: {
      potential_lead_id: existing.id,
      normalized,
      ...(mergedByEmailPhone
        ? { duplicate_merged: true, match_kind: matchKind }
        : {}),
      ...(assignment
        ? {
            assigned_setter_id: assignment.assigned_setter_id,
            assignment_reason: assignment.assignment_reason,
          }
        : {}),
    },
    responseBody: {
      received: true,
      potential_lead_id: existing.id,
      action: mergedByEmailPhone ? 'merged' : 'updated',
      status: normalized,
      ...(mergedByEmailPhone ? { match_kind: matchKind } : {}),
      ...(assignment
        ? {
            assigned_setter_id: assignment.assigned_setter_id,
            assignment_reason: assignment.assignment_reason,
          }
        : {}),
    },
  };
}

function mergePotentialLeadMetadata(existing, extracted) {
  const base =
    existing?.metadata && typeof existing.metadata === 'object'
      ? existing.metadata
      : {};
  const incoming =
    extracted?.metadata && typeof extracted.metadata === 'object'
      ? extracted.metadata
      : {};

  const out = { ...base };

  const qaa = incoming?.questionsAndAnswers;
  if (qaa && typeof qaa === 'object' && !Array.isArray(qaa) && Object.keys(qaa).length > 0) {
    out.questionsAndAnswers = qaa;
  }

  if (!out.Referrer_Url_Embed && incoming?.Referrer_Url_Embed) {
    out.Referrer_Url_Embed = incoming.Referrer_Url_Embed;
  }

  if (incoming?._normalized && typeof incoming._normalized === 'object') {
    out._normalized = {
      ...(out._normalized && typeof out._normalized === 'object' ? out._normalized : {}),
      status: incoming._normalized.status ?? (out._normalized?.status ?? null),
      status_raw: incoming._normalized.status_raw ?? (out._normalized?.status_raw ?? null),
      status_last_modified_at:
        incoming._normalized.status_last_modified_at ?? (out._normalized?.status_last_modified_at ?? null),
    };
  }

  return out;
}

function buildIclosedPatch(existing, extracted, normalized, rawPayload) {
  return {
    iclosed_status: normalized,
    name: extracted.name || existing?.name || null,
    email: extracted.email || existing?.email || null,
    phone: extracted.phone || existing?.phone || null,
    source: extracted.source || existing?.source || null,
    metadata: mergePotentialLeadMetadata(existing, extracted),
    raw_payload: rawPayload,
  };
}

function respond(res, statusCode, body) {
  console.log(`[iclosed-webhook] → ${statusCode}`, JSON.stringify(body, null, 2));
  return res.status(statusCode).json(body);
}

export default async function handler(req, res) {
  console.log('[iclosed-webhook] ← request', req.method, req.url || '/api/iclosed-webhook');

  if (req.method !== 'POST') {
    return respond(res, 405, { error: 'Method not allowed' });
  }

  if (!supabase) {
    return respond(res, 503, {
      error: 'Supabase not configured (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
    });
  }

  const raw = req.rawBody ?? null;
  const sig = verifyIclosedSignature(req, raw);
  if (!sig.ok) {
    console.warn('[iclosed-webhook] signature verification failed:', sig.reason);
    return respond(res, 401, { error: 'Invalid webhook signature', reason: sig.reason });
  }

  const rawPayload = req.body || {};
  console.log(
    '[iclosed-webhook] signature:',
    sig.skipped ? 'skipped (no ICLOSED_WEBHOOK_SECRET)' : 'verified',
  );
  console.log('[iclosed-webhook] payload:', JSON.stringify(rawPayload, null, 2));

  let extracted = null;

  try {
    extracted = extractContact(rawPayload);
    console.log(
      '[iclosed-webhook] extracted:',
      JSON.stringify(
        {
          event: extracted.event,
          contactId: extracted.contactId,
          statusRaw: extracted.statusRaw,
          status: extracted.status,
          name: extracted.name,
          email: extracted.email,
          phone: extracted.phone,
          source: extracted.source,
          manualCrmMetadata: extracted.manualCrmMetadata,
        },
        null,
        2,
      ),
    );

    await logWebhook({
      event: extracted.event,
      status_in: extracted.statusRaw || extracted.status,
      payload: extracted.metadata,
      raw_body: rawPayload,
      process: 'received',
      result: Object.keys(extracted.manualCrmMetadata || {}).length
        ? { manual_crm: extracted.manualCrmMetadata }
        : null,
    });

    // ── Call rescheduled — handle before contact-status logic ─────────────────
    if (isCallRescheduledWebhook(rawPayload)) {
      const reschedule = extractCallReschedule(rawPayload);
      console.log('[iclosed-webhook] Call rescheduled detected:', JSON.stringify(reschedule.result, null, 2));
      await logWebhook({
        event: extracted.event || rawPayload.hookType || 'Call rescheduled',
        status_in: reschedule.statusIn,
        payload: reschedule.summary,
        raw_body: rawPayload,
        process: 'parsed',
        result: reschedule.result,
      });
      return respond(res, 200, {
        received: true,
        action: 'logged',
        event: 'Call rescheduled',
        status_in: reschedule.statusIn,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const ingestSet = getIngestStatusSet();
    const normalized = extracted.status;

    if (!normalized) {
      await logWebhook({
        event: extracted.event,
        status_in: extracted.statusRaw,
        process: 'skipped',
        result: { reason: 'unknown_status', received: extracted.statusRaw },
      });
      return respond(res, 200, {
        received: true,
        skipped: true,
        reason: 'unknown_status',
        status: extracted.statusRaw,
      });
    }

    if (ICLOSED_BOOKED_STATUSES.has(normalized)) {
      if (!extracted.contactId) {
        await logWebhook({
          event: extracted.event,
          status_in: extracted.statusRaw,
          process: 'skipped',
          result: { reason: 'missing_contact_id', normalized },
        });
        return respond(res, 200, {
          received: true,
          skipped: true,
          reason: 'missing_contact_id',
          status: normalized,
        });
      }

      const bookedLookup = await findPotentialLeadForBookedUpdate(extracted);

      if (bookedLookup.error) {
        await logWebhook({
          event: extracted.event,
          status_in: extracted.statusRaw,
          process: 'error',
          error: bookedLookup.error,
          result: { op: 'update_booked', normalized },
        });
        return respond(res, 200, { received: true, error: bookedLookup.error });
      }

      const existingBooked = bookedLookup.row;
      const bookedMergedByEmailPhone = bookedLookup.mergedByEmailPhone;

      if (!existingBooked) {
        await logWebhook({
          event: extracted.event,
          status_in: extracted.statusRaw,
          process: 'skipped',
          result: {
            reason: 'no_potential_lead_row',
            normalized,
            manual_crm: Object.keys(extracted.manualCrmMetadata || {}).length
              ? extracted.manualCrmMetadata
              : null,
          },
        });
        return respond(res, 200, {
          received: true,
          skipped: true,
          reason: 'no_potential_lead_row',
          status: normalized,
        });
      }

      const bookedPatch = buildBookedUpdatePatch(
        existingBooked,
        extracted,
        normalized,
        rawPayload,
        bookedMergedByEmailPhone,
      );

      const { error: bookedUpErr } = await supabase
        .from('potential_leads')
        .update(bookedPatch)
        .eq('id', existingBooked.id);

      if (bookedUpErr) {
        await logWebhook({
          event: extracted.event,
          status_in: extracted.statusRaw,
          process: 'error',
          error: bookedUpErr.message,
          result: {
            potential_lead_id: existingBooked.id,
            op: bookedMergedByEmailPhone ? 'update_booked_merged' : 'update_booked',
            normalized,
          },
        });
        return respond(res, 200, { received: true, error: bookedUpErr.message });
      }

      await logWebhook({
        event: extracted.event,
        status_in: extracted.statusRaw,
        process: bookedMergedByEmailPhone ? 'merged' : 'updated',
        result: {
          potential_lead_id: existingBooked.id,
          normalized,
          booked_status_persisted: true,
          ...(bookedMergedByEmailPhone
            ? { booked_merged_by_email_phone: true, match_kind: bookedLookup.matchKind }
            : {}),
          manual_crm: Object.keys(extracted.manualCrmMetadata || {}).length
            ? extracted.manualCrmMetadata
            : null,
        },
      });
      return respond(res, 200, {
        received: true,
        action: bookedMergedByEmailPhone ? 'merged' : 'updated',
        status: normalized,
        potential_lead_id: existingBooked.id,
        ...(bookedMergedByEmailPhone ? { match_kind: bookedLookup.matchKind } : {}),
      });
    }

    if (normalized === ICLOSED_STATUS.DISQUALIFIED) {
      await logWebhook({
        event: extracted.event,
        status_in: extracted.statusRaw,
        process: 'skipped',
        result: { reason: 'disqualified' },
      });
      return respond(res, 200, {
        received: true,
        skipped: true,
        reason: 'disqualified',
        status: normalized,
      });
    }

    if (!ingestSet.has(normalized)) {
      await logWebhook({
        event: extracted.event,
        status_in: extracted.statusRaw,
        process: 'skipped',
        result: { reason: 'status_not_in_ingest_set', normalized },
      });
      return respond(res, 200, {
        received: true,
        skipped: true,
        reason: 'status_not_in_ingest_set',
        status: normalized,
      });
    }

    if (!extracted.contactId) {
      console.warn('[iclosed-webhook] no contactId; cannot dedupe');
      await logWebhook({
        event: extracted.event,
        status_in: extracted.statusRaw,
        process: 'skipped',
        result: { reason: 'missing_contact_id' },
      });
      return respond(res, 200, {
        received: true,
        skipped: true,
        reason: 'missing_contact_id',
      });
    }

    const { data: existingByContactId } = await supabase
      .from('potential_leads')
      .select(POTENTIAL_LEAD_INGEST_SELECT)
      .eq('iclosed_contact_id', extracted.contactId)
      .maybeSingle();

    let existing = existingByContactId || null;
    let mergedByEmailPhone = false;
    let emailPhoneMatchKind = null;

    if (!existing) {
      const dup = await findExistingByEmailOrPhone(extracted.email, extracted.phone);
      if (dup?.row) {
        const existingStatus = rowIclosedStatus(dup.row);
        if (existingStatus !== ICLOSED_STATUS.POTENTIAL) {
          await logWebhook({
            event: extracted.event,
            status_in: extracted.statusRaw,
            process: 'skipped',
            result: {
              reason: 'duplicate_non_potential',
              match_kind: dup.matchKind,
              existing_status: existingStatus,
              potential_lead_id: dup.row.id,
            },
          });
          return respond(res, 200, {
            received: true,
            skipped: true,
            reason: 'duplicate_non_potential',
            match_kind: dup.matchKind,
            existing_status: existingStatus,
            potential_lead_id: dup.row.id,
          });
        }
        existing = dup.row;
        mergedByEmailPhone = true;
        emailPhoneMatchKind = dup.matchKind;
      }
    }

    const iclosedFields = buildIclosedPatch(existing, extracted, normalized, rawPayload);

    if (existing) {
      const updateResult = await updateIngestedPotentialLead({
        existing,
        iclosedFields,
        extracted,
        normalized,
        mergedByEmailPhone,
        matchKind: emailPhoneMatchKind,
      });

      if (updateResult.error) {
        await logWebhook({
          event: extracted.event,
          status_in: extracted.statusRaw,
          process: 'error',
          error: updateResult.error,
          result: { potential_lead_id: existing.id, op: mergedByEmailPhone ? 'merge' : 'update' },
        });
        return respond(res, 200, { received: true, error: updateResult.error });
      }

      await logWebhook({
        event: extracted.event,
        status_in: extracted.statusRaw,
        process: mergedByEmailPhone ? 'merged' : 'updated',
        result: updateResult.logResult,
      });
      return respond(res, 200, updateResult.responseBody);
    }

    const assignment = await resolvePotentialLeadAssignment(iclosedFields.phone, null);
    const { data: inserted, error: insErr } = await supabase
      .from('potential_leads')
      .insert([
        {
          iclosed_contact_id: extracted.contactId,
          ...iclosedFields,
          ...assignment,
        },
      ])
      .select('id')
      .single();

    if (insErr) {
      await logWebhook({
        event: extracted.event,
        status_in: extracted.statusRaw,
        process: 'error',
        error: insErr.message,
        result: { op: 'insert' },
      });
      return respond(res, 200, { received: true, error: insErr.message });
    }

    await logWebhook({
      event: extracted.event,
      status_in: extracted.statusRaw,
      process: 'created',
      result: {
        potential_lead_id: inserted.id,
        normalized,
        assigned_setter_id: assignment.assigned_setter_id,
        assignment_reason: assignment.assignment_reason,
      },
    });

    return respond(res, 200, {
      received: true,
      potential_lead_id: inserted.id,
      action: 'created',
      status: normalized,
      assignment_reason: assignment.assignment_reason,
      assigned_setter_id: assignment.assigned_setter_id,
    });
  } catch (err) {
    console.error('[iclosed-webhook] uncaught error', err);
    await logWebhook({
      event: extracted?.event ?? null,
      status_in: extracted?.statusRaw ?? null,
      raw_body: rawPayload,
      process: 'error',
      error: err.message,
    });
    return respond(res, 200, { received: true, error: err.message });
  }
}
