import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { ICLOSED_POTENTIAL_LEADS_TAB_STATUSES } from '../../../../../lib/iclosedLeadStatus.js';
import {
  computePotentialLeadLtStatus,
  fetchCrmConfirmedEmails,
} from '../../../../../lib/potentialLeadLtStatus.js';
import LtStatusBadge from '../../potential-leads/LtStatusBadge.jsx';
import {
  buildPotentialLeadStats,
  paginateItems,
  PotentialLeadsPagination,
  VISIBLE_LT_STATUS_UI,
  HIDDEN_LT_STATUSES,
} from '../../potential-leads/potentialLeadsListHelpers.jsx';

const TAB_STATUS_LIST = [...ICLOSED_POTENTIAL_LEADS_TAB_STATUSES];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PotentialLeads() {
  const [rows, setRows] = useState([]);
  const [setters, setSetters] = useState([]);
  const [crmConfirmedEmails, setCrmConfirmedEmails] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [leadsRes, settersRes] = await Promise.all([
      supabase
        .from('potential_leads')
        .select('*, assigned_setter:assigned_setter_id(id, name)')
        .in('iclosed_status', TAB_STATUS_LIST)
        .order('created_at', { ascending: false })
        .limit(500),
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const lt = ltForRow(r);
      if (HIDDEN_LT_STATUSES.has(lt)) return false;
      if (statusFilter !== 'all' && lt !== statusFilter) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone, r.assigned_setter?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter, ltForRow]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  const stats = useMemo(
    () => buildPotentialLeadStats(filtered, ltForRow, { countUnassigned: true }),
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
          <h2 className="text-[28px] font-bold tracking-tight text-[#0f172a]">Potential Leads</h2>
          <button
            type="button"
            onClick={fetchAll}
            className="potential-leads-btn rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
        <p className="text-[13px] text-slate-500">
          Open iClosed contacts (Potential / Qualified). Status column shows CRM pipeline stage (LT1–LT5), not iClosed scheduling status.
        </p>

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Total: {stats.total}</span>
          {VISIBLE_LT_STATUS_UI.map((s) => (
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
              title="Rows missing name+email or other LT requirements"
            >
              Other: {stats.noStage}
            </span>
          )}
          {stats.unassigned > 0 && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700 ring-1 ring-inset ring-red-200">
              Unassigned: {stats.unassigned}
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
            {VISIBLE_LT_STATUS_UI.map((s) => (
              <option key={s.value} value={s.value}>{s.label} — {s.description}</option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / email / phone / setter…"
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No potential leads.</td></tr>
            ) : pagination.items.map((r) => (
              <PotentialLeadRow
                key={r.id}
                row={r}
                setters={setters}
                ltStatus={ltForRow(r)}
                onUpdate={updateRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PotentialLeadsPagination pagination={pagination} onPageChange={setPage} />
    </div>
  );
}

function PotentialLeadRow({ row, setters, ltStatus, onUpdate }) {
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
        <div className="font-semibold text-slate-800">{row.name || '—'}</div>
        {row.assignment_reason === 'next_scheduled' && (
          <div className="mt-0.5 text-[10px] font-medium uppercase text-amber-600">
            Waiting for shift{row.scheduled_handoff_at ? ` @ ${formatDate(row.scheduled_handoff_at)}` : ''}
          </div>
        )}
        {row.assignment_reason === 'unassigned' && (
          <div className="mt-0.5 text-[10px] font-medium uppercase text-red-600">Unassigned</div>
        )}
      </td>
      <td className="px-3 py-2 text-slate-700">
        <div className="truncate">{row.email || '—'}</div>
        <div className="text-slate-500">{row.phone || '—'}</div>
      </td>
      <td className="px-3 py-2 text-slate-700">{row.source || '—'}</td>
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
      <td className="px-3 py-2 min-w-[220px]">
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
      <td className="px-3 py-2 text-xs text-slate-600">
        <div>{formatDate(row.last_contact_attempt_at)}</div>
        <button
          type="button"
          onClick={markContactAttempt}
          className="potential-leads-btn mt-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
        >
          Log contact attempt
        </button>
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{formatDate(row.created_at)}</td>
    </tr>
  );
}