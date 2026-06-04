import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { getDayBoundsLocal } from '../../../../utils/dateHelpers';
import { subDays } from 'date-fns';
import { Pencil, X } from 'lucide-react';
import { ICLOSED_POTENTIAL_LEADS_TAB_STATUSES } from '../../../../../lib/iclosedLeadStatus.js';
import {
  LT_STATUS_UI,
  computePotentialLeadLtStatus,
  fetchCrmConfirmedEmails,
} from '../../../../../lib/potentialLeadLtStatus.js';
import LtStatusBadge from '../../potential-leads/LtStatusBadge.jsx';
import {
  buildPotentialLeadStats,
  paginateItems,
  PotentialLeadsPagination,
} from '../../potential-leads/potentialLeadsListHelpers.jsx';
import IclosedBookingCalendar from './IclosedBookingCalendar.jsx';

const TAB_STATUS_LIST = [...ICLOSED_POTENTIAL_LEADS_TAB_STATUSES];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function cx(...c) {
  return c.filter(Boolean).join(' ');
}

function normalizeIclosedFieldsResponse(json) {
  return Array.isArray(json?.data) ? json.data : [];
}

function normalizeIclosedFieldKey(key) {
  const s = key != null ? String(key).trim() : '';
  if (!s) return '';
  return s.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
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

function getQuestionResponseFromQaa(qaa, questionText) {
  if (!qaa || typeof qaa !== 'object' || !questionText) return null;
  if (qaa[questionText] != null) return qaa[questionText];

  for (const key of Object.keys(qaa)) {
    const match = key.match(/^(\d+)_question$/);
    if (!match) continue;
    const n = match[1];
    if (String(qaa[key] ?? '').trim() === questionText) {
      const response = qaa[`${n}_response`];
      if (response != null && String(response).trim() !== '') return response;
    }
  }

  return null;
}

function collectStoredQuestionAnswers(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const out = {};
  const merge = (obj) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) Object.assign(out, obj);
  };

  merge(metadata.questionsAndAnswers);
  merge(metadata.questions_and_answers);

  const contactFields = metadata.contactFields || metadata.contact_fields;
  if (contactFields && typeof contactFields === 'object' && !Array.isArray(contactFields)) {
    Object.entries(contactFields).forEach(([key, value]) => {
      const answer = extractAnswerValue(value);
      if (answer != null) out[key] = answer;
    });
  }

  const rawPayload = metadata.raw_payload || metadata.rawPayload;
  if (rawPayload && typeof rawPayload === 'object') {
    merge(rawPayload.questionsAndAnswers);
    merge(rawPayload.questions_and_answers);
  }

  return out;
}

