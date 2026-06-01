import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import {
  ICLOSED_STATUS,
  ICLOSED_POTENTIAL_LEADS_TAB_UI,
  ICLOSED_POTENTIAL_LEADS_TAB_LOOKUP,
  ICLOSED_POTENTIAL_LEADS_TAB_STATUSES,
  rowIclosedStatus,
} from '../../../../../lib/iclosedLeadStatus.js';

const TAB_STATUS_LIST = [...ICLOSED_POTENTIAL_LEADS_TAB_STATUSES];

function StatusBadge({ value }) {
  const opt = ICLOSED_POTENTIAL_LEADS_TAB_LOOKUP[value];
  if (!opt) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-300">
        {value || '—'}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${opt.cls}`}
    >
      {opt.label}
    </span>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [leadsRes, settersRes] = await Promise.all([
      supabase
        .from('potential_leads')
        .select('*, assigned_setter:assigned_setter_id(id, name)')
        .in('status', TAB_STATUS_LIST)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('setters').select('id, name').eq('active', true).order('name'),
    ]);

    if (leadsRes.error) setError(leadsRes.error.message);
    setRows(leadsRes.data || []);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const st = rowIclosedStatus(r);
      if (!st || !ICLOSED_POTENTIAL_LEADS_TAB_STATUSES.has(st)) return false;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone, r.assigned_setter?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => {
    const by = {
      [ICLOSED_STATUS.POTENTIAL]: 0,
      [ICLOSED_STATUS.QUALIFIED]: 0,
      unassigned: 0,
    };
    rows.forEach((r) => {
      const st = rowIclosedStatus(r);
      if (st && by[st] != null) by[st] += 1;
      if (!r.assigned_setter_id) by.unassigned += 1;
    });
    return by;
  }, [rows]);

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
          Potential and Qualified iClosed contacts; removed automatically when a call is booked (handled in Zapier).
        </p>

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Total: {rows.length}</span>
          {ICLOSED_POTENTIAL_LEADS_TAB_UI.map((s) => (
            <span
              key={s.value}
              className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${s.cls}`}
            >
              {s.label}: {stats[s.value] ?? 0}
            </span>
          ))}
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
            <option value="all">All (Potential + Qualified)</option>
            {ICLOSED_POTENTIAL_LEADS_TAB_UI.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
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
              <th className="px-3 py-2 text-left">iClosed status</th>
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
            ) : filtered.map((r) => (
              <PotentialLeadRow
                key={r.id}
                row={r}
                setters={setters}
                onUpdate={updateRow}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PotentialLeadRow({ row, setters, onUpdate }) {
  const [noteDraft, setNoteDraft] = useState(row.notes || '');
  const [editingNote, setEditingNote] = useState(false);
  const iclosedStatus = rowIclosedStatus(row);

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
        <StatusBadge value={iclosedStatus} />
        <p className="mt-1 text-[10px] text-slate-400">Updated by iClosed webhook</p>
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
