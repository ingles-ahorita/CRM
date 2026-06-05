/**
 * CRM-only Potential Leads pipeline stages (LT1–LT5) for UI display.
 * iClosed values in DB (iclosed_status) are unchanged.
 */

import {
  ICLOSED_BOOKED_STATUSES,
  rowIclosedStatus,
} from './iclosedLeadStatus.js';

export const LT_STATUS = {
  LT1: 'lt1',
  LT2: 'lt2',
  LT3: 'lt3',
  LT4: 'lt4',
  LT5: 'lt5',
};

export const LT_STATUS_UI = [
  {
    value: LT_STATUS.LT1,
    label: 'LT1',
    description: 'Name + Email',
    cls: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  {
    value: LT_STATUS.LT2,
    label: 'LT2',
    description: 'Email + Phone',
    cls: 'bg-sky-50 text-sky-800 ring-sky-200',
  },
  {
    value: LT_STATUS.LT3,
    label: 'LT3',
    description: 'Email + Phone + questions',
    cls: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  },
  {
    value: LT_STATUS.LT4,
    label: 'LT4',
    description: 'Call booked',
    cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  {
    value: LT_STATUS.LT5,
    label: 'LT5',
    description: 'Booked & confirmed (CRM)',
    cls: 'bg-violet-50 text-violet-800 ring-violet-200',
  },
];

export const LT_STATUS_LOOKUP = Object.fromEntries(
  LT_STATUS_UI.map((s) => [s.value, s]),
);

export const LT_STATUS_LIST = LT_STATUS_UI.map((s) => s.value);

/** Same slugs as setter iClosed booking form. */
export const ICLOSED_CALL_QUESTION_SLUGS = [
  'call.learning-purpose',
  'call.current-employment',
  'call.current-level',
  'call.difficult-level',
  'call.call-confirmation',
];

/** Substrings for matching iClosed question text / identifiers to each slug. */
const SLUG_QAA_HINTS = {
  'call.learning-purpose': [
    'learning-purpose',
    'learning purpose',
    'propósito',
    'proposito',
    'aprender inglés',
    'aprender ingles',
  ],
  'call.current-employment': [
    'current-employment',
    'employment',
    'empleo',
    'laboral',
    'trabajo',
    'situación laboral',
    'situacion laboral',
  ],
  'call.current-level': [
    'current-level',
    'nivel de inglés',
    'nivel de ingles',
    'tu nivel',
    'what is your level',
    'english level',
  ],
  'call.difficult-level': [
    'difficult-level',
    'difficult level',
    'más difícil',
    'mas dificil',
    'parte del inglés',
    'parte del ingles',
  ],
  'call.call-confirmation': [
    'call-confirmation',
    'confirmación',
    'confirmacion',
    'asistirás',
    'asistiras',
    'attend the call',
    'confirm that you',
  ],
};

export function normalizeEmailForMatch(email) {
  if (email == null) return null;
  const s = String(email).trim().toLowerCase();
  return s || null;
}

function trimField(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function extractAnswerValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const arr = value.map(extractAnswerValue).flat().filter((v) => v != null && String(v).trim() !== '');
    return arr.length ? arr : null;
  }
  if (typeof value !== 'object') return value;
  if ('answer' in value) return extractAnswerValue(value.answer);
  if ('value' in value) return extractAnswerValue(value.value);
  if ('selected' in value) return extractAnswerValue(value.selected);
  if ('selectedOptions' in value) return extractAnswerValue(value.selectedOptions);
  if ('selected_options' in value) return extractAnswerValue(value.selected_options);
  if ('values' in value) return extractAnswerValue(value.values);
  if ('options' in value) return extractAnswerValue(value.options);
  return null;
}

function answerPresent(value) {
  const v = extractAnswerValue(value);
  if (v == null) return false;
  if (Array.isArray(v)) return v.some((x) => String(x).trim() !== '');
  return String(v).trim() !== '';
}

function normalizeQaaKey(key) {
  return String(key || '')
    .trim()
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '')
    .toLowerCase();
}

