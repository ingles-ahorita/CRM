import React, { useState, useEffect } from 'react';
import { fetchPurchases, fetchCustomer } from '../lib/kajabiApi';

/**
 * Standalone Kajabi purchases page – not connected to the rest of the app.
 * Fetches and displays purchases from the Kajabi API (hardcoded token for now).
 * Customer name/email are fetched via GET /v1/customers/{id}.
 */
export default function KajabiPurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [links, setLinks] = useState({});
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [customerMap, setCustomerMap] = useState({});
  const [customersLoading, setCustomersLoading] = useState(false);

  const load = async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    setCustomerMap({});
    try {
      const result = await fetchPurchases({ page: pageNum, perPage, sort: '-created_at' });
      setPurchases(result.data);
      setLinks(result.links || {});
      setMeta(result.meta || null);

      const customerIds = [...new Set(
        (result.data || [])
          .map((p) => p.relationships?.customer?.data?.id)
          .filter(Boolean)
      )];
      if (customerIds.length > 0) {
        setCustomersLoading(true);
        const map = {};
        await Promise.all(
          customerIds.map(async (id) => {
            try {
              const customer = await fetchCustomer(id);
              map[id] = customer;
            } catch {
              map[id] = { name: null, email: null };
            }
          })
        );
        setCustomerMap(map);
        setCustomersLoading(false);
      }
    } catch (e) {
      setError(e.message || 'Failed to load purchases');
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
  }, [page]);

  const formatDate = (str) => {
    if (!str) return '—';
    try {
      return new Date(str).toLocaleString();
    } catch {
      return str;
    }
  };

  const formatAmount = (cents, currency = 'USD') => {
    if (cents == null) return '—';
    const value = (cents / 100).toFixed(2);
    return currency === 'USD' ? `$${value}` : `${value} ${currency}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Kajabi Purchases</h1>
        <p className="text-sm text-gray-500 mb-6">
          Standalone page – data from Kajabi API (list purchases). Token is hardcoded for now.
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading purchases…</div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Id</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Currency</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Payment type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Effective start</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Offer id</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Customer id</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchases.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                          No purchases returned.
                        </td>
                      </tr>
                    ) : (
                      purchases.map((p) => {
                        const attrs = p.attributes || {};
                        const rels = p.relationships || {};
                        const customerId = rels.customer?.data?.id;
                        const customer = customerId ? customerMap[customerId] : null;
                        return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 font-mono">{p.id}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {customersLoading ? '…' : (customer?.name ?? '—')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {customersLoading ? '…' : (customer?.email ?? '—')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {formatAmount(attrs.amount_in_cents, attrs.currency)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{attrs.currency || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{attrs.payment_type || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatDate(attrs.created_at)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatDate(attrs.effective_start_at)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{attrs.source || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                              {rels.offer?.data?.id || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                              {rels.customer?.data?.id || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {meta?.total_count != null && (
                  <>Total: {meta.total_count} · </>
                )}
                Page {page}
                {meta?.total_pages != null && ` of ${meta.total_pages}`}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!links.next || loading || (meta?.total_pages != null && page >= meta.total_pages)}
                  className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
