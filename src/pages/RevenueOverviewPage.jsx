import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as DateHelpers from '../utils/dateHelpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

function formatMoney(cents) {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SummaryCard({ label, value, sub, colorClass = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-1 min-w-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

export default function RevenueOverviewPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const ym = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
    return ym ? ym.monthKey : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [expandedTx, setExpandedTx] = useState(null);
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  // Enriched rows: one per kajabi_transaction, with purchase + offer + closer info
  const [rows, setRows]           = useState([]);
  const [hasData, setHasData]     = useState(null); // null=loading, true/false

  const loadData = useCallback(async (monthKey) => {
    setLoading(true);
    setError(null);
    try {
      const [year, monthNum] = monthKey.split('-');
      const monthDate = new Date(Date.UTC(parseInt(year, 10), parseInt(monthNum, 10) - 1, 15));
      const monthRange = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
      if (!monthRange) throw new Error('Invalid month range');
      const start = monthRange.startDate.toISOString();
      const end   = monthRange.endDate.toISOString();

      // 1. Check if we have any mirrored data
      const { count } = await supabase
        .from('kajabi_purchases')
        .select('id', { count: 'exact', head: true });

      if ((count ?? 0) === 0) {
        setHasData(false);
        setRows([]);
        setLoading(false);
        return;
      }
      setHasData(true);

      // 2. Fetch transactions in range (these are the actual cash events)
      const { data: txData, error: txErr } = await supabase
        .from('kajabi_transactions')
        .select('kajabi_transaction_id, kajabi_purchase_id, kajabi_offer_id, kajabi_customer_id, action, state, amount_in_cents, currency, created_at_kajabi, raw')
        .gte('created_at_kajabi', start)
        .lte('created_at_kajabi', end)
        .order('created_at_kajabi', { ascending: false });

      if (txErr) throw txErr;
      if (!txData || txData.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 3. Fetch parent purchases for those transactions
      const purchaseIds = [...new Set(txData.map((t) => t.kajabi_purchase_id).filter(Boolean))];

      const { data: purchaseData, error: pErr } = purchaseIds.length > 0
        ? await supabase
            .from('kajabi_purchases')
            .select('kajabi_purchase_id, kajabi_offer_id, kajabi_customer_id, payment_type, status, coupon_code, multipay_payments_made, created_at_kajabi')
            .in('kajabi_purchase_id', purchaseIds)
        : { data: [], error: null };

      if (pErr) throw pErr;

      const purchaseById = {};
      for (const p of purchaseData || []) purchaseById[p.kajabi_purchase_id] = p;

      // 4. Fetch offer names — use offer_id from purchase if linked, else from transaction directly
      const offerIds = [...new Set([
        ...(purchaseData || []).map((p) => p.kajabi_offer_id),
        ...txData.map((t) => t.kajabi_offer_id),
      ].filter(Boolean))];

      const { data: offerData } = offerIds.length > 0
        ? await supabase.from('offers').select('kajabi_id, name').in('kajabi_id', offerIds)
        : { data: [] };

      const offerByKajabiId = {};
      for (const o of offerData || []) offerByKajabiId[String(o.kajabi_id)] = o;

      // 5. Fetch closer info (join via outcome_log.kajabi_purchase_id → closers.name)
      const allKajabiPurchaseIds = txData.map((t) => t.kajabi_purchase_id).filter(Boolean);
      const { data: outcomeData } = allKajabiPurchaseIds.length > 0
        ? await supabase
            .from('outcome_log')
            .select('kajabi_purchase_id, calls!inner!call_id(closers!closer_id(name))')
            .in('kajabi_purchase_id', allKajabiPurchaseIds)
        : { data: [] };

      const closerByPurchaseId = {};
      for (const o of outcomeData || []) {
        if (o.kajabi_purchase_id) {
          closerByPurchaseId[String(o.kajabi_purchase_id)] = o.calls?.closers?.name ?? null;
        }
      }

      // 6. Enrich each transaction row
      const enriched = txData.map((t) => {
        const purchase = purchaseById[t.kajabi_purchase_id] ?? null;
        const offer    = purchase ? offerByKajabiId[String(purchase.kajabi_offer_id)] ?? null : null;
        const closer   = t.kajabi_purchase_id ? closerByPurchaseId[String(t.kajabi_purchase_id)] ?? null : null;

        const action = t.action ?? (t.amount_in_cents >= 0 ? 'charge' : 'refund');
        const isCharge  = action === 'charge';
        const isRefund  = action === 'refund' || t.amount_in_cents < 0;
        const isDispute = action === 'dispute';
        const isFailed  = isDispute || (t.state != null && !['paid', 'successful', 'success', 'complete', 'completed', 'succeeded'].includes(t.state.toLowerCase()));

        // Resolve offer: prefer purchase linkage, fall back to transaction's direct offer_id
        const effectiveOfferId = purchase?.kajabi_offer_id ?? t.kajabi_offer_id;
        const resolvedOffer = effectiveOfferId ? offerByKajabiId[String(effectiveOfferId)] : null;
        const isOrphan = !t.kajabi_purchase_id; // recurring payment from a previous month's purchase

        return {
          txId:          t.kajabi_transaction_id,
          purchaseId:    t.kajabi_purchase_id,
          action,
          state:         t.state,
          isCharge,
          isDispute,
          isFailed,
          isRefund,
          isOrphan,
          amountCents:   t.amount_in_cents ?? 0,
          currency:      t.currency ?? 'USD',
          createdAt:     t.created_at_kajabi,
          offerName:     resolvedOffer?.name ?? (effectiveOfferId ? `Offer ${effectiveOfferId}` : '—'),
          closerName:    closer ?? (isOrphan ? '(recurring)' : '—'),
          paymentType:   purchase?.payment_type ?? null,
          couponCode:    purchase?.coupon_code ?? null,
          purchaseDate:  purchase?.created_at_kajabi ?? null,
          raw:           t.raw,
        };
      });

      setRows(enriched);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(selectedMonth); }, [selectedMonth, loadData]);
  useEffect(() => { if (syncResult) loadData(selectedMonth); }, [syncResult]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/sync-kajabi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSyncResult(data);
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  // ── Revenue calculations ──────────────────────────────────────────────────────
  const failed   = rows.filter((r) => r.isFailed);
  const orphans  = rows.filter((r) => r.isOrphan && !r.isFailed);  // recurring from prior months
  const charges  = rows.filter((r) => !r.isRefund && !r.isFailed);
  const refunds  = rows.filter((r) => r.isRefund && !r.isFailed);
  const orphanCents = orphans.filter((r) => !r.isRefund).reduce((s, r) => s + r.amountCents, 0);

  const grossCents   = charges.reduce((s, r) => s + Math.abs(r.amountCents), 0);
  const refundCents  = refunds.reduce((s, r) => s + Math.abs(r.amountCents), 0);
  const netCents     = grossCents - refundCents;

  // ── Daily chart data ─────────────────────────────────────────────────────────
  const dailyMap = {};
  for (const r of rows) {
    if (!r.createdAt) continue;
    // Use UTC date as the day key — same as what we store
    const day = r.createdAt.slice(0, 10); // "YYYY-MM-DD"
    if (!dailyMap[day]) dailyMap[day] = { day, chargeCents: 0, refundCents: 0 };
    if (r.isRefund) dailyMap[day].refundCents += Math.abs(r.amountCents);
    else dailyMap[day].chargeCents += r.amountCents;
  }
  // Fill all days in the month (so days with $0 show as empty bars)
  const [ymYear, ymMonth] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(ymYear, ymMonth, 0)).getUTCDate();
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    const key = `${selectedMonth}-${d}`;
    return dailyMap[key] ?? { day: key, chargeCents: 0, refundCents: 0 };
  });

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1">
          {new Date(label + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
        <p className="text-green-700">Charges: {formatMoney(d.chargeCents)}</p>
        {d.refundCents > 0 && <p className="text-red-500">Refunds: {formatMoney(-d.refundCents)}</p>}
        <p className="font-bold text-gray-900 border-t border-gray-100 mt-1 pt-1">
          Net: {formatMoney(d.chargeCents - d.refundCents)}
        </p>
      </div>
    );
  };

  // By offer
  const byOffer = {};
  for (const r of rows) {
    if (!byOffer[r.offerName]) byOffer[r.offerName] = { name: r.offerName, chargeCents: 0, refundCents: 0, count: 0 };
    if (r.isRefund) byOffer[r.offerName].refundCents += Math.abs(r.amountCents);
    else { byOffer[r.offerName].chargeCents += r.amountCents; byOffer[r.offerName].count++; }
  }
  const offerRows = Object.values(byOffer).sort((a, b) => b.chargeCents - a.chargeCents);

  // By closer
  const byCloser = {};
  for (const r of charges) {
    const key = r.closerName;
    if (!byCloser[key]) byCloser[key] = { name: key, chargeCents: 0, count: 0 };
    byCloser[key].chargeCents += r.amountCents;
    byCloser[key].count++;
  }
  const closerRows = Object.values(byCloser).sort((a, b) => b.chargeCents - a.chargeCents);

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: DateHelpers.DEFAULT_TIMEZONE })
    : '—';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Revenue Overview</h1>
            <p className="mt-1 text-sm text-gray-500">
              Actual Kajabi transaction amounts — synced locally. Gross revenue should match Kajabi's dashboard.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="flex flex-col text-sm font-medium text-gray-700">
              Month
              <input
                type="month"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </label>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? 'Syncing…' : 'Sync from Kajabi'}
            </button>
          </div>
        </div>

        {/* Sync feedback */}
        {syncResult && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Synced: <strong>{syncResult.purchases_synced}</strong> purchases, <strong>{syncResult.transactions_synced}</strong> transactions.
          </div>
        )}
        {syncError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Sync error: {syncError}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
        )}

        {/* No data state */}
        {!loading && hasData === false && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="text-lg font-semibold text-gray-700 mb-1">No mirrored data yet</p>
            <p className="text-sm text-gray-500 mb-4">Click "Sync from Kajabi" to pull {selectedMonth} data.</p>
            <button onClick={handleSync} disabled={syncing}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500 py-20">Loading…</div>
        ) : hasData !== false && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <SummaryCard
                label="Transactions"
                value={charges.length}
                sub={`${failed.length > 0 ? `${failed.length} failed (excluded) · ` : ''}${refunds.length} refund${refunds.length !== 1 ? 's' : ''}`}
                colorClass="text-blue-700"
              />
              <SummaryCard label="Gross Revenue" value={formatMoney(grossCents)} sub="charges only" colorClass="text-green-700" />
              <SummaryCard
                label="Refunds"
                value={refunds.length > 0 ? formatMoney(-refundCents) : '$0.00'}
                colorClass={refunds.length > 0 ? 'text-red-600' : 'text-gray-400'}
              />
              <SummaryCard
                label="Net Revenue"
                value={formatMoney(netCents)}
                sub="gross − refunds"
                colorClass={netCents >= 0 ? 'text-emerald-700' : 'text-red-700'}
              />
            </div>

            {rows.length === 0 && (
              <div className="bg-white rounded-xl shadow p-10 text-center text-gray-500">
                No transactions found for {selectedMonth}. Sync first.
              </div>
            )}

            {/* Orphan warning */}
            {orphans.length > 0 && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>{orphans.length} recurring payments ({formatMoney(orphanCents)})</strong> couldn't be linked to a purchase — they belong to subscriptions started in a previous month.
                To resolve: sync those previous months and re-sync this one.
                These are still counted in Gross Revenue above.
              </div>
            )}

            {/* Daily revenue chart */}
            {rows.length > 0 && (
              <section className="mb-8">
                <div className="bg-white rounded-xl shadow p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Daily Revenue</h2>
                    <span className="text-xs text-gray-400">Timestamps in UTC — adjust timezone if it doesn't match Kajabi</span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dailyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tickFormatter={(d) => String(new Date(d + 'T12:00:00Z').getUTCDate())}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${(v / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
                      <Bar dataKey="chargeCents" radius={[3, 3, 0, 0]} maxBarSize={32}>
                        {dailyData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.refundCents > 0 ? '#f97316' : '#22c55e'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2 justify-end text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Charges only</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-orange-500" /> Has refund</span>
                  </div>
                </div>
              </section>
            )}

            {rows.length > 0 && (
              <>
                {/* By Offer */}
                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-gray-800 mb-3">By Offer</h2>
                  <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full divide-y divide-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Offer', 'Charges', 'Gross', 'Refunds', 'Net'].map((h) => (
                            <th key={h} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider text-left first:text-left text-center">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {offerRows.map((r) => (
                          <tr key={r.name} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.name}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-700">{r.count}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-green-700 font-medium">{formatMoney(r.chargeCents)}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-red-500">{r.refundCents > 0 ? formatMoney(-r.refundCents) : '—'}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums font-bold text-gray-900">{formatMoney(r.chargeCents - r.refundCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td className="px-4 py-3 text-sm font-bold text-gray-800">Total</td>
                          <td className="px-4 py-3 text-sm text-center font-bold text-gray-800">{charges.length}</td>
                          <td className="px-4 py-3 text-sm text-center font-bold text-green-700">{formatMoney(grossCents)}</td>
                          <td className="px-4 py-3 text-sm text-center font-bold text-red-500">{refundCents > 0 ? formatMoney(-refundCents) : '—'}</td>
                          <td className="px-4 py-3 text-sm text-center font-bold text-emerald-700">{formatMoney(netCents)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>

                {/* By Closer */}
                {closerRows.length > 0 && (
                  <section className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">By Closer</h2>
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                      <table className="w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                          <tr>
                            {['Closer', 'Sales', 'Revenue'].map((h) => (
                              <th key={h} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {closerRows.map((r) => (
                            <tr key={r.name} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.name}</td>
                              <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{r.count}</td>
                              <td className="px-4 py-3 text-sm tabular-nums font-bold text-green-700">{formatMoney(r.chargeCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Transaction log */}
                <section>
                  <h2 className="text-lg font-semibold text-gray-800 mb-3">Transaction Log</h2>
                  <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                          <tr>
                            {['', 'Date', 'Offer', 'Closer', 'Type', 'State', 'Coupon', 'Amount'].map((h) => (
                              <th key={h} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider text-center">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map((r) => (
                            <React.Fragment key={r.txId}>
                              <tr
                                className={`cursor-pointer ${r.isFailed ? 'bg-gray-100 opacity-60' : r.isRefund ? 'bg-red-50 hover:bg-red-100' : r.isOrphan ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}
                                onClick={() => setExpandedTx(expandedTx === r.txId ? null : r.txId)}
                              >
                                <td className="px-3 py-3 text-center text-gray-400 text-xs select-none">
                                  {expandedTx === r.txId ? '▾' : '▸'}
                                </td>
                                <td className="px-4 py-3 text-sm text-center text-gray-700">{fmtDate(r.createdAt)}</td>
                                <td className="px-4 py-3 text-sm text-center font-medium text-gray-800">{r.offerName}</td>
                                <td className="px-4 py-3 text-sm text-center text-gray-600">{r.closerName}</td>
                                <td className="px-4 py-3 text-sm text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                    r.isDispute
                                      ? 'bg-orange-100 text-orange-700'
                                      : r.isFailed
                                      ? 'bg-gray-200 text-gray-500'
                                      : r.isRefund
                                      ? 'bg-red-100 text-red-700'
                                      : r.isOrphan
                                      ? 'bg-amber-100 text-amber-700'
                                      : r.paymentType === 'multipay' || r.paymentType === 'payment plan'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-green-100 text-green-700'
                                  }`}>
                                    {r.isDispute ? 'dispute' : r.isFailed ? 'failed' : r.isRefund ? 'refund' : r.isOrphan ? 'recurring' : (r.paymentType ?? 'charge')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-center">
                                  {r.state != null ? (
                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${r.isFailed ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                                      {r.state}
                                    </span>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-sm text-center text-gray-500">{r.couponCode ?? '—'}</td>
                                <td className={`px-4 py-3 text-sm text-center tabular-nums font-semibold ${r.isFailed ? 'text-gray-400 line-through' : r.isRefund ? 'text-red-600' : 'text-green-700'}`}>
                                  {r.isRefund ? formatMoney(-Math.abs(r.amountCents)) : formatMoney(r.amountCents)}
                                </td>
                              </tr>
                              {expandedTx === r.txId && (
                                <tr className="bg-gray-900">
                                  <td colSpan={8} className="px-4 py-3">
                                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
                                      {JSON.stringify(r.raw ?? { note: 'No raw data — re-sync to capture' }, null, 2)}
                                    </pre>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                          <tr>
                            <td colSpan={6} className="px-4 py-3 text-sm font-bold text-gray-800 text-right">Net Revenue</td>
                            <td className={`px-4 py-3 text-sm font-bold tabular-nums text-center ${netCents >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {formatMoney(netCents)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