function questionTextMatchesSlug(text, slug) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  const hints = SLUG_QAA_HINTS[slug] || [];
  return hints.some((h) => t.includes(h.toLowerCase()));
}

function getRawQuestionsAndAnswers(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const candidates = [
    metadata.questionsAndAnswers,
    metadata.questions_and_answers,
    metadata.raw_payload?.questionsAndAnswers,
    metadata.raw_payload?.questions_and_answers,
    metadata.rawPayload?.questionsAndAnswers,
    metadata.rawPayload?.questions_and_answers,
  ];
  for (const cand of candidates) {
    if (cand && typeof cand === 'object' && !Array.isArray(cand)) return cand;
  }
  return null;
}

function isBookingFieldKey(key) {
  const norm = normalizeQaaKey(key);
  return ICLOSED_CALL_QUESTION_SLUGS.some((slug) =>
    slugAnswerKeys(slug).some((k) => normalizeQaaKey(k) === norm),
  );
}

export function collectStoredQuestionAnswers(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const out = {};
  const merge = (obj) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) Object.assign(out, obj);
  };

  merge(metadata.questionsAndAnswers);
  merge(metadata.questions_and_answers);

  if (metadata.answers && typeof metadata.answers === 'object' && !Array.isArray(metadata.answers)) {
    Object.entries(metadata.answers).forEach(([key, value]) => {
      if (isBookingFieldKey(key) && answerPresent(value)) out[key] = value;
    });
  }

  const contactFields = metadata.contactFields || metadata.contact_fields;
  if (contactFields && typeof contactFields === 'object' && !Array.isArray(contactFields)) {
    Object.entries(contactFields).forEach(([key, value]) => {
      if (isBookingFieldKey(key) && answerPresent(value)) out[key] = value;
    });
  }

  ICLOSED_CALL_QUESTION_SLUGS.forEach((slug) => {
    slugAnswerKeys(slug).forEach((key) => {
      if (answerPresent(metadata[key])) out[key] = metadata[key];
    });
  });

  const rawPayload = metadata.raw_payload || metadata.rawPayload;
  if (rawPayload && typeof rawPayload === 'object') {
    merge(rawPayload.questionsAndAnswers);
    merge(rawPayload.questions_and_answers);
    merge(rawPayload.answers);
  }

  return out;
}

/** Merge row.metadata with top-level raw_payload Q&A when mirror stores answers only on the row. */
export function leadMetadataForLt(row) {
  const base = row?.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  const raw = row?.raw_payload;
  if (!raw || typeof raw !== 'object') return base;

  return {
    ...base,
    raw_payload: base.raw_payload || base.rawPayload || raw,
    questionsAndAnswers:
      base.questionsAndAnswers ||
      base.questions_and_answers ||
      raw.questionsAndAnswers ||
      raw.questions_and_answers ||
      undefined,
    answers: base.answers || raw.answers || undefined,
  };
}

function slugAnswerKeys(slug) {
  const s = String(slug || '').trim();
  if (!s) return [];
  const keys = new Set([s]);
  if (s.startsWith('call.')) keys.add(s.replace(/^call\./, ''));
  else keys.add(`call.${s}`);
  return [...keys];
}

function slugHasBookingAnswer(slug, answers, qaa) {
  if (slugAnswerKeys(slug).some((key) => answerPresent(answers[key]))) {
    return true;
  }

  if (!qaa || typeof qaa !== 'object') return false;

  if (slugAnswerKeys(slug).some((key) => answerPresent(qaa[key]))) {
    return true;
  }

  for (const [key, value] of Object.entries(qaa)) {
    if (/^\d+_(question|response)$/.test(key)) continue;
    if (key.startsWith('_') || key === 'Referrer_Url_Embed') continue;
    if (!answerPresent(value)) continue;
    if (isBookingFieldKey(key) && normalizeQaaKey(key) === normalizeQaaKey(slug)) {
      return true;
    }
    if (slugAnswerKeys(slug).some((k) => normalizeQaaKey(k) === normalizeQaaKey(key))) {
      return true;
    }
    if (questionTextMatchesSlug(key, slug)) return true;
  }

  for (const key of Object.keys(qaa)) {
    const m = key.match(/^(\d+)_question$/);
    if (!m) continue;
    const qText = qaa[key];
    if (!questionTextMatchesSlug(qText, slug)) continue;
    if (answerPresent(qaa[`${m[1]}_response`])) return true;
  }

  return false;
}