function normalizeContactDetailResponse(json) {
  if (!json || typeof json !== 'object') return null;
  const data = json?.data && typeof json.data === 'object' ? json.data : json;
  if (!data || typeof data !== 'object') return null;

  const pick = (...candidates) => {
    for (const v of candidates) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return null;
  };

  const firstName = pick(data?.firstName, data?.first_name, data?.FirstName, data?.['First Name']);
  const lastName = pick(data?.lastName, data?.last_name, data?.LastName, data?.['Last Name']);
  const name = pick(
    data?.name,
    data?.fullName,
    data?.full_name,
    [firstName, lastName].filter(Boolean).join(' '),
  );
  const email = pick(data?.email, data?.contact_email, data?.contactEmail);
  const phone = pick(data?.phone, data?.phoneNumber, data?.phone_number, data?.contact_phone);

  // We keep TWO representations:
  // 1) `qaByFieldKey`: keyed by identifier/slug (e.g. `current-level` or `call.current-level`) for UI selection.
  // 2) `qaaRaw`: the exact `questionsAndAnswers` object shape iClosed provides (question text keys + N_question/N_response).
  const qaByFieldKey = {};
  let qaaRaw = null;
  const tryAdd = (key, value) => {
    const k = normalizeIclosedFieldKey(key);
    if (!k) return;
    const answerValue = extractAnswerValue(value);
    if (answerValue == null) return;
    const keys = new Set([k]);
    if (k.startsWith('call.')) keys.add(k.replace(/^call\./, ''));
    else keys.add(`call.${k}`);

    if (Array.isArray(answerValue)) {
      const arr = answerValue.map((v) => String(v).trim()).filter(Boolean);
      if (arr.length) qaByFieldKey[k] = arr;
      keys.forEach((candidateKey) => {
        if (arr.length) qaByFieldKey[candidateKey] = arr;
      });
      return;
    }
    const s = String(answerValue).trim();
    if (s) keys.forEach((candidateKey) => {
      qaByFieldKey[candidateKey] = s;
    });
  };

  const customCandidates = [
    data?.customFields,
    data?.custom_fields,
    data?.CustomFields,
    data?.fields,
    data?.contactFields,
    data?.contact_fields,
    data?.questionsAndAnswers,
    data?.questions_and_answers,
    data?.CustomFieldAssociation,
  ];

  for (const cand of customCandidates) {
    if (!cand) continue;

    // Already a map.
    if (cand && typeof cand === 'object' && !Array.isArray(cand)) {
      // Prefer the literal iClosed questionsAndAnswers payload as canonical raw shape.
      if (!qaaRaw && (cand === data?.questionsAndAnswers || cand === data?.questions_and_answers)) {
        qaaRaw = cand;
      }
      Object.entries(cand).forEach(([k, v]) => tryAdd(k, v));
      continue;
    }

    // Array of field answers.
    if (Array.isArray(cand)) {
      cand.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        // iClosed contact detail shape: { customField: { identifier, inputType, ... }, CustomFieldAnswer: [{ answer }] }
        if (item.customField && typeof item.customField === 'object' && Array.isArray(item.CustomFieldAnswer)) {
          const identifier = item.customField.identifier ?? item.customField.slug ?? item.customField.key ?? item.customField.id;
          const inputType = String(item.customField.inputType || '').toUpperCase();
          const answers = item.CustomFieldAnswer
            .map((a) => (a && typeof a === 'object' ? a.answer : null))
            .filter((v) => v != null && String(v).trim() !== '')
            .map((v) => String(v).trim());

          const isMulti = inputType === 'MULTIPLE_SELECT' || inputType === 'CHECK_BOX';
          const value = isMulti ? answers : (answers[0] ?? null);

          const baseKey = normalizeIclosedFieldKey(identifier);
          if (baseKey) {
            tryAdd(baseKey, value);
            // Most CALL fields render with `call.` prefix in our UI (e.g. `call.current-level`).
            const type = String(item.customField.type || '').toUpperCase();
            if (type === 'CALL' && !baseKey.startsWith('call.')) {
              tryAdd(`call.${baseKey}`, value);
            }
          }
          return;
        }

        const key = item.slug ?? item.key ?? item.name ?? item.fieldSlug ?? item.field_key ?? item.id;
        const value =
          item.value ??
          item.answer ??
          item.selected ??
          item.selectedOptions ??
          item.selected_options ??
          item.values ??
          item.options;
        tryAdd(key, value);
      });
    }
  }

  return { name, firstName, lastName, email, phone, qaByFieldKey, qaaRaw };
}

// Matches iClosed booking-form display order (API returns reverse id order).
const ICLOSED_CALL_QUESTION_ORDER = [
  'call.learning-purpose',
  'call.current-employment',
  'call.current-level',
  'call.difficult-level',
  'call.call-confirmation',
];

function sortIclosedBookingFields(fields) {
  const orderMap = new Map(ICLOSED_CALL_QUESTION_ORDER.map((slug, idx) => [slug, idx]));
  return [...fields].sort((a, b) => {
    const aOrder = orderMap.get(a?.slug) ?? 999;
    const bOrder = orderMap.get(b?.slug) ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  });
}

