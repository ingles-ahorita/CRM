import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../../../lib/supabaseClient';

// Editable status enum — must match supabase enum potential_lead_status.
const STATUS_OPTIONS = [
  { value: 'new',       label: 'New',       cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  { value: 'attempted', label: 'Attempted', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { value: 'reached',   label: 'Reached',   cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  { value: 'booked',    label: 'Booked',    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { value: 'lost',      label: 'Lost',      cls: 'bg-slate-100 text-slate-600 ring-slate-300' },
];

const STATUS_LOOKUP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]));

function StatusBadge({ value }) {
  const opt = STATUS_LOOKUP[value] || STATUS_LOOKUP.new;
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
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' | 'all' | enum
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [leadsRes, settersRes] = await Promise.all([
      supabase
        .from('potential_leads')
        .select('*, assigned_setter:assigned_setter_id(id, name)')
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

  // Realtime: refresh when rows change
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
    // Optimistic update
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
      if (statusFilter === 'open' && (r.status === 'booked' || r.status === 'lost')) return false;
      if (statusFilter !== 'open' && statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone, r.assigned_setter?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => {
    const by = { new: 0, attempted: 0, reached: 0, booked: 0, lost: 0, unassigned: 0 };
    rows.forEach((r) => {
      if (by[r.status] != null) by[r.status] += 1;
      if (!r.assigned_setter_id) by.unassigned += 1;
    });
    return by;
  }, [rows]);

  return (
    <div className="w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[28px] font-bold tracking-tight text-[#0f172a]">Potential Leads</h2>
          <button
            type="button"
            onClick={fetchAll}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
        <p className="text-[13px] text-slate-500">
          Qualified contacts from iClosed who haven't booked a call yet — auto-assigned to the setter on shift.
        </p>

        {/* Stats row */}
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Total: {rows.length}</span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">New: {stats.new}</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Attempted: {stats.attempted}</span>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">Reached: {stats.reached}</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Booked: {stats.booked}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Lost: {stats.lost}</span>
          {stats.unassigned > 0 && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">Unassigned: {stats.unassigned}</span>
          )}
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="open">Open only</option>
            <option value="all">All</option>
            {STATUS_OPTIONS.map((s) => (
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
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Notes</th>
              <th className="px-3 py-2 text-left">Last Attempt</th>
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

  useEffect(() => {
    setNoteDraft(row.notes || '');
  }, [row.notes]);

  const commitNote = () => {
    if ((row.notes || '') !== noteDraft) {
      onUpdate(row.id, { notes: noteDraft });
    }
    setEditingNote(false);
  };

  const markAttempt = () => {
    onUpdate(row.id, {
      status: row.status === 'new' ? 'attempted' : row.status,
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
      <td className="px-3 py-2 text-slate-700">{row.source || row.iclosed_status || '—'}</td>
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
        <div className="flex flex-col items-start gap-1">
          <select
            value={row.status}
            onChange={(e) => onUpdate(row.id, { status: e.target.value })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <StatusBadge value={row.status} />
        </div>
      </td>
      <td className="px-3 py-2 min-w-[220px]">
        {editingNote ? (
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            rows={2}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            className="block w-full whitespace-pre-wrap text-left text-xs text-slate-700 hover:text-slate-900"
          >
            {row.notes ? row.notes : <span className="italic text-slate-400">Add note…</span>}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        <div>{formatDate(row.last_contact_attempt_at)}</div>
        <button
          type="button"
          onClick={markAttempt}
          className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Mark attempt
        </button>
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{formatDate(row.created_at)}</td>
    </tr>
  );
}
