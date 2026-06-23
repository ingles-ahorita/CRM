/* global process */
// iClosed server-side proxy for CRM-owned iClosed reads and setter actions.
import { getSupabaseAdmin } from '../getSupabaseAdmin.js';
import { fetchEventCallStatus } from '../iclosedEventCall.js';

const DEFAULT_ICLOSED_API_BASE_URL = 'https://public.api.iclosed.io';
const DEFAULT_ICLOSED_EVENT_LINK_PREFIX =
  'Ingles-Ahorita/entrevista-personalizada-ingl-s-ahorita';
const DEFAULT_ICLOSED_TIMEZONE = 'America/New_York';
const MANUAL_BOOKING_ORIGIN = 'manual_crm';

const supabase = getSupabaseAdmin();

function getQueryValue(req, key) {
  const value = req.query?.[key];
  if (value != null) return Array.isArray(value) ? value[0] : value;
  try {
    const url = new URL(req.url || '', 'http://localhost');
    return url.searchParams.get(key);
  } catch {
    return undefined;
  }
}

function getIclosedBaseUrl() {
  return (process.env.ICLOSED_API_BASE_URL || DEFAULT_ICLOSED_API_BASE_URL).replace(/\/+$/, '');
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function formatIclosedError(data, statusText) {
  if (typeof data === 'string') return data;
  if (data?.error && typeof data.error === 'string') return data.error;
  if (data?.message) {
    return typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
  }
  return statusText || 'iClosed request failed';
}

async function fetchIclosed(path, { method = 'GET', body } = {}) {
  const apiKey = process.env.ICLOSED_API_KEY;
  if (!apiKey) {
    return {
      status: 503,
      data: { error: 'ICLOSED_API_KEY is not configured' },
    };
  }

  const response = await fetch(`${getIclosedBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    return {
      status: response.status,
      data: { error: `iClosed API error: ${response.status} ${formatIclosedError(data, response.statusText)}` },
    };
  }

  return { status: 200, data };
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeContactInput(body) {
  const contact = body?.contact && typeof body.contact === 'object' ? body.contact : body || {};
  const firstName = trimOrNull(contact.firstName);
  const lastName = trimOrNull(contact.lastName);
  const email = trimOrNull(contact.email);
  const phoneNumber = trimOrNull(contact.phoneNumber || contact.phone);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  return { firstName, lastName, email, phoneNumber, fullName };
}

function normalizeAnswerArray(value) {
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .map((v) => trimOrNull(v))
    .filter(Boolean);
}

function getFieldKey(field) {
  return trimOrNull(field?.slug) || trimOrNull(field?.identifier) || trimOrNull(field?.id);
}

function getFieldIdentifier(field) {
  const raw = (
    trimOrNull(field?.identifier) ||
    trimOrNull(field?.slug) ||
    trimOrNull(field?.key) ||
    trimOrNull(field?.name)
  );
  return raw?.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '') || null;
}

function buildInviteeQuestionAnswers(contact) {
  return [
    contact.email ? { type: 'EMAIL', answer: contact.email } : null,
    contact.phoneNumber ? { type: 'PHONE_NO', answer: contact.phoneNumber } : null,
    contact.firstName ? { type: 'FIRST_NAME', answer: contact.firstName } : null,
    contact.lastName ? { type: 'LAST_NAME', answer: contact.lastName } : null,
  ].filter(Boolean);
}

function buildManualMarker({ potentialLeadId, setterId, bookingId, action }) {
  return {
    booking_origin: MANUAL_BOOKING_ORIGIN,
    potential_lead_id: potentialLeadId || null,
    setter_id: setterId || null,
    crm_manual_booking_id: bookingId || null,
    crm_action: action || null,
    created_at: new Date().toISOString(),
  };
}

function buildSecondaryQuestionsAnswer({ fields, answers, manualMarker }) {
  const out = [];
  const byKey = answers && typeof answers === 'object' ? answers : {};

  (Array.isArray(fields) ? fields : []).forEach((field) => {
    const key = getFieldKey(field);
    if (!key || !(key in byKey)) return;
    const answer = normalizeAnswerArray(byKey[key]);
    if (!answer.length) return;

    const identifier = getFieldIdentifier(field);
    const customFieldId = field?.customFieldId ?? field?.custom_field_id ?? field?.id;
    if (customFieldId != null) {
      out.push({ customFieldId, answer });
      return;
    }
    if (identifier) {
      out.push({ identifier, answer });
    }
  });

  const markerIdentifier =
    trimOrNull(process.env.ICLOSED_MANUAL_BOOKING_FIELD_IDENTIFIER) ||
    trimOrNull(process.env.ICLOSED_CRM_SOURCE_FIELD_IDENTIFIER);
  if (markerIdentifier && manualMarker) {
    out.push({
      identifier: markerIdentifier,
      answer: [JSON.stringify(manualMarker)],
    });
  }

  return out;
}

function mergeLocalMetadata(existing, body, manualMarker, action) {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const incoming = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {};
  const next = { ...base, ...incoming };
  if (incoming.questionsAndAnswers && typeof incoming.questionsAndAnswers === 'object') {
    next.questionsAndAnswers = incoming.questionsAndAnswers;
  }
  next._manual_crm = {
    ...(base._manual_crm && typeof base._manual_crm === 'object' ? base._manual_crm : {}),
    ...manualMarker,
    last_action: action,
  };
  return next;
}

async function loadPotentialLead(potentialLeadId) {
  if (!supabase || !potentialLeadId) return { data: null, error: null };
  return supabase
    .from('potential_leads')
    .select('id, iclosed_contact_id, assigned_setter_id, metadata, raw_payload, name, email, phone')
    .eq('id', potentialLeadId)
    .maybeSingle();
}

async function saveInviteeAnswers({ linkPrefix, contactId, contact, secondaryQuestionsAnswer }) {
  const inviteeQuestionAnswers = buildInviteeQuestionAnswers(contact);
  if (!inviteeQuestionAnswers.length && !secondaryQuestionsAnswer.length) {
    return { status: 200, data: { skipped: true, reason: 'no_answers' } };
  }
  return fetchIclosed('/v1/fields/inviteeAnswers', {
    method: 'POST',
    body: {
      linkPrefix,
      contactId: Number(contactId),
      inviteeQuestionAnswers,
      secondaryQuestionsAnswer,
    },
  });
}

async function updateContactQualified({ contactId, contact }) {
  return fetchIclosed('/v1/contacts', {
    method: 'PUT',
    body: {
      id: Number(contactId),
      ...(contact.firstName ? { firstName: contact.firstName } : {}),
      ...(contact.lastName ? { lastName: contact.lastName } : {}),
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.phoneNumber ? { phoneNumber: contact.phoneNumber } : {}),
      status: 'QUALIFIED',
    },
  });
}

async function mirrorPotentialLead({ potentialLead, body, contact, manualMarker, status, raw }) {
  if (!supabase || !potentialLead?.id) return null;
  const metadata = mergeLocalMetadata(potentialLead.metadata, body, manualMarker, status);
  const patch = {
    ...(status === 'qualified' ? { iclosed_status: 'qualified' } : {}),
    ...(status === 'pending_booked_webhook' ? { booking_source: 'crm_booking' } : {}),
    ...(contact.fullName ? { name: contact.fullName } : {}),
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.phoneNumber ? { phone: contact.phoneNumber } : {}),
    metadata,
    raw_payload: {
      ...(potentialLead.raw_payload && typeof potentialLead.raw_payload === 'object'
        ? potentialLead.raw_payload
        : {}),
      ...(body?.raw_payload && typeof body.raw_payload === 'object' ? body.raw_payload : {}),
      manual_crm: {
        action: status,
        iclosed_response: raw || null,
      },
    },
  };

  const { error } = await supabase
    .from('potential_leads')
    .update(patch)
    .eq('id', potentialLead.id);

  if (error) {
    console.warn('[iclosed] local potential_leads mirror failed:', error.message);
    return { warning: error.message, patch };
  }
  return { patch };
}

async function handleSaveQualified(req, res, { shouldBook = false } = {}) {
  const body = req.body || {};
  const potentialLeadId = trimOrNull(body.potentialLeadId);
  const { data: potentialLead, error: leadError } = await loadPotentialLead(potentialLeadId);
  if (leadError) return res.status(500).json({ error: leadError.message });

  const contactId = trimOrNull(body.contactId || potentialLead?.iclosed_contact_id);
  if (!/^\d+$/.test(contactId || '')) {
    return res.status(400).json({ error: 'A numeric iClosed contactId is required' });
  }

  const linkPrefix = trimOrNull(body.linkPrefix) ||
    trimOrNull(process.env.ICLOSED_EVENT_LINK_PREFIX) ||
    DEFAULT_ICLOSED_EVENT_LINK_PREFIX;
  if (!linkPrefix) {
    return res.status(503).json({ error: 'ICLOSED_EVENT_LINK_PREFIX is not configured' });
  }

  const contact = normalizeContactInput(body);
  if (!contact.email && !contact.phoneNumber) {
    return res.status(400).json({ error: 'Email or phone is required to update iClosed contact' });
  }

  const bookingId = trimOrNull(body.crmManualBookingId) ||
    `manual-${potentialLeadId || contactId}-${Date.now()}`;
  const manualMarker = buildManualMarker({
    potentialLeadId,
    setterId: body.setterId || potentialLead?.assigned_setter_id,
    bookingId,
    action: shouldBook ? 'book_call' : 'save_qualified',
  });
  const secondaryQuestionsAnswer = buildSecondaryQuestionsAnswer({
    fields: body.fields,
    answers: body.answers,
    manualMarker,
  });

  const answersResult = await saveInviteeAnswers({
    linkPrefix,
    contactId,
    contact,
    secondaryQuestionsAnswer,
  });
  if (answersResult.status >= 400) {
    return res.status(answersResult.status).json(answersResult.data);
  }

  const contactResult = await updateContactQualified({ contactId, contact });
  if (contactResult.status >= 400) {
    return res.status(contactResult.status).json(contactResult.data);
  }

  if (!shouldBook) {
    const mirrored = await mirrorPotentialLead({
      potentialLead,
      body,
      contact,
      manualMarker,
      status: 'qualified',
      raw: { answers: answersResult.data, contact: contactResult.data },
    });
    return res.status(200).json({
      success: true,
      status: 'qualified',
      manualMarker,
      localPatch: mirrored?.patch || null,
      localWarning: mirrored?.warning || null,
      iclosed: {
        answers: answersResult.data,
        contact: contactResult.data,
      },
    });
  }

  const dateTime = trimOrNull(body.dateTime);
  const timeZone = trimOrNull(body.timeZone) || DEFAULT_ICLOSED_TIMEZONE;
  if (!dateTime || Number.isNaN(new Date(dateTime).getTime())) {
    return res.status(400).json({ error: 'dateTime must be a valid ISO timestamp' });
  }

  const eventResult = await fetchIclosed('/v1/eventCalls', {
    method: 'POST',
    body: {
      linkPrefix,
      contactId: Number(contactId),
      dateTime,
      timeZone,
      secondaryQuestionsAnswer,
    },
  });
  if (eventResult.status >= 400) {
    return res.status(eventResult.status).json(eventResult.data);
  }

  const mirrored = await mirrorPotentialLead({
    potentialLead,
    body,
    contact,
    manualMarker,
    status: 'pending_booked_webhook',
    raw: { answers: answersResult.data, contact: contactResult.data, eventCall: eventResult.data },
  });
  return res.status(200).json({
    success: true,
    status: 'pending_booked_webhook',
    manualMarker,
    localPatch: mirrored?.patch || null,
    localWarning: mirrored?.warning || null,
    iclosed: {
      answers: answersResult.data,
      contact: contactResult.data,
      eventCall: eventResult.data,
    },
  });
}

export default async function handler(req, res) {
  const resource = String(getQueryValue(req, 'resource') || '').trim();

  try {
    if (req.method === 'GET' && resource === 'contact-detail') {
      const contactId = String(getQueryValue(req, 'contactId') || '').trim();
      if (!/^\d+$/.test(contactId)) {
        return res.status(400).json({ error: 'contactId must be numeric' });
      }
      const result = await fetchIclosed(`/v1/contacts/detail?contactId=${encodeURIComponent(contactId)}`);
      return res.status(result.status).json(result.data);
    }

    if (req.method === 'GET' && resource === 'event-call-status') {
      const eventCallId = String(getQueryValue(req, 'eventCallId') || '').trim();
      if (!/^\d+$/.test(eventCallId)) {
        return res.status(400).json({ error: 'eventCallId must be numeric' });
      }
      const status = await fetchEventCallStatus(fetchIclosed, eventCallId);
      if (status.error) {
        return res.status(502).json({ error: status.error, ...status });
      }
      return res.status(200).json(status);
    }

    if (req.method === 'GET' && resource === 'fields') {
      const result = await fetchIclosed('/v1/fields/objects?objectType=CALL&inviteeQuestions=true');
      return res.status(result.status).json(result.data);
    }

    if (req.method === 'POST' && resource === 'event-dates') {
      const linkPrefix = String(
        process.env.ICLOSED_EVENT_LINK_PREFIX || DEFAULT_ICLOSED_EVENT_LINK_PREFIX,
      ).trim();
      const body = req.body || {};
      const timeZone = String(body.timeZone || 'America/New_York').trim();
      const currentDate = String(body.currentDate || '').trim();

      if (!linkPrefix) {
        return res.status(503).json({ error: 'ICLOSED_EVENT_LINK_PREFIX is not configured' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
        return res.status(400).json({ error: 'currentDate must be YYYY-MM-DD' });
      }

      const result = await fetchIclosed('/v1/events/eventDates', {
        method: 'POST',
        body: { linkPrefix, timeZone, currentDate },
      });
      return res.status(result.status).json(result.data);
    }

    if (req.method === 'POST' && resource === 'save-qualified') {
      return handleSaveQualified(req, res, { shouldBook: false });
    }

    if (req.method === 'POST' && resource === 'book-call') {
      return handleSaveQualified(req, res, { shouldBook: true });
    }

    return res.status(404).json({ error: `Unknown iClosed resource: ${resource || '(empty)'}` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