function splitName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return { first: '', last: '' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function normalizeQaaValue(val) {
  if (Array.isArray(val)) {
    const arr = val.map((v) => String(v).trim()).filter(Boolean);
    if (arr.length === 0) return null;
    if (arr.length === 1) return arr[0];
    return arr;
  }
  const s = String(val ?? '').trim();
  return s ? s : null;
}

function buildUiAnswersFromQaa({ fields, qaa, qaByFieldKey }) {
  const out = {};
  const baseQaa = qaa && typeof qaa === 'object' ? qaa : {};
  const byKey = qaByFieldKey && typeof qaByFieldKey === 'object' ? qaByFieldKey : {};
  const list = Array.isArray(fields) ? fields : [];

  list.forEach((f) => {
    const k = String(f?.slug ?? f?.id ?? '').trim();
    if (!k) return;
    // Priority: explicit field-key answers from iClosed association, otherwise match by question text in qaaRaw.
    const fieldIdentifier = normalizeIclosedFieldKey(f?.identifier);
    const candidateKeys = [
      k,
      normalizeIclosedFieldKey(k),
      fieldIdentifier,
      f?.id != null ? String(f.id) : null,
      k.startsWith('call.') ? k.replace(/^call\./, '') : `call.${k}`,
    ].filter(Boolean);
    const fromKey = candidateKeys.map((candidateKey) => byKey[candidateKey]).find((v) => v != null);
    if (fromKey != null) {
      const normalized = normalizeQaaValue(fromKey);
      if (normalized != null) {
        out[k] = normalized;
      }
      return;
    }
    const qText = String(f?.name ?? '').trim();
    if (!qText) return;
    const fromQaa = getQuestionResponseFromQaa(baseQaa, qText);
    const normalizedQaa = normalizeQaaValue(fromQaa);
    if (normalizedQaa != null) out[k] = normalizedQaa;
  });

  return out;
}

function applyUiAnswerDiffToQaa({ fields, prevQaa, initialUi, nextUi }) {
  const out = prevQaa && typeof prevQaa === 'object' ? { ...prevQaa } : {};
  const init = initialUi && typeof initialUi === 'object' ? initialUi : {};
  const next = nextUi && typeof nextUi === 'object' ? nextUi : {};

  const bySlug = new Map();
  (Array.isArray(fields) ? fields : []).forEach((f) => {
    const k = String(f?.slug ?? f?.id ?? '').trim();
    if (k) bySlug.set(k, f);
  });

  for (const [k, nextValRaw] of Object.entries(next)) {
    const f = bySlug.get(k);
    if (!f) continue;

    const nextVal = normalizeQaaValue(nextValRaw);
    const initVal = normalizeQaaValue(init[k]);
    if (JSON.stringify(nextVal) === JSON.stringify(initVal)) continue;

    const qText = String(f?.name ?? '').trim();
    if (qText && nextVal != null) out[qText] = nextVal;
    if (nextVal != null) out[k] = nextVal;

    // Also update numbered response keys if present in the existing shape.
    // Example: "7_question" = "¿Cuál es tu nivel...?" → update "7_response"
    Object.keys(out).forEach((key) => {
      const m = key.match(/^(\d+)_question$/);
      if (!m) return;
      const n = m[1];
      if (String(out[key] ?? '').trim() === qText) {
        out[`${n}_response`] = nextVal;
      }
    });
  }

  return out;
}

export default function SetterPotentialLeads({ setterId, datePreset = 'today', startISO = null, endISO = null }) {
  const [rows, setRows] = useState([]);
  const [setters, setSetters] = useState([]);
  const [crmConfirmedEmails, setCrmConfirmedEmails] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!setterId) return;
    setLoading(true);
    setError(null);

    const resolveRange = () => {
      if (datePreset === 'today') {
        const { dayStart, dayEnd } = getDayBoundsLocal(new Date());
        return { start: dayStart.toISOString(), end: dayEnd.toISOString() };
      }
      if (datePreset === 'yesterday') {
        const { dayStart, dayEnd } = getDayBoundsLocal(subDays(new Date(), 1));
        return { start: dayStart.toISOString(), end: dayEnd.toISOString() };
      }
      if (datePreset === 'custom') {
        return { start: startISO, end: endISO };
      }
      return { start: null, end: null }; // all
    };

    const range = resolveRange();

    const [leadsRes, settersRes] = await Promise.all([
      (() => {
        let q = supabase
          .from('potential_leads')
          .select('*, assigned_setter:assigned_setter_id(id, name)')
          .eq('assigned_setter_id', setterId)
          .in('iclosed_status', TAB_STATUS_LIST);

        // date filtering uses created_at
        if (range?.start) q = q.gte('created_at', range.start);
        if (range?.end) q = q.lte('created_at', range.end);

        return q.order('created_at', { ascending: false }).limit(500);
      })(),
      supabase.from('setters').select('id, name').eq('active', true).order('name'),
    ]);

    if (leadsRes.error) {
      setError(leadsRes.error.message);
      setRows([]);
      setCrmConfirmedEmails(new Set());
    } else {
      const leadRows = leadsRes.data || [];
      setRows(leadRows);
      const crmEmails = await fetchCrmConfirmedEmails(supabase, leadRows);
      setCrmConfirmedEmails(crmEmails);
    }
    setSetters(settersRes.data || []);
    setLoading(false);
  }, [setterId, datePreset, startISO, endISO]);

  const ltForRow = useCallback(
    (r) => computePotentialLeadLtStatus(r, { crmConfirmedEmails }),
    [crmConfirmedEmails],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const channel = supabase
      .channel(`setter_${setterId}_potential_leads_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'potential_leads' },
        () => fetchAll(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll, setterId]);

  const updateRow = useCallback(async (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error: upErr } = await supabase.from('potential_leads').update(patch).eq('id', id);
    if (upErr) {
      setError(upErr.message);
      fetchAll();
      throw upErr;
    }
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!String(r.phone ?? '').trim()) return false;
      const lt = ltForRow(r);
      if (statusFilter !== 'all' && lt !== statusFilter) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone, r.assigned_setter?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter, ltForRow]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, setterId, datePreset, startISO, endISO]);

  const stats = useMemo(
    () => buildPotentialLeadStats(filtered, ltForRow, { countUnassigned: false }),
    [filtered, ltForRow],
  );

  const pagination = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  return (
    <div className="potential-leads-tab w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[22px] font-bold tracking-tight text-[#0f172a]">Potential Leads</h2>
          <button
            type="button"
            onClick={fetchAll}
            className="potential-leads-btn rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
        <p className="text-[13px] text-slate-500">
          Open iClosed leads assigned to this setter. Status shows CRM pipeline stage (LT1–LT5).
        </p>

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Total: {stats.total}</span>
          {LT_STATUS_UI.map((s) => (
            <span
              key={s.value}
              className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${s.cls}`}
              title={s.description}
            >
              {s.label}: {stats.by[s.value] ?? 0}
            </span>
          ))}
          {stats.noStage > 0 && (
            <span
              className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 ring-1 ring-inset ring-slate-200"
              title="Rows missing LT stage requirements"
            >
              Other: {stats.noStage}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="all">All stages</option>
            {LT_STATUS_UI.map((s) => (
              <option key={s.value} value={s.value}>{s.label} — {s.description}</option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / email / phone…"
            className="min-w-[260px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-[12px] border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-left">Email / Phone</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Assigned Setter</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Notes</th>
              <th className="px-3 py-2 text-left">Last contact</th>
              <th className="px-3 py-2 text-left">Received</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">No potential leads.</td></tr>
            ) : pagination.items.map((r) => (
              <PotentialLeadRow
                key={r.id}
                row={r}
                setters={setters}
                ltStatus={ltForRow(r)}
                onUpdate={updateRow}
                onEdit={() => setEditingRow(r)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PotentialLeadsPagination pagination={pagination} onPageChange={setPage} />

      <IclosedMetadataModal
        isOpen={!!editingRow}
        onClose={() => setEditingRow(null)}
        row={editingRow}
        crmConfirmedEmails={crmConfirmedEmails}
        onDone={async () => {
          setEditingRow(null);
          await fetchAll();
        }}
      />
    </div>
  );
}

function PotentialLeadRow({ row, setters, ltStatus, onUpdate, onEdit }) {
  const [noteDraft, setNoteDraft] = useState(row.notes || '');
  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    setNoteDraft(row.notes || '');
  }, [row.notes]);

  const commitNote = () => {
    if ((row.notes || '') !== noteDraft) {
      onUpdate(row.id, { notes: noteDraft });
    }
    setEditingNote(false);
  };

  const markContactAttempt = () => {
    onUpdate(row.id, {
      last_contact_attempt_at: new Date().toISOString(),
    });
  };

  return (
    <tr className="align-top odd:bg-white even:bg-slate-50/30 hover:bg-slate-50">
      <td className="px-3 py-3">
        <div className="font-semibold text-slate-900 leading-tight">{row.name || '—'}</div>
        {row.assignment_reason === 'next_scheduled' && (
          <div className="mt-0.5 text-[10px] font-medium uppercase text-amber-600">
            Waiting for shift{row.scheduled_handoff_at ? ` @ ${formatDate(row.scheduled_handoff_at)}` : ''}
          </div>
        )}
        {row.assignment_reason === 'unassigned' && (
          <div className="mt-0.5 text-[10px] font-medium uppercase text-red-600">Unassigned</div>
        )}
      </td>
      <td className="px-3 py-3 text-slate-700">
        <div className="truncate font-medium text-slate-700">{row.email || '—'}</div>
        <div className="text-slate-500">{row.phone || '—'}</div>
      </td>
      <td className="px-3 py-3 text-slate-700">{row.source || '—'}</td>
      <td className="px-3 py-3">
        <select
          value={row.assigned_setter_id || ''}
          onChange={() => {}}
          disabled
          className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 opacity-80"
        >
          <option value="">— Unassigned —</option>
          {setters.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <LtStatusBadge value={ltStatus} />
      </td>
      <td className="px-3 py-3 min-w-[240px]">
        {editingNote ? (
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            rows={2}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            className="potential-leads-btn block w-full whitespace-pre-wrap rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-normal text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            {row.notes ? row.notes : <span className="italic text-slate-400">Add note…</span>}
          </button>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
        <div className="tabular-nums text-[11px] leading-tight">{formatDate(row.last_contact_attempt_at)}</div>
        <button
          type="button"
          onClick={markContactAttempt}
          className="potential-leads-btn mt-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          Log contact attempt
        </button>
      </td>
      <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap tabular-nums leading-tight">
        {formatDate(row.created_at)}
      </td>
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          onClick={onEdit}
          className="potential-leads-btn inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          title="Edit iClosed metadata"
        >
          <Pencil size={14} />
          Edit
        </button>
      </td>
    </tr>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold text-slate-600">{label}</div>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function QuestionCard({ field, value, onChange }) {
  const label = field?.name || 'Question';
  const inputType = String(field?.inputType || 'TEXT').toUpperCase();
  const isMulti = inputType === 'MULTIPLE_SELECT' || inputType === 'CHECK_BOX';
  const optionsRaw = Array.isArray(field?.CustomFieldOptions) ? field.CustomFieldOptions : [];
  const options = optionsRaw
    .slice()
    .sort((a, b) => Number(a?.displayIndex ?? 0) - Number(b?.displayIndex ?? 0));

  return (
    <div className="border-b border-slate-100 pb-5 last:border-b-0 last:pb-0">
      <p className="text-[15px] font-semibold leading-snug text-slate-900">
        {label}
        <span className="ml-0.5 text-red-500">*</span>
      </p>
      {options.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {options.map((o) => (
            <li key={String(o?.id ?? o?.name)} className="flex items-start gap-2.5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type={isMulti ? 'checkbox' : 'radio'}
                  name={String(field?.slug || field?.id || label)}
                  value={String(o?.name ?? o?.id ?? '')}
                  checked={
                    isMulti
                      ? Array.isArray(value) && value.includes(String(o?.name ?? o?.id ?? ''))
                      : String(value ?? '') === String(o?.name ?? o?.id ?? '')
                  }
                  onChange={() => {
                    const optVal = String(o?.name ?? o?.id ?? '');
                    if (!optVal) return;
                    if (isMulti) {
                      const prev = Array.isArray(value) ? value : [];
                      const next = prev.includes(optVal) ? prev.filter((v) => v !== optVal) : [...prev, optVal];
                      onChange?.(next);
                      return;
                    }
                    onChange?.(optVal);
                  }}
                  className={cx(
                    'mt-0.5 h-[18px] w-[18px] shrink-0 border-2 border-slate-300 bg-white text-indigo-600',
                    isMulti ? 'rounded-[4px]' : 'rounded-full',
                  )}
                />
                <span className="text-[14px] leading-snug text-slate-700">
                  {o?.name || `Option ${o?.id}`}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Free-text answer</p>
      )}
    </div>
  );
}

function IclosedMetadataModal({ isOpen, onClose, row, crmConfirmedEmails, onDone }) {
  const [firstNameDraft, setFirstNameDraft] = useState('');
  const [lastNameDraft, setLastNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [iclosedFields, setIclosedFields] = useState([]);
  const [loadingIclosedFields, setLoadingIclosedFields] = useState(false);
  const [iclosedFieldsError, setIclosedFieldsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [qaDraft, setQaDraft] = useState({});
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [contactDetailLoading, setContactDetailLoading] = useState(false);
  const [contactDetailError, setContactDetailError] = useState(null);
  const lastRowIdRef = useRef(null);
  const qaaBaseRef = useRef({});
  const initialUiAnswersRef = useRef({});

  useEffect(() => {
    if (!isOpen) lastRowIdRef.current = null;
  }, [isOpen]);

  const iclosedFetchJson = useCallback(async (resource, params = {}) => {
    const qs = new URLSearchParams({ resource, ...params });
    const res = await fetch(`/api/iclosed?${qs.toString()}`, { method: 'GET' });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const msg = json?.message || json?.error || res.statusText || 'Request failed';
      throw new Error(`iClosed ${res.status}: ${msg}`);
    }
    return json;
  }, []);

  useEffect(() => {
    if (!isOpen || !row) return;
    if (lastRowIdRef.current === row.id) return;
    lastRowIdRef.current = row.id;
    const splitFromRow = splitName(row?.name);
    setFirstNameDraft(splitFromRow.first);
    setLastNameDraft(splitFromRow.last);
    setPhoneDraft(row?.phone || '');
    setEmailDraft(row?.email || '');
    setSaveError(null);
    setSaveMessage(null);
    setSelectedSlot(null);
    setContactDetailError(null);
    const rowMetadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    qaaBaseRef.current = collectStoredQuestionAnswers({
      ...rowMetadata,
      raw_payload: row?.raw_payload ?? rowMetadata.raw_payload ?? rowMetadata.rawPayload,
    });
    setQaDraft({});
    initialUiAnswersRef.current = {};

    let cancelled = false;
    (async () => {
      setLoadingIclosedFields(true);
      setIclosedFieldsError(null);
      setContactDetailLoading(true);
      setContactDetailError(null);
      try {
        let contactQaByFieldKey = null;
        // 1) Prefill from iClosed contact profile
        const rawContactId = row?.iclosed_contact_id;
        const contactIdStr = rawContactId != null ? String(rawContactId).trim() : '';
        if (contactIdStr && /^\d+$/.test(contactIdStr)) {
          const detailJson = await iclosedFetchJson('contact-detail', { contactId: contactIdStr });
          if (cancelled) return;
          const detail = normalizeContactDetailResponse(detailJson);
          if (detail) {
            const first = detail.firstName || splitName(detail.name).first;
            const last = detail.lastName || splitName(detail.name).last;
            if (first != null) setFirstNameDraft(first);
            if (last != null) setLastNameDraft(last);
            if (detail.phone) setPhoneDraft(detail.phone);
            if (detail.email) setEmailDraft(detail.email);
            // Keep the exact iClosed `questionsAndAnswers` shape as base when available.
            if (detail.qaaRaw && typeof detail.qaaRaw === 'object' && Object.keys(detail.qaaRaw).length > 0) {
              qaaBaseRef.current = {
                ...qaaBaseRef.current,
                ...detail.qaaRaw,
              };
            }
            contactQaByFieldKey = detail.qaByFieldKey;
          }
        }

        if (!cancelled) setContactDetailLoading(false);

        // 2) Booking-form questions: GET /v1/fields/objects?objectType=CALL&inviteeQuestions=true
        const fieldsJson = await iclosedFetchJson('fields');
        if (cancelled) return;
        const sorted = sortIclosedBookingFields(normalizeIclosedFieldsResponse(fieldsJson));
        setIclosedFields(sorted);
        const uiAnswers = buildUiAnswersFromQaa({
          fields: sorted,
          qaa: qaaBaseRef.current,
          qaByFieldKey: contactQaByFieldKey,
        });
        initialUiAnswersRef.current = uiAnswers;
        setQaDraft(uiAnswers);
      } catch (e) {
        if (cancelled) return;
        setIclosedFields([]);
        setIclosedFieldsError(e?.message || 'Failed to load iClosed questions');
        setContactDetailError(e?.message || 'Failed to load iClosed contact details');
      } finally {
        if (!cancelled) {
          setLoadingIclosedFields(false);
          setContactDetailLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, row, iclosedFetchJson]);

  const buildActionPayload = () => {
    const nextQaa = applyUiAnswerDiffToQaa({
      fields: iclosedFields,
      prevQaa: qaaBaseRef.current,
      initialUi: initialUiAnswersRef.current,
      nextUi: qaDraft,
    });
    const baseMetadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const nextMetadata = { ...baseMetadata, questionsAndAnswers: nextQaa };

    return {
      potentialLeadId: row?.id,
      contactId: row?.iclosed_contact_id,
      setterId: row?.assigned_setter_id,
      contact: {
        firstName: firstNameDraft || null,
        lastName: lastNameDraft || null,
        phoneNumber: phoneDraft || null,
        email: emailDraft || null,
      },
      fields: iclosedFields,
      answers: qaDraft,
      metadata: nextMetadata,
    };
  };

  const postIclosedAction = async (resource, payload) => {
    const res = await fetch(`/api/iclosed?resource=${encodeURIComponent(resource)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const msg = json?.message || json?.error || res.statusText || 'Request failed';
      throw new Error(`iClosed ${res.status}: ${msg}`);
    }
    return json;
  };

  const handleSaveQualified = async () => {
    setSaveError(null);
    setSaveMessage(null);
    setSaving(true);
    try {
      await postIclosedAction('save-qualified', buildActionPayload());
      setSaveMessage('Saved in iClosed as Qualified.');
      await onDone?.();
    } catch (e) {
      setSaveError(e?.message || 'Failed to save');
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const handleBookCall = async () => {
    if (!selectedSlot?.dateTime) {
      setSaveError('Select an available iClosed time slot first.');
      return;
    }
    setSaveError(null);
    setSaveMessage(null);
    setBooking(true);
    try {
      await postIclosedAction('book-call', {
        ...buildActionPayload(),
        dateTime: selectedSlot.dateTime,
        timeZone: selectedSlot.timeZone,
      });
      setSaveMessage('Booked in iClosed. Waiting for webhook/Zapier sync.');
      await onDone?.();
    } catch (e) {
      setSaveError(e?.message || 'Failed to book call');
      setBooking(false);
      return;
    }
    setBooking(false);
  };

  const ltStatus = row
    ? computePotentialLeadLtStatus(row, { crmConfirmedEmails })
    : null;
  const dynamicFields = Array.isArray(iclosedFields) ? iclosedFields : [];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: 'min(92vh, 860px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-slate-900">Edit Lead</span>
                {ltStatus && <LtStatusBadge value={ltStatus} />}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 flex-none rounded-lg bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Two-column body — single scroll area */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            {/* Left column: Questionnaire */}
            <div className="border-b border-slate-100 lg:border-b-0 lg:border-r lg:border-slate-100">
              <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Booking questionnaire
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  iClosed booking-form questions
                </p>
              </div>
              <div className="px-6 py-5">
                {iclosedFieldsError && (
                  <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                    {iclosedFieldsError}
                  </div>
                )}
                {loadingIclosedFields ? (
                  <div className="space-y-5">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="space-y-2">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                ) : dynamicFields.length > 0 ? (
                  <div className="space-y-5">
                    {dynamicFields.map((f) => (
                      <QuestionCard
                        key={String(f?.id ?? f?.slug)}
                        field={f}
                        value={qaDraft?.[String(f?.slug ?? f?.id ?? '')]}
                        onChange={(nextVal) => {
                          const k = String(f?.slug ?? f?.id ?? '');
                          if (!k) return;
                          setQaDraft((prev) => ({ ...(prev || {}), [k]: nextVal }));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No booking questions found.
                  </div>
                )}
              </div>
            </div>

            {/* Right column: Contact details + Schedule */}
            <div className="px-6 py-5">
              {saveError && (
                <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                  {saveError}
                </div>
              )}
              {saveMessage && (
                <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200">
                  {saveMessage}
                </div>
              )}
              {contactDetailError && (
                <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  {contactDetailError}
                </div>
              )}

              <div className="mb-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Contact details
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field
                      label="First name"
                      value={firstNameDraft}
                      onChange={setFirstNameDraft}
                      placeholder="First name"
                    />
                    <Field
                      label="Last name"
                      value={lastNameDraft}
                      onChange={setLastNameDraft}
                      placeholder="Last name"
                    />
                  </div>
                  <Field
                    label="Phone"
                    value={phoneDraft}
                    onChange={setPhoneDraft}
                    placeholder="Phone number"
                    type="tel"
                  />
                  <Field
                    label="Email"
                    value={emailDraft}
                    onChange={setEmailDraft}
                    placeholder="Email address"
                    type="email"
                  />
                  {contactDetailLoading && (
                    <div className="text-[11px] font-medium text-slate-400">
                      Prefilling from iClosed…
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Schedule
                </p>
                <IclosedBookingCalendar
                  timeZone="America/New_York"
                  enabled={isOpen}
                  value={selectedSlot}
                  onChange={setSelectedSlot}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer (single) */}
        <div className="flex-none border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || booking}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveQualified}
              disabled={saving || booking}
              className={cx(
                'rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50',
                (saving || booking) && 'cursor-not-allowed opacity-50',
              )}
            >
              {saving ? 'Saving…' : 'Save as Qualified'}
            </button>
            <button
              type="button"
              onClick={handleBookCall}
              disabled={saving || booking || !selectedSlot?.dateTime}
              className={cx(
                'rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors',
                saving || booking || !selectedSlot?.dateTime
                  ? 'cursor-not-allowed bg-slate-300'
                  : 'bg-indigo-600 hover:bg-indigo-700',
              )}
            >
              {booking ? 'Booking…' : 'Book selected slot'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}