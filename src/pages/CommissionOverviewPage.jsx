import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as DateHelpers from '../utils/dateHelpers';
import { getCloserCommissionBreakdown } from '../lib/closerCommission';
import { getAllSettersMonthlyCommission } from '../lib/setterCommission';

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${Number(n).toFixed(2)}`;
}

export default function CommissionOverviewPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const ym = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
    return ym ? ym.monthKey : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closersRows, setClosersRows] = useState([]);
  const [settersRows, setSettersRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: closers, error: closersErr } = await supabase
          .from('closers')
          .select('id, name')
          .eq('active', true)
          .order('name');
        if (closersErr) throw closersErr;

        const [setterRows, ...closerBreakdowns] = await Promise.all([
          getAllSettersMonthlyCommission(selectedMonth),
          ...(closers || []).map((c) =>
            getCloserCommissionBreakdown(c.id, selectedMonth).then((b) => ({
              id: c.id,
              name: c.name,
              ...b,
            }))
          ),
        ]);

        if (cancelled) return;
        setSettersRows(setterRows);
        setClosersRows(
          closerBreakdowns.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
        );
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e.message || 'Failed to load commission data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const closerGrandTotal = closersRows.reduce((s, r) => s + (r.total || 0), 0);
  const setterGrandTotal = settersRows.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Monthly commission overview</h1>
            <p className="mt-2 text-sm text-gray-600">
              Closers: same rules as closer stats. Setters: $4 per show-up and $25 per purchase in the
              selected month (matches setter monthly recap).
            </p>
          </div>
          <label className="flex flex-col text-sm font-medium text-gray-700">
            Month
            <input
              type="month"
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-600 py-16">Loading…</div>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Closers</h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed divide-y divide-gray-200">
                    <colgroup>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <col key={i} style={{ width: `${100 / 7}%` }} />
                      ))}
                    </colgroup>
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Base
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Payoff Δ
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          2nd inst.
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Refunds
                        </th>
                        <th
                          className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider"
                          title="Previous month refunds"
                        >
                          Prev. refunds
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider bg-slate-100">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {closersRows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-2 py-3 min-w-0 text-sm text-center font-medium text-gray-900">
                            <a
                              href={`/closer-stats/${row.id}?month=${encodeURIComponent(selectedMonth)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-900 hover:underline cursor-pointer break-words"
                            >
                              {row.name}
                            </a>
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums text-gray-900">
                            {formatMoney(row.base)}
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums text-gray-900">
                            {formatMoney(row.payoffIncrements)}
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums text-gray-900">
                            {formatMoney(row.secondInstallments)}
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums text-gray-900">
                            {formatMoney(row.sameMonthRefunds)}
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums text-gray-900">
                            {formatMoney(row.refunds)}
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums font-bold text-gray-900 bg-slate-50">
                            {formatMoney(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-2 py-2 text-sm text-center font-semibold text-gray-900">Total</td>
                        <td className="px-2 py-2 text-sm text-center font-semibold text-gray-900" colSpan={5}>
                          —
                        </td>
                        <td className="px-2 py-2 text-sm text-center font-bold text-gray-900 bg-slate-100">
                          {formatMoney(closerGrandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Setters</h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed divide-y divide-gray-200">
                    <colgroup>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <col key={i} style={{ width: `${100 / 4}%` }} />
                      ))}
                    </colgroup>
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Show-ups
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Purchases
                        </th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider bg-slate-100">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {settersRows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-2 py-3 min-w-0 text-sm text-center font-medium text-gray-900">
                            <a
                              href={`/stats/${row.id}?month=${encodeURIComponent(selectedMonth)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-900 hover:underline cursor-pointer break-words"
                            >
                              {row.name}
                            </a>
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums text-gray-900">
                            {row.showUps}
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums text-gray-900">
                            {row.purchases}
                          </td>
                          <td className="px-2 py-3 text-sm text-center tabular-nums font-bold text-gray-900 bg-slate-50">
                            {formatMoney(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-2 py-2 text-sm text-center font-semibold text-gray-900">Total</td>
                        <td className="px-2 py-2 text-sm text-center font-semibold text-gray-900" colSpan={2}>
                          —
                        </td>
                        <td className="px-2 py-2 text-sm text-center font-bold text-gray-900 bg-slate-100">
                          {formatMoney(setterGrandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
