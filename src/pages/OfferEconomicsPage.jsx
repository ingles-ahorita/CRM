/**
 * Offer Economics — per-offer unit economics, real-time from the Kajabi mirror.
 *
 * For every offer sold in the selected window (default: since 2025-07-01) this page
 * shows units sold, gross/net revenue, refund %, average payments made (payment plans),
 * installment-completion %, and a collection rate vs. the offer's full price.
 *
 * DATA SOURCES
 *  - kajabi_purchases    → units, payment_type, multipay_payments_made, cancellations
 *  - kajabi_transactions → gross/refund cash (the same numbers as Kajabi's dashboard)
 *  - offers              → name, price, installments (the expected payment count)
 *  - Kajabi Contacts API → country (Phase 2; fetched live & cached per session — no table)
 *
 * Revenue/units read the local mirror (fast). Country is fetched live from the
 * Kajabi Contacts API once per session and cached. "Sync from Kajabi" pulls the
 * window into the mirror; "Refresh countries" re-pulls the contact→country map.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchContactCountryMap } from '../lib/kajabiApi';

const SUCCESS_STATES = new Set(['paid', 'successful', 'success', 'complete', 'completed', 'succeeded']);
const DAYS_BETWEEN_INSTALLMENTS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GRACE_DAYS_MS = 2 * MS_PER_DAY;
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

function formatMoney(cents) {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(frac, digits = 1) {
  if (frac == null || !Number.isFinite(frac)) return '—';
  return `${(frac * 100).toFixed(digits)}%`;
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

// Classify a transaction row into charge / refund / failed (mirrors RevenueOverviewPage).
function classifyTx(t) {
  const isRefund = t.action === 'refund' || (t.amount_in_cents ?? 0) < 0;
  const resolved = t.payment_resolved_at != null;
  const isFailed = !isRefund && !resolved && t.state != null
    && !SUCCESS_STATES.has(String(t.state).toLowerCase());
  return { isRefund, isFailed, isCharge: !isRefund && !isFailed };
}

// Installment-completion stats for one offer's purchases.
// Logic matches /multipay-completion so numbers stay consistent across the app.
function computeInstallmentStats(purchases, installments) {
  if (!installments || installments < 2 || purchases.length === 0) return [];
  const now = Date.now();
  const rows = [];
  for (let inst = 2; inst <= installments; inst++) {
    const daysUntilDue = (inst - 1) * DAYS_BETWEEN_INSTALLMENTS;
    const cutoff = now - daysUntilDue * MS_PER_DAY;
    const dueDateMs = daysUntilDue * MS_PER_DAY;

    const shouldHavePaid = purchases.filter((p) => {
      const created = p.created_at_kajabi;
      return created && new Date(created).getTime() <= cutoff;
    });
    const stillActive = shouldHavePaid.filter((p) => {
      const created = new Date(p.created_at_kajabi).getTime();
      const deactivatedAt = p.deactivated_at;
      if (!deactivatedAt) return true;
      return new Date(deactivatedAt).getTime() + GRACE_DAYS_MS > created + dueDateMs;
    });
    const didPay = shouldHavePaid.filter((p) => {
      const n = Number(p.multipay_payments_made);
      return Number.isFinite(n) && n >= inst;
    });
    rows.push({
      installment: inst,
      shouldHavePaid: shouldHavePaid.length,
      stillActive: stillActive.length,
      didPay: didPay.length,
      completion: shouldHavePaid.length > 0 ? didPay.length / shouldHavePaid.length : null,
      survival: stillActive.length > 0 ? didPay.length / stillActive.length : null,
    });
  }
  return rows;
}

// Page through a supabase select that may exceed 1000 rows.
async function fetchAll(buildQuery) {
  const all = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

export default function OfferEconomicsPage() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState('2025-07-01');
  const [toDate, setToDate] = useState(todayISO);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasData, setHasData] = useState(null);

  // Raw, unfiltered data (filtering by country happens in useMemo).
  const [purchases, setPurchases] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [offerById, setOfferById] = useState({});
  const [countryByCustomer, setCountryByCustomer] = useState(new Map());

  const [country, setCountry] = useState('ALL');
  const [sortKey, setSortKey] = useState('grossCents');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);

  // Country map is fetched live from Kajabi (no table); cached per session.
  const [countryLoading, setCountryLoading] = useState(false);
  const [countryErr, setCountryErr] = useState(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [syncErr, setSyncErr] = useState(null);

  const loadData = useCallback(async (from, to) => {
    setLoading(true);
    setError(null);
    try {
      const fromISO = `${from}T00:00:00.000Z`;
      const toISO = `${to}T23:59:59.999Z`;

      const { count } = await supabase
        .from('kajabi_purchases')
        .select('id', { count: 'exact', head: true });
      if ((count ?? 0) === 0) {
        setHasData(false);
        setPurchases([]); setTransactions([]);
        setLoading(false);
        return;
      }
      setHasData(true);

      // Purchases created in window
      const purchaseRows = await fetchAll(() => supabase
        .from('kajabi_purchases')
        .select('kajabi_purchase_id, kajabi_offer_id, kajabi_customer_id, payment_type, amount_in_cents, multipay_payments_made, deactivated_at, status, created_at_kajabi')
        .gte('created_at_kajabi', fromISO)
        .lte('created_at_kajabi', toISO));

      // Transactions created in window (cash events — gross/refunds)
      const txRows = await fetchAll(() => supabase
        .from('kajabi_transactions')
        .select('kajabi_transaction_id, kajabi_purchase_id, kajabi_offer_id, kajabi_customer_id, action, state, amount_in_cents, created_at_kajabi, payment_resolved_at')
        .gte('created_at_kajabi', fromISO)
        .lte('created_at_kajabi', toISO));

      // Offers (name / price / installments)
      const { data: offerData } = await supabase
        .from('offers')
        .select('kajabi_id, name, price, installments, base_commission');
      const offers = {};
      for (const o of offerData || []) {
        if (o.kajabi_id != null) offers[String(o.kajabi_id)] = o;
      }

      setPurchases(purchaseRows);
      setTransactions(txRows);
      setOfferById(offers);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(fromDate, toDate); }, [fromDate, toDate, loadData]);

  // Load the contact → country map live from Kajabi (cached per session).
  // Runs independently of the DB load so Phase 1 renders immediately.
  const loadCountries = useCallback(async (force = false) => {
    setCountryLoading(true);
    setCountryErr(null);
    try {
      const map = await fetchContactCountryMap({ force });
      setCountryByCustomer(new Map(map));
    } catch (e) {
      console.warn('[offer-economics] country fetch failed:', e?.message);
      setCountryErr(e.message || 'Failed to fetch countries from Kajabi');
    } finally {
      setCountryLoading(false);
    }
  }, []);

  useEffect(() => { loadCountries(false); }, [loadCountries]);

  // Countries available from the loaded data.
  const availableCountries = useMemo(() => {
    const set = new Set();
    let hasUnknown = false;
    const ids = new Set([
      ...purchases.map((p) => p.kajabi_customer_id),
      ...transactions.map((t) => t.kajabi_customer_id),
    ].filter(Boolean).map(String));
    for (const id of ids) {
      const c = countryByCustomer.get(id);
      if (c) set.add(c); else hasUnknown = true;
    }
    const list = [...set].sort();
    if (hasUnknown) list.push('Unknown');
    return list;
  }, [purchases, transactions, countryByCustomer]);

  const countryOf = useCallback(
    (customerId) => (customerId && countryByCustomer.get(String(customerId))) || 'Unknown',
    [countryByCustomer]
  );

  // Per-offer aggregation, recomputed instantly when the country filter changes.
  const { offerRows, totals } = useMemo(() => {
    const inCountry = (custId) => country === 'ALL' || countryOf(custId) === country;

    const agg = {}; // kajabi_offer_id → bucket
    const bucket = (oid) => {
      const key = oid != null ? String(oid) : 'unknown';
      if (!agg[key]) {
        const offer = offerById[key] || null;
        agg[key] = {
          offerId: key,
          name: offer?.name || (oid ? `Offer ${oid}` : 'Unknown offer'),
          priceCents: offer?.price != null ? Math.round(Number(offer.price) * 100) : null,
          installments: offer?.installments != null ? Number(offer.installments) : null,
          units: 0,
          cancelled: 0,
          multipaySum: 0,
          multipayCount: 0,
          grossCents: 0,
          refundCents: 0,
          chargeCount: 0,
          refundCount: 0,
          purchases: [],
        };
      }
      return agg[key];
    };

    for (const p of purchases) {
      if (!inCountry(p.kajabi_customer_id)) continue;
      const b = bucket(p.kajabi_offer_id);
      b.units += 1;
      if (p.deactivated_at) b.cancelled += 1;
      const made = Number(p.multipay_payments_made);
      if (p.payment_type && p.payment_type !== 'one-time' && Number.isFinite(made)) {
        b.multipaySum += made;
        b.multipayCount += 1;
      }
      b.purchases.push(p);
    }

    for (const t of transactions) {
      if (!inCountry(t.kajabi_customer_id)) continue;
      const b = bucket(t.kajabi_offer_id);
      const { isRefund, isFailed } = classifyTx(t);
      if (isFailed) continue;
      const amt = Math.abs(t.amount_in_cents ?? 0);
      if (isRefund) { b.refundCents += amt; b.refundCount += 1; }
      else { b.grossCents += amt; b.chargeCount += 1; }
    }

    const rows = Object.values(agg).map((b) => {
      const net = b.grossCents - b.refundCents;
      const instStats = computeInstallmentStats(b.purchases, b.installments);
      const inst2 = instStats.find((r) => r.installment === 2) || null;
      return {
        ...b,
        net,
        refundPct: b.grossCents > 0 ? b.refundCents / b.grossCents : null,
        aov: b.units > 0 ? b.grossCents / b.units : null,
        avgPayments: b.multipayCount > 0 ? b.multipaySum / b.multipayCount : null,
        collectionRate: (b.priceCents && b.units > 0) ? b.grossCents / (b.priceCents * b.units) : null,
        inst2Completion: inst2 ? inst2.completion : null,
        instStats,
        isMultipay: !!(b.installments && b.installments > 0),
      };
    });

    const t = {
      units: rows.reduce((s, r) => s + r.units, 0),
      grossCents: rows.reduce((s, r) => s + r.grossCents, 0),
      refundCents: rows.reduce((s, r) => s + r.refundCents, 0),
    };
    t.net = t.grossCents - t.refundCents;
    t.refundPct = t.grossCents > 0 ? t.refundCents / t.grossCents : null;

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return ((av ?? -Infinity) - (bv ?? -Infinity)) * dir;
    });

    return { offerRows: rows, totals: t };
  }, [purchases, transactions, offerById, country, countryOf, sortKey, sortDir]);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null); setSyncErr(null);
    try {
      const res = await fetch('/api/sync-kajabi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${fromDate}T00:00:00.000Z`, to: `${toDate}T23:59:59.999Z` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSyncMsg(`Synced ${data.purchases_synced} purchases, ${data.transactions_synced} transactions.`);
      loadData(fromDate, toDate);
    } catch (e) {
      setSyncErr(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const Th = ({ label, sortable, k, align = 'center' }) => (
    <th
      className={`px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider text-${align} ${sortable ? 'cursor-pointer select-none hover:text-gray-900' : ''}`}
      onClick={sortable ? () => toggleSort(k) : undefined}
    >
      {label}{sortable && sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Offer Economics</h1>
            <p className="mt-1 text-sm text-gray-500">
              Per-offer unit economics from the Kajabi mirror — units, revenue, refunds,
              average payments made, and installment completion.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 sm:items-end">
            <label className="flex flex-col text-sm font-medium text-gray-700">
              From
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700">
              To
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700">
              Country
              <select value={country} onChange={(e) => setCountry(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="ALL">All countries</option>
                {availableCountries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* Sync controls */}
        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={handleSync} disabled={syncing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
            {syncing ? 'Syncing…' : 'Sync from Kajabi (range)'}
          </button>
          <button onClick={() => loadCountries(true)} disabled={countryLoading}
            className="rounded-md bg-white border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50">
            {countryLoading ? 'Loading countries…' : 'Refresh countries'}
          </button>
        </div>

        {syncMsg && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{syncMsg}</div>}
        {syncErr && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Sync error: {syncErr}</div>}
        {countryErr && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Couldn't load countries from Kajabi: {countryErr}. Revenue metrics are unaffected.</div>}
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>}

        {countryLoading && availableCountries.length === 0 && !loading && hasData && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Loading billing countries from Kajabi… revenue metrics below are ready now; the country filter will activate when this finishes.
          </div>
        )}

        {!loading && hasData === false && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="text-lg font-semibold text-gray-700 mb-1">No mirrored data yet</p>
            <p className="text-sm text-gray-500 mb-4">Click "Sync from Kajabi" to pull the selected window.</p>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500 py-20">Loading…</div>
        ) : hasData !== false && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <SummaryCard label="Units sold" value={totals.units.toLocaleString()} sub={`${offerRows.length} offers`} colorClass="text-blue-700" />
              <SummaryCard label="Gross Revenue" value={formatMoney(totals.grossCents)} sub="charges only" colorClass="text-green-700" />
              <SummaryCard label="Refunds" value={totals.refundCents > 0 ? formatMoney(-totals.refundCents) : '$0.00'} sub={formatPct(totals.refundPct)} colorClass={totals.refundCents > 0 ? 'text-red-600' : 'text-gray-400'} />
              <SummaryCard label="Net Revenue" value={formatMoney(totals.net)} sub="gross − refunds" colorClass={totals.net >= 0 ? 'text-emerald-700' : 'text-red-700'} />
            </div>

            {/* By offer */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">By Offer{country !== 'ALL' ? ` — ${country}` : ''}</h2>
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3" />
                        <Th label="Offer" sortable k="name" align="left" />
                        <Th label="Units" sortable k="units" />
                        <Th label="Gross" sortable k="grossCents" />
                        <Th label="Net" sortable k="net" />
                        <Th label="Refund %" sortable k="refundPct" />
                        <Th label="AOV" sortable k="aov" />
                        <Th label="Avg pmts" sortable k="avgPayments" />
                        <Th label="Inst-2 %" sortable k="inst2Completion" />
                        <Th label="Collected" sortable k="collectionRate" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {offerRows.map((r) => (
                        <React.Fragment key={r.offerId}>
                          <tr className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setExpanded(expanded === r.offerId ? null : r.offerId)}>
                            <td className="px-3 py-3 text-center text-gray-400 text-xs select-none">
                              {r.isMultipay ? (expanded === r.offerId ? '▾' : '▸') : ''}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-800">
                              {r.name}
                              {r.isMultipay && <span className="ml-2 text-xs text-purple-600">{r.installments}×</span>}
                              {r.cancelled > 0 && <span className="ml-2 text-xs text-gray-400">{r.cancelled} cancelled</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-700">{r.units}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-green-700 font-medium">{formatMoney(r.grossCents)}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums font-bold text-gray-900">{formatMoney(r.net)}</td>
                            <td className={`px-4 py-3 text-sm text-center tabular-nums ${r.refundPct > 0.1 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{formatPct(r.refundPct)}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-700">{formatMoney(r.aov)}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-700">{r.avgPayments != null ? r.avgPayments.toFixed(1) : '—'}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-700">{formatPct(r.inst2Completion)}</td>
                            <td className="px-4 py-3 text-sm text-center tabular-nums text-gray-700">{formatPct(r.collectionRate)}</td>
                          </tr>
                          {expanded === r.offerId && r.instStats.length > 0 && (
                            <tr className="bg-gray-50">
                              <td colSpan={10} className="px-6 py-4">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                  Installment completion — {r.name}
                                </p>
                                <table className="w-full max-w-2xl text-sm">
                                  <thead>
                                    <tr className="text-xs text-gray-500">
                                      <th className="text-left py-1">Installment</th>
                                      <th className="text-right py-1">Due (eligible)</th>
                                      <th className="text-right py-1">Still active</th>
                                      <th className="text-right py-1">Paid</th>
                                      <th className="text-right py-1">Completion %</th>
                                      <th className="text-right py-1">Survival %</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.instStats.map((s) => (
                                      <tr key={s.installment} className="border-t border-gray-100">
                                        <td className="py-1 text-gray-700">#{s.installment}</td>
                                        <td className="py-1 text-right tabular-nums text-gray-600">{s.shouldHavePaid}</td>
                                        <td className="py-1 text-right tabular-nums text-gray-600">{s.stillActive}</td>
                                        <td className="py-1 text-right tabular-nums text-gray-600">{s.didPay}</td>
                                        <td className="py-1 text-right tabular-nums font-semibold text-gray-800">{formatPct(s.completion)}</td>
                                        <td className="py-1 text-right tabular-nums text-gray-600">{formatPct(s.survival)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {offerRows.length === 0 && (
                        <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">No offers in this window/country.</td></tr>
                      )}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td className="px-3 py-3" />
                        <td className="px-4 py-3 text-sm font-bold text-gray-800">Total</td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-gray-800">{totals.units}</td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-green-700">{formatMoney(totals.grossCents)}</td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-emerald-700">{formatMoney(totals.net)}</td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-red-500">{formatPct(totals.refundPct)}</td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Inst-2 % = share of eligible payment-plan buyers who made their 2nd payment. Collected = cash received ÷ full offer price × units.
                Click a payment-plan row for the per-installment breakdown.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
