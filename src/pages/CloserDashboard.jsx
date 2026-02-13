import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { fetchPurchases as fetchKajabiPurchases } from '../lib/kajabiApi';
import * as DateHelpers from '../utils/dateHelpers';

export default function CloserDashboard() {
  const { closer } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [closerName, setCloserName] = useState('');
  const [currentMonthCommission, setCurrentMonthCommission] = useState(0);
  const [noShowCalls, setNoShowCalls] = useState([]);
  const [multipayPurchases, setMultipayPurchases] = useState([]);

  const currentMonthKey = (() => {
    const ym = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
    return ym ? ym.monthKey : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  })();

  useEffect(() => {
    if (!closer) return;
    let cancelled = false;

    const monthRange = DateHelpers.getMonthRangeInTimezone(
      new Date(Date.UTC(parseInt(currentMonthKey.slice(0, 4), 10), parseInt(currentMonthKey.slice(5, 7), 10) - 1, 15)),
      DateHelpers.DEFAULT_TIMEZONE
    );
    const startISO = monthRange?.startDate.toISOString();
    const endISO = monthRange?.endDate.toISOString();

    async function load() {
      setLoading(true);

      const [closersRes, commissionRes, callsRes] = await Promise.all([
        supabase.from('closers').select('id, name').eq('id', closer).maybeSingle(),
        loadCurrentMonthCommission(closer, currentMonthKey, startISO, endISO),
        supabase
          .from('calls')
          .select('id, call_date, lead_id, leads(id, name, email)')
          .eq('closer_id', closer)
          .eq('showed_up', false)
          .order('call_date', { ascending: false })
          .limit(20)
      ]);

      if (cancelled) return;
      if (closersRes.data?.name) setCloserName(closersRes.data.name);
      setCurrentMonthCommission(commissionRes);
      setNoShowCalls((callsRes.data || []).map((c) => ({ ...c, name: c.leads?.name ?? '—', email: c.leads?.email ?? '—' })));

      const multipay = await loadMultipayPurchasesLastMonth();
      if (!cancelled) setMultipayPurchases(multipay);

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [closer, currentMonthKey]);

  async function loadCurrentMonthCommission(closerId, monthKey, startISO, endISO) {
    if (!startISO || !endISO) return 0;

    const [year, monthNum] = monthKey.split('-').map(Number);
    const prevMonthDate = new Date(Date.UTC(year, monthNum - 2, 1));
    const prevStart = new Date(Date.UTC(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1, 0, 0, 0, 0));
    const prevEnd = new Date(Date.UTC(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0, 23, 59, 59, 999));
    const prevStartISO = prevStart.toISOString().split('T')[0] + 'T00:00:00.000Z';
    const prevEndISO = prevEnd.toISOString().split('T')[0] + 'T23:59:59.999Z';

    const [
      { data: yesLogs },
      { data: secondInstallments },
      { data: refundLogs },
      { data: sameMonthPurchases }
    ] = await Promise.all([
      supabase
        .from('outcome_log')
        .select('commission, calls!inner!call_id(closer_id)')
        .eq('outcome', 'yes')
        .gte('purchase_date', startISO)
        .lte('purchase_date', endISO)
        .then((r) => (r.error ? { data: [] } : r)),
      supabase
        .from('outcome_log')
        .select('commission, calls!inner!call_id(closer_id)')
        .eq('outcome', 'yes')
        .eq('paid_second_installment', true)
        .gte('purchase_date', prevStartISO)
        .lte('purchase_date', prevEndISO)
        .then((r) => (r.error ? { data: [] } : r)),
      supabase
        .from('outcome_log')
        .select('commission, calls!inner!call_id(closer_id)')
        .eq('outcome', 'refund')
        .not('refund_date', 'is', null)
        .gte('refund_date', startISO)
        .lte('refund_date', endISO)
        .then((r) => (r.error ? { data: [] } : r)),
      supabase
        .from('outcome_log')
        .select('commission, outcome, calls!inner!call_id(closer_id)')
        .in('outcome', ['yes', 'refund'])
        .gte('purchase_date', startISO)
        .lte('purchase_date', endISO)
        .then((r) => (r.error ? { data: [] } : r))
    ]);

    const filterCloser = (arr) => (arr || []).filter((x) => x.calls?.closer_id === closerId);

    const baseRevenue = filterCloser(yesLogs).reduce((s, x) => s + (Number(x.commission) || 0), 0);
    const secondComm = filterCloser(secondInstallments).reduce((s, x) => s + (Number(x.commission) || 0), 0);
    const refundsComm = filterCloser(refundLogs).reduce((s, x) => s + (Number(x.commission) || 0), 0);
    const sameMonthRefundsComm = filterCloser(sameMonthPurchases)
      .filter((p) => p.outcome === 'refund' && p.commission != null)
      .reduce((s, p) => s + (Number(p.commission) || 0), 0);

    return baseRevenue + secondComm + refundsComm + sameMonthRefundsComm;
  }

  async function loadMultipayPurchasesLastMonth() {
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const firstDayLastMonth = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const startTs = firstDayLastMonth.getTime();
    const endTs = endDate.getTime();
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const allInRange = [];
    let page = 1;
    const perPage = 100;
    let done = false;
    while (!done) {
      const result = await fetchKajabiPurchases({ page, perPage, sort: '-created_at' });
      const data = result.data || [];
      if (data.length === 0) break;
      for (const p of data) {
        const createdAt = p.attributes?.created_at;
        if (!createdAt) continue;
        const ts = new Date(createdAt).getTime();
        if (ts >= startTs && ts <= endTs) allInRange.push(p);
      }
      const oldestInBatch = data[data.length - 1].attributes?.created_at;
      const oldestTs = oldestInBatch ? new Date(oldestInBatch).getTime() : 0;
      if (oldestTs > 0 && oldestTs < startTs) done = true;
      else if (data.length < perPage) done = true;
      else page++;
    }

    const multipayOnly = allInRange.filter(
      (p) => String(p.attributes?.payment_type || '').toLowerCase() === 'multipay'
    );

    const customerIds = [...new Set(multipayOnly.map((p) => p.relationships?.customer?.data?.id).filter(Boolean))];
    const leadByCustomerId = {};
    if (customerIds.length > 0) {
      const ids = customerIds.map((id) => String(id));
      const { data: leadRows } = await supabase
        .from('leads')
        .select('id, name, email, customer_id')
        .in('customer_id', ids);
      (leadRows || []).forEach((row) => {
        const cid = row.customer_id != null ? String(row.customer_id) : null;
        if (cid) leadByCustomerId[cid] = { name: row.name ?? null, email: row.email ?? null };
      });
    }

    return multipayOnly.map((p) => {
      const attrs = p.attributes || {};
      const createdAt = attrs.created_at;
      const customerId = p.relationships?.customer?.data?.id;
      const lead = customerId ? leadByCustomerId[String(customerId)] : null;
      const createdTs = createdAt ? new Date(createdAt).getTime() : 0;
      const isPastOneMonth = createdTs > 0 && createdTs < oneMonthAgo;
      const paymentsMade = attrs.multipay_payments_made != null ? Number(attrs.multipay_payments_made) : 0;

      let status = 'gray';
      if (isPastOneMonth && paymentsMade === 1) status = 'red';
      else if (paymentsMade === 2) status = 'green';

      return {
        name: lead?.name ?? '—',
        email: lead?.email ?? '—',
        date: createdAt ? new Date(createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—',
        status
      };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 px-3 py-1.5 rounded bg-gray-600 text-white text-sm hover:bg-gray-700"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          {closerName || 'Closer'} Dashboard
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Commission (current month)</h2>
            <div className="text-3xl font-bold text-purple-600">
              ${typeof currentMonthCommission === 'number' ? currentMonthCommission.toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-gray-400 mt-1">{currentMonthKey}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Recent no-shows (showed_up = false)</h2>
            <ul className="space-y-2 max-h-48 overflow-auto">
              {noShowCalls.length === 0 ? (
                <li className="text-gray-500 text-sm">No recent no-shows</li>
              ) : (
                noShowCalls.map((call) => (
                  <li key={call.id} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                    <span className="font-medium text-gray-900">{call.name}</span>
                    <span className="text-gray-500 truncate ml-2">{call.email}</span>
                    <span className="text-gray-400 text-xs whitespace-nowrap ml-2">
                      {call.call_date ? new Date(call.call_date).toLocaleDateString() : '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => call.lead_id && navigate(`/lead/${call.lead_id}`)}
                      className="text-indigo-600 hover:underline text-xs ml-2"
                    >
                      View
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 max-w-sm">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Kajabi multipay (last month)
          </h2>
          <p className="text-xs text-gray-400 mb-2">Gray / red (1 pay, &gt;1 mo) / green (2 pay)</p>
          <ul className="space-y-1">
            {multipayPurchases.length === 0 ? (
              <li className="text-gray-500 text-xs py-1">No multipay in last month</li>
            ) : (
              multipayPurchases.map((row, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded ${
                    row.status === 'gray' ? 'bg-gray-100' : row.status === 'red' ? 'bg-red-50' : 'bg-green-50'
                  }`}
                >
                  <span className="font-medium text-gray-900 truncate min-w-0 flex-1" title={row.name}>{row.name}</span>
                  <span className="text-gray-500 truncate max-w-[100px]" title={row.email}>{row.email}</span>
                  <span className="text-gray-400 whitespace-nowrap shrink-0">{row.date}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