export function hasAllBookingQuestionsAnswered(metadata) {
  const answers = collectStoredQuestionAnswers(metadata);
  const qaa = getRawQuestionsAndAnswers(metadata);
  return ICLOSED_CALL_QUESTION_SLUGS.every((slug) =>
    slugHasBookingAnswer(slug, answers, qaa),
  );
}

export function isPotentialLeadBooked(row) {
  const iclosed = rowIclosedStatus(row);
  if (iclosed && ICLOSED_BOOKED_STATUSES.has(iclosed)) return true;

  const meta = row?.metadata;
  if (meta && typeof meta === 'object') {
    const manual = meta._manual_crm;
    if (manual && typeof manual === 'object') {
      const action = String(manual.last_action ?? manual.crm_action ?? '').trim();
      if (action === 'book_call') return true;
    }
  }

  const raw = row?.raw_payload;
  if (raw && typeof raw === 'object') {
    const manual = raw.manual_crm;
    if (manual && typeof manual === 'object') {
      const action = String(manual.action ?? '').trim();
      if (action === 'pending_booked_webhook' || action === 'book_call') return true;
    }
  }

  return false;
}

function hasLt1(row) {
  return Boolean(trimField(row?.name) && trimField(row?.email));
}

function hasLt2(row) {
  return Boolean(trimField(row?.email) && trimField(row?.phone));
}

/**
 * @param {object} row - potential_leads row
 * @param {{ crmConfirmedEmails?: Set<string> | null }} [options]
 * @returns {string | null} LT_STATUS value or null
 */
export function computePotentialLeadLtStatus(row, options = {}) {
  if (!row) return null;

  const crmConfirmedEmails = options.crmConfirmedEmails ?? null;
  const emailKey = normalizeEmailForMatch(row.email);
  const booked = isPotentialLeadBooked(row);

  if (
    booked &&
    emailKey &&
    crmConfirmedEmails &&
    crmConfirmedEmails.has(emailKey)
  ) {
    return LT_STATUS.LT5;
  }

  if (booked) return LT_STATUS.LT4;

  if (hasLt2(row) && hasAllBookingQuestionsAnswered(leadMetadataForLt(row))) {
    return LT_STATUS.LT3;
  }

  if (hasLt2(row)) return LT_STATUS.LT2;

  if (hasLt1(row)) return LT_STATUS.LT1;

  return null;
}

export function ltStatusLabel(value) {
  return LT_STATUS_LOOKUP[value]?.label ?? value ?? '—';
}

/**
 * Emails with a calls row where booking_origin = 'crm' (LT5).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {Array<{ email?: string | null }>} rows
 * @returns {Promise<Set<string>>}
 */
export async function fetchCrmConfirmedEmails(supabaseClient, rows) {
  const emails = [
    ...new Set(
      (rows || []).map((r) => normalizeEmailForMatch(r.email)).filter(Boolean),
    ),
  ];
  if (!emails.length || !supabaseClient) return new Set();

  const { data, error } = await supabaseClient
    .from('calls')
    .select('email')
    .eq('booking_origin', 'crm')
    .in('email', emails);

  if (error) {
    console.warn('[potential-leads] crm calls lookup:', error.message);
    return new Set();
  }

  return new Set(
    (data || []).map((c) => normalizeEmailForMatch(c.email)).filter(Boolean),
  );
}
