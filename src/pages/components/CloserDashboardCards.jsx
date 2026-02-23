import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { fetchPurchases as fetchKajabiPurchases } from '../../lib/kajabiApi';
import * as DateHelpers from '../../utils/dateHelpers';

export default function CloserDashboardCards({ closer }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [currentMonthCommission, setCurrentMonthCommission] = useState(0);
  const [currentMonthConversionRate, setCurrentMonthConversionRate] = useState(null);
  const [currentMonthPifRate, setCurrentMonthPifRate] = useState(null);
  const [currentMonthDownsellRate, setCurrentMonthDownsellRate] = useState(null);
  const [noShowCalls, setNoShowCalls] = useState([]);
  const [multipayPurchases, setMultipayPurchases] = useState([]);
  const [last5ShowUps, setLast5ShowUps] = useState([]);

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

      const [commissionRes, conversionRes, pifRateRes, downsellRateRes, callsRes, last5Res] = await Promise.all([
        loadCurrentMonthCommission(closer, currentMonthKey, startISO, endISO),
        loadCurrentMonthConversionRate(closer, startISO, endISO),
        loadCurrentMonthPifRate(closer, startISO, endISO),
        loadCurrentMonthDownsellRate(closer, startISO, endISO),
        supabase
          .from('calls')
          .select('id, call_date, lead_id, leads(id, name, email)')
          .eq('closer_id', closer)
          .eq('showed_up', false)
          .order('call_date', { ascending: false })
          .limit(20),
        supabase
          .from('calls')
          .select('id, call_date, lead_id, leads(id, name, email), outcome_log!call_id(outcome)')
          .eq('closer_id', closer)
          .eq('showed_up', true)
          .order('call_date', { ascending: false })
          .limit(5)
          .then((r) => (r.error ? { data: [] } : r))
      ]);

      if (cancelled) return;
      setCurrentMonthCommission(commissionRes);
      setCurrentMonthConversionRate(conversionRes);
      setCurrentMonthPifRate(pifRateRes);
      setCurrentMonthDownsellRate(downsellRateRes);
      setNoShowCalls((callsRes.data || []).map((c) => ({ ...c, name: c.leads?.name ?? '—', email: c.leads?.email ?? '—' })));
      setLast5ShowUps((last5Res.data || []).map((c) => {
        const ol = c.outcome_log;
        const outcome = Array.isArray(ol) ? ol[0]?.outcome : ol?.outcome;
        return {
          id: c.id,
          lead_id: c.lead_id,
          name: c.leads?.name ?? '—',
          email: c.leads?.email ?? '—',
          call_date: c.call_date ?? null,
          outcome: outcome ?? null
        };
      }));

      const multipay = await loadMultipayPurchasesLastMonth(closer);
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

  async function loadCurrentMonthConversionRate(closerId, startISO, endISO) {
    if (!startISO || !endISO) return null;
    const [
      { count: showedUpCount },
      { data: yesLogs }
    ] = await Promise.all([
      supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('closer_id', closerId)
        .eq('showed_up', true)
        .gte('call_date', startISO)
        .lte('call_date', endISO),
      supabase
        .from('outcome_log')
        .select('id, calls!inner!call_id(closer_id)')
        .eq('outcome', 'yes')
        .gte('purchase_date', startISO)
        .lte('purchase_date', endISO)
        .then((r) => (r.error ? { data: [] } : r))
    ]);
    const purchaseCount = (yesLogs || []).filter((x) => x.calls?.closer_id === closerId).length;
    const showed = typeof showedUpCount === 'number' ? showedUpCount : 0;
    if (showed === 0) return null;
    return Math.round((purchaseCount / showed) * 1000) / 10;
  }

  async function loadCurrentMonthPifRate(closerId, startISO, endISO) {
    if (!startISO || !endISO) return null;
    const { data: yesLogs } = await supabase
      .from('outcome_log')
      .select('id, calls!inner!call_id(closer_id), offers!offer_id(installments)')
      .eq('outcome', 'yes')
      .gte('purchase_date', startISO)
      .lte('purchase_date', endISO)
      .then((r) => (r.error ? { data: [] } : r));
    const forCloser = (yesLogs || []).filter((x) => x.calls?.closer_id === closerId);
    const total = forCloser.length;
    if (total === 0) return null;
    const pifCount = forCloser.filter((x) => {
      const inst = x.offers?.installments;
      return inst !== null && inst !== undefined && Number(inst) === 0;
    }).length;
    return Math.round((pifCount / total) * 1000) / 10;
  }

  async function loadCurrentMonthDownsellRate(closerId, startISO, endISO) {
    if (!startISO || !endISO) return null;
    const { data: yesLogs } = await supabase
      .from('outcome_log')
      .select('id, calls!inner!call_id(closer_id), offers!offer_id(weekly_classes)')
      .eq('outcome', 'yes')
      .gte('purchase_date', startISO)
      .lte('purchase_date', endISO)
      .then((r) => (r.error ? { data: [] } : r));
    const forCloser = (yesLogs || []).filter((x) => x.calls?.closer_id === closerId);
    const total = forCloser.length;
    if (total === 0) return null;
    const downsellCount = forCloser.filter((x) => {
      const wc = x.offers?.weekly_classes;
      return wc !== null && wc !== undefined;
    }).length;
    return Math.round((downsellCount / total) * 1000) / 10;
  }

  async function loadMultipayPurchasesLastMonth(closerId) {
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
    let leadIdsForCloser = new Set();
    if (customerIds.length > 0 && closerId) {
      const ids = customerIds.map((id) => String(id));
      const { data: leadRows } = await supabase
        .from('leads')
        .select('id, name, email, customer_id')
        .in('customer_id', ids);
      (leadRows || []).forEach((row) => {
        const cid = row.customer_id != null ? String(row.customer_id) : null;
        if (cid) leadByCustomerId[cid] = { id: row.id, name: row.name ?? null, email: row.email ?? null };
      });
      const leadIds = (leadRows || []).map((r) => r.id).filter(Boolean);
      if (leadIds.length > 0) {
        const { data: callsWithCloser } = await supabase
          .from('calls')
          .select('lead_id')
          .eq('closer_id', closerId)
          .in('lead_id', leadIds);
        (callsWithCloser || []).forEach((c) => {
          if (c.lead_id != null) leadIdsForCloser.add(c.lead_id);
        });
      }
    }

    const forThisCloser = closerId
      ? multipayOnly.filter((p) => {
          const customerId = p.relationships?.customer?.data?.id;
          const lead = customerId ? leadByCustomerId[String(customerId)] : null;
          return lead && leadIdsForCloser.has(lead.id);
        })
      : multipayOnly;

    return forThisCloser.map((p) => {
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
        lead_id: lead?.id ?? null,
        name: lead?.name ?? '—',
        email: lead?.email ?? '—',
        date: createdAt ? new Date(createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—',
        status
      };
    });
  }

  if (!closer) return null;

  function outcomeColor(outcome) {
    if (!outcome) return 'bg-gray-300';
    if (outcome === 'yes') return 'bg-green-500';
    if (outcome === 'no') return 'bg-red-500';
    if (outcome === 'lock_in' || outcome === 'follow_up') return 'bg-purple-500';
    return 'bg-gray-300';
  }

  function outcomeSymbol(outcome) {
    if (outcome === 'yes') return '✓';
    if (outcome === 'no') return '×';
    if (outcome === 'lock_in' || outcome === 'follow_up') return '?';
    return '';
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
      <div className="bg-white rounded-lg shadow p-6 self-start relative">
        <button
          type="button"
          onClick={() => navigate(`/closer-stats/${closer}`)}
          className="absolute top-3 right-3 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          title="View closer stats"
          aria-label="View closer stats"
        >
          <BarChart3 size={18} />
        </button>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Commission (current month)</h2>
        <div className="text-3xl font-bold text-purple-600">
          {loading ? '—' : `$${typeof currentMonthCommission === 'number' ? currentMonthCommission.toFixed(2) : '0.00'}`}
        </div>
        <p className="text-xs text-gray-400 mt-1">{currentMonthKey}</p>
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Conversion rate</p>
          <p className="text-3xl font-semibold text-gray-900">
            {loading ? '—' : (currentMonthConversionRate != null ? `${currentMonthConversionRate}%` : '—')}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Purchases / showed up (current month)</p>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">PIF rate</p>
            <p className="text-lg font-semibold text-gray-900">
              {loading ? '—' : (currentMonthPifRate != null ? `${currentMonthPifRate}%` : '—')}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Single payment %</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Downsell rate</p>
            <p className="text-lg font-semibold text-gray-900">
              {loading ? '—' : (currentMonthDownsellRate != null ? `${currentMonthDownsellRate}%` : '—')}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">% with weekly_classes offer</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 self-start">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Last 5</h2>
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {loading ? (
            <span className="text-gray-500 text-xs">Loading…</span>
          ) : last5ShowUps.length === 0 ? (
            <span className="text-gray-500 text-xs">No show-ups yet</span>
          ) : (
            [...last5ShowUps].reverse().map((call) => (
              <div key={call.id} className="relative group">
                <button
                  type="button"
                  onClick={() => call.lead_id && navigate(`/lead/${call.lead_id}`)}
                  className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${outcomeColor(call.outcome)} ${call.lead_id ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400' : ''} transition-shadow`}
                  aria-label={call.lead_id ? `View ${call.name}` : undefined}
                >
                  {outcomeSymbol(call.outcome)}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none z-10 min-w-[120px] max-w-[220px]">
                  <div className="font-medium text-white truncate" title={call.name}>{call.name}</div>
                  <div className="text-gray-300 truncate mt-0.5" title={call.email}>{call.email}</div>
                  {call.call_date && (
                    <div className="text-gray-400 mt-0.5 text-[11px]">
                      {DateHelpers.formatTimeWithRelative(call.call_date)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 self-start">
        <style>{`
          .recent-noshows-scroll::-webkit-scrollbar { width: 5px; }
          .recent-noshows-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
          .recent-noshows-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
          .recent-noshows-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          .recent-noshows-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 #f1f5f9; }
        `}</style>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Recent no-shows</h2>
        <ul className="recent-noshows-scroll space-y-1 max-h-48 overflow-auto text-xs pr-0.5">
          {loading ? (
            <li className="text-gray-500 py-0.5">Loading…</li>
          ) : noShowCalls.length === 0 ? (
            <li className="text-gray-500 py-0.5">No recent no-shows</li>
          ) : (
            noShowCalls.map((call) => (
              <li
                key={call.id}
                role={call.lead_id ? 'button' : undefined}
                tabIndex={call.lead_id ? 0 : undefined}
                onClick={call.lead_id ? () => navigate(`/lead/${call.lead_id}`) : undefined}
                onKeyDown={call.lead_id ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/lead/${call.lead_id}`); } } : undefined}
                className={`flex justify-between items-center gap-2 py-1 border-b border-gray-100 last:border-0 ${call.lead_id ? 'cursor-pointer hover:opacity-80' : ''}`}
              >
                <span className="font-medium text-gray-900 truncate min-w-0">{call.name}</span>
                <span className="text-gray-400 whitespace-nowrap shrink-0">
                  {call.call_date ? DateHelpers.formatTimeAgo(call.call_date) : '—'}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Kajabi multipay (last month)
        </h2>
        <p className="text-xs text-gray-400 mb-2">Gray / red (1 pay, &gt;1 mo) / green (2 pay)</p>
        <ul className="space-y-1">
          {loading ? (
            <li className="text-gray-500 text-xs py-1">Loading…</li>
          ) : multipayPurchases.length === 0 ? (
            <li className="text-gray-500 text-xs py-1">No multipay in last month</li>
          ) : (
            multipayPurchases.map((row, i) => (
              <li
                key={i}
                role={row.lead_id ? 'button' : undefined}
                tabIndex={row.lead_id ? 0 : undefined}
                onClick={row.lead_id ? () => navigate(`/lead/${row.lead_id}`) : undefined}
                onKeyDown={row.lead_id ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/lead/${row.lead_id}`); } } : undefined}
                className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded ${
                  row.status === 'gray' ? 'bg-gray-100' : row.status === 'red' ? 'bg-red-50' : 'bg-green-50'
                } ${row.lead_id ? 'cursor-pointer hover:opacity-80' : ''}`}
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
  );
}
