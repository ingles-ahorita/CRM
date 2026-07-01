import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import {
  ICLOSED_POTENTIAL_LEADS_TAB_STATUSES,
  ICLOSED_BOOKED_STATUSES,
} from '../../../../../lib/iclosedLeadStatus.js';
import {
  computePotentialLeadLtStatus,
  fetchCrmConfirmedEmails,
  LT_STATUS,
} from '../../../../../lib/potentialLeadLtStatus.js';
import {
  isHiddenPotentialLead,
  isAssignedToActiveSetter,
} from '../../../../lib/potentialLeadsBadgeStats.js';
import LtStatusBadge from '../../potential-leads/LtStatusBadge.jsx';
import {
  buildPotentialLeadStats,
  paginateItems,
  PotentialLeadsPagination,
  VISIBLE_LT_STATUS_UI,
  HIDDEN_LT_STATUSES,
} from '../../potential-leads/potentialLeadsListHelpers.jsx';
import PotentialLeadsInsights from './PotentialLeadsInsights.jsx';
import MultiSelect from './MultiSelect.jsx';
import StatusSelect from './StatusSelect.jsx';
import SegmentedTabs from '../segmented-tabs';
import * as DateHelpers from '../../../../utils/dateHelpers';
import { normalizeCustomBounds } from '../overview/overview-range-helpers.js';
import { useManagementTimezone } from '../../../../contexts/managementTimezone';
import TimezoneToggle from '../TimezoneToggle';

const TAB_STATUS_LIST = [...ICLOSED_POTENTIAL_LEADS_TAB_STATUSES];
// Booked iClosed statuses (strategy_call / discovery_call). These leave the
// Potential/Qualified tab query, so they are fetched separately to feed the
// "Converted" (LT4/LT5) KPI card only — the rest of the page is unaffected.
const BOOKED_STATUS_LIST = [...ICLOSED_BOOKED_STATUSES];

// Global date-range presets (drive the whole page: KPIs, chart, table).
const DATE_RANGE_ITEMS = [
  { id: 'all', label: 'All time', title: 'All time' },
  { id: 'today', label: 'Today', title: 'Today' },
  { id: 'lastWeek', label: 'Last week', title: 'Last week' },
  { id: 'lastMonth', label: 'Last month', title: 'Last month' },
  { id: 'custom', label: 'Custom', title: 'Custom date range' },
];

function resolveDateRange(range, customStart, customEnd, timeZone) {
  if (range === 'today') {
    const { dayStart, dayEnd } = DateHelpers.getDayBoundsInTimezone(new Date(), timeZone);
    return { start: dayStart, end: dayEnd };
  }
  if (range === 'lastWeek') {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart, end: weekEnd };
  }
  if (range === 'lastMonth') {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const m = DateHelpers.getMonthRangeInTimezone(prev, DateHelpers.DEFAULT_TIMEZONE);
    return { start: m.startDate, end: m.endDate };
  }
  if (range === 'custom') {
    if (timeZone && timeZone !== 'UTC') {
      return {
        start: DateHelpers.getDayBoundsInTimezone(customStart, timeZone).dayStart,
        end: DateHelpers.getDayBoundsInTimezone(customEnd, timeZone).dayEnd,
      };
    }
    return normalizeCustomBounds(customStart, customEnd);
  }
  // 'all' (or anything else) → no date bounds; caller spans the full dataset.
  return { start: null, end: null };
}

function formatDate(iso, timeZone) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, timeZone ? { timeZone } : undefined);
  } catch {
    return iso;
  }
}

export default function PotentialLeads() {
  const { timeZone } = useManagementTimezone();
  const [rows, setRows] = useState([]);
  const [bookedRows, setBookedRows] = useState([]);
  const [setters, setSetters] = useState([]);
  const [crmConfirmedEmails, setCrmConfirmedEmails] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSetters, setSelectedSetters] = useState([]); // [] = all
  const [statusFilter, setStatusFilter] = useState('all'); // single-select status filter
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState('all');
  const [customStart, setCustomStart] = useState(() => DateHelpers.getLastNDaysRange(10).startISO.slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => DateHelpers.getLastNDaysRange(10).endISO.slice(0, 10));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [leadsRes, bookedRes, settersRes] = await Promise.all([
      supabase
        .from('potential_leads')
        .select('*, assigned_setter:assigned_setter_id(id, name)')
        .in('iclosed_status', TAB_STATUS_LIST)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('potential_leads')
        .select('*, assigned_setter:assigned_setter_id(id, name)')
        .in('iclosed_status', BOOKED_STATUS_LIST)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('setters').select('id, name').eq('active', true).order('name'),
    ]);

    if (leadsRes.error) {
      setError(leadsRes.error.message);
      setRows([]);
      setBookedRows([]);
      setCrmConfirmedEmails(new Set());
    } else {
      const leadRows = leadsRes.data || [];
      const bookedLeadRows = bookedRes.error ? [] : (bookedRes.data || []);
      setRows(leadRows);
      setBookedRows(bookedLeadRows);
      // LT5 needs a CRM-confirmed calls row; resolve over both cohorts so booked
      // leads can be classified LT4 vs LT5.
      const crmEmails = await fetchCrmConfirmedEmails(supabase, [...leadRows, ...bookedLeadRows]);
      setCrmConfirmedEmails(crmEmails);
    }
    setSetters(settersRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const channel = supabase
      .channel('potential_leads_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'potential_leads' },
        () => fetchAll(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const updateRow = useCallback(async (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error: upErr } = await supabase.from('potential_leads').update(patch).eq('id', id);
    if (upErr) {
      setError(upErr.message);
      fetchAll();
    }
  }, [fetchAll]);

  const ltForRow = useCallback(
    (r) => computePotentialLeadLtStatus(r, { crmConfirmedEmails }),
    [crmConfirmedEmails],
  );

  // Non-actionable records are excluded here at the source — the whole page
  // (KPIs, chart, stage counts, table) derives from baseRows, so these are
  // hidden everywhere, not just from the table:
  //  • LT1 ("Name + Email" only).
  //  • "Other" (no LT stage) records without a phone number.
  const baseRows = useMemo(
    () => rows.filter((r) => !isHiddenPotentialLead(r, ltForRow(r))),
    [rows, ltForRow],
  );

  // Global date range — drives the whole page (KPIs, chart, table).
  // "All time" spans from the earliest lead to today so the chart covers everything.
  const dateBounds = useMemo(() => {
    if (range === 'all') {
      let min = Infinity;
      baseRows.forEach((r) => {
        const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
        if (!Number.isNaN(t) && t < min) min = t;
      });
      if (min === Infinity) return { start: null, end: null };
      return {
        start: DateHelpers.getDayBoundsUTC(new Date(min)).dayStart,
        end: DateHelpers.getDayBoundsUTC(new Date()).dayEnd,
      };
    }
    return resolveDateRange(range, customStart, customEnd, timeZone);
  }, [range, customStart, customEnd, baseRows, timeZone]);

  // Rows within the selected date range (by created_at).
  const dateScopedRows = useMemo(() => {
    const start = dateBounds?.start?.getTime();
    const end = dateBounds?.end?.getTime();
    if (start == null || end == null) return baseRows;
    return baseRows.filter((r) => {
      const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
      return !Number.isNaN(t) && t >= start && t <= end;
    });
  }, [baseRows, dateBounds]);

  // …then narrowed by the selected setters (empty = all setters).
  const scopedRows = useMemo(() => {
    if (selectedSetters.length === 0) return dateScopedRows;
    const set = new Set(selectedSetters);
    return dateScopedRows.filter((r) => set.has(r.assigned_setter_id));
  }, [dateScopedRows, selectedSetters]);

  // …then narrowed by the global search box (name / email / phone / setter).
  // Search is global: it scopes the KPIs, chart, status-option counts AND table.
  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedRows;
    return scopedRows.filter((r) =>
      [r.name, r.email, r.phone, r.assigned_setter?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [scopedRows, search]);

  // Booked (LT4/LT5) leads for the "Converted" KPI, scoped to the same global
  // date range / setter / search as the rest of the page. Two disjoint sources:
  //  • the separate booked-status fetch (strategy_call / discovery_call), and
  //  • manual-CRM bookings still tagged Potential/Qualified (already in searchedRows).
  const convertedRows = useMemo(() => {
    const start = dateBounds?.start?.getTime();
    const end = dateBounds?.end?.getTime();
    const q = search.trim().toLowerCase();
    const setterSet = selectedSetters.length ? new Set(selectedSetters) : null;
    const inScope = (r) => {
      if (start != null && end != null) {
        const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
        if (Number.isNaN(t) || t < start || t > end) return false;
      }
      if (setterSet && !setterSet.has(r.assigned_setter_id)) return false;
      if (
        q &&
        ![r.name, r.email, r.phone, r.assigned_setter?.name]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    };
    const booked = bookedRows.filter(inScope);
    const manualBooked = searchedRows.filter((r) => HIDDEN_LT_STATUSES.has(ltForRow(r)));
    return [...booked, ...manualBooked];
  }, [bookedRows, searchedRows, dateBounds, selectedSetters, search, ltForRow]);

  // A lead is "unassigned" when it has no setter OR its setter is no longer
  // active — the assignment dropdown only lists active setters, so a row pointing
  // at a deactivated setter already shows as "— Unassigned —" in the UI.
  const activeSetterIds = useMemo(() => new Set(setters.map((s) => s.id)), [setters]);
  const isUnassigned = useCallback(
    (row) => !isAssignedToActiveSetter(row, activeSetterIds),
    [activeSetterIds],
  );

  // Whether a row belongs to a given status category.
  const rowMatchesStatus = useCallback((row, lt, key) => {
    switch (key) {
      case 'lt0': return lt === 'lt0';
      case 'lt1': return lt === 'lt1';
      case 'lt2': return lt === 'lt2';
      case 'lt3': return lt === 'lt3';
      case 'other': return lt == null;
      case 'contacted': return !!row.last_contact_attempt_at;
      case 'unassigned': return isUnassigned(row);
      default: return true; // 'all'
    }
  }, [isUnassigned]);

  // Global status filter — drives the whole page (KPIs, chart, table). Booked
  // LT4/LT5 stay counted in the KPIs (e.g. "Converted") but are hidden from the
  // table below, since they are no longer part of the actionable worklist.
  const statusFilteredRows = useMemo(() => {
    if (statusFilter === 'all') return searchedRows;
    return searchedRows.filter((r) => rowMatchesStatus(r, ltForRow(r), statusFilter));
  }, [searchedRows, statusFilter, ltForRow, rowMatchesStatus]);

  const filtered = useMemo(
    () => statusFilteredRows.filter((r) => !HIDDEN_LT_STATUSES.has(ltForRow(r))),
    [statusFilteredRows, ltForRow],
  );

  useEffect(() => {
    setPage(1);
  }, [selectedSetters, statusFilter, search, range, customStart, customEnd]);

  const setterOptions = useMemo(
    () => setters.map((s) => ({ value: s.id, label: s.name })),
    [setters],
  );

  // Status-dropdown option counts reflect the date + setter + search scope, but
  // NOT the status selection itself — so every option keeps a real count and you
  // can switch between statuses without the numbers collapsing to zero.
  const stats = useMemo(
    () => buildPotentialLeadStats(searchedRows, ltForRow, { countUnassigned: true, isUnassigned }),
    [searchedRows, ltForRow, isUnassigned],
  );

  // Extra pill count (contacted = has a logged attempt, excluding booked) over the same scope.
  const extraStats = useMemo(() => {
    let contacted = 0;
    searchedRows.forEach((r) => {
      const lt = ltForRow(r);
      if (HIDDEN_LT_STATUSES.has(lt)) return; // skip booked (LT4/LT5)
      if (r.last_contact_attempt_at) contacted += 1;
    });
    return { contacted };
  }, [searchedRows, ltForRow]);

  const pagination = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  // Status filter options (each shows its colored badge + description + count).
  const statusOptions = [
    { value: 'all', label: 'All statuses', desc: 'Show everything in scope' },
    // LT1 is hidden completely on this page (not actionable), so drop its filter option.
    ...VISIBLE_LT_STATUS_UI.filter((s) => s.value !== LT_STATUS.LT1).map((s) => ({
      value: s.value,
      label: s.label,
      desc: s.description,
      cls: s.cls,
      count: stats.by[s.value] ?? 0,
    })),
    {
      value: 'contacted',
      label: 'Contacted',
      desc: 'Has a logged contact attempt',
      cls: 'bg-teal-50 text-teal-700 ring-teal-200',
      count: extraStats.contacted,
    },
    {
      value: 'unassigned',
      label: 'Unassigned',
      desc: 'No setter assigned',
      cls: 'bg-red-50 text-red-700 ring-red-200',
      count: stats.unassigned,
    },
    {
      value: 'other',
      label: 'Other',
      desc: 'Incomplete — no phone number',
      cls: 'bg-slate-100 text-slate-600 ring-slate-200',
      count: stats.noStage,
    },
  ];

  return (
    <div className="potential-leads-tab w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[28px] font-bold tracking-tight text-[#0f172a]">Potential Leads</h2>
          <div className="flex flex-wrap items-center gap-2">
            <TimezoneToggle />
            <SegmentedTabs items={DATE_RANGE_ITEMS} activeId={range} onChange={setRange} size="xs" fit />
            {range === 'custom' && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
                  aria-label="Custom start date"
                />
                <span className="text-[10px] font-semibold text-slate-500">–</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
                  aria-label="Custom end date"
                />
              </div>
            )}
            <button
              type="button"
              onClick={fetchAll}
              className="potential-leads-btn rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
        <p className="text-[13px] text-slate-500">
          Open iClosed contacts (Potential / Qualified). Status column shows CRM pipeline stage (LT0–LT5), not iClosed scheduling status.
        </p>

        {/* Global filters — scope the KPIs, chart AND table below. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <MultiSelect
            placeholder="All setters"
            options={setterOptions}
            selected={selectedSetters}
            onChange={setSelectedSetters}
            minWidth={200}
          />
          <StatusSelect
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / email / phone / setter…"
            className="min-w-[200px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <PotentialLeadsInsights
        rows={statusFilteredRows}
        convertedRows={convertedRows}
        ltForRow={ltForRow}
        isUnassigned={isUnassigned}
        loading={loading}
        dateBounds={dateBounds}
      />

      <div className="my-4 border-t border-slate-100" />

      <div className="overflow-x-auto rounded-[12px] border border-slate-200">
        <table className="w-full min-w-[1230px] table-fixed divide-y divide-slate-200 text-sm">
          <colgroup>
            <col style={{ width: '150px' }} />
            <col style={{ width: '220px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '230px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '150px' }} />
          </colgroup>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="align-top">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-4 animate-pulse rounded-md bg-slate-200/70" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No potential leads.</td></tr>
            ) : pagination.items.map((r) => (
              <PotentialLeadRow
                key={r.id}
                row={r}
                setters={setters}
                ltStatus={ltForRow(r)}
                onUpdate={updateRow}
                timeZone={timeZone}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PotentialLeadsPagination pagination={pagination} onPageChange={setPage} />
    </div>
  );
}

function PotentialLeadRow({ row, setters, ltStatus, onUpdate, timeZone }) {
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
    <tr className="align-top">
      <td className="px-3 py-2">
        <div className="truncate font-semibold text-slate-800">{row.name || '—'}</div>
        {row.assignment_reason === 'next_scheduled' && (
          <div className="mt-0.5 text-[10px] font-medium uppercase text-amber-600">
            Waiting for shift{row.scheduled_handoff_at ? ` @ ${formatDate(row.scheduled_handoff_at, timeZone)}` : ''}
          </div>
        )}
        {row.assignment_reason === 'unassigned' && (
          <div className="mt-0.5 text-[10px] font-medium uppercase text-red-600">Unassigned</div>
        )}
      </td>
      <td className="px-3 py-2 text-slate-700">
        <div className="truncate">{row.email || '—'}</div>
        <div className="truncate text-slate-500">{row.phone || '—'}</div>
      </td>
      <td className="px-3 py-2 text-slate-700">
        <div className="truncate">{row.source || '—'}</div>
      </td>
      <td className="px-3 py-2">
        <select
          value={row.assigned_setter_id || ''}
          onChange={(e) => onUpdate(row.id, {
            assigned_setter_id: e.target.value || null,
            assignment_reason: 'manual',
            assigned_at: new Date().toISOString(),
          })}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
        >
          <option value="">— Unassigned —</option>
          {setters.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <LtStatusBadge value={ltStatus} />
      </td>
      <td className="px-3 py-2">
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
            className="potential-leads-btn block w-full whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-normal text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            {row.notes ? row.notes : <span className="italic text-slate-400">Add note…</span>}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        <div>{formatDate(row.last_contact_attempt_at, timeZone)}</div>
        <button
          type="button"
          onClick={markContactAttempt}
          className="potential-leads-btn mt-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          Log contact attempt
        </button>
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{formatDate(row.created_at, timeZone)}</td>
    </tr>
  );
}
