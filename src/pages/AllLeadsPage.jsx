import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { listCustomers } from '../lib/kajabiApi';
import LinkKajabiCustomerModal from './components/LinkKajabiCustomerModal';

/**
 * Lists Kajabi customers (name, email, created_at desc).
 * Filter by linked / unlinked (customer_id exists in leads table or not).
 * Link button opens LinkKajabiCustomerModal; on success we only update that row to linked.
 */
export default function AllLeadsPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linkFilter, setLinkFilter] = useState('all'); // 'all' | 'linked' | 'unlinked'
  const [linkModalCustomer, setLinkModalCustomer] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    setError(null);
    try {
      const allCustomers = [];
      let page = 1;
      const perPage = 100;
      let hasMore = true;
      while (hasMore) {
        const result = await listCustomers({ page, perPage, sort: '-created_at' });
        const data = result.data || [];
        allCustomers.push(...data);
        if (data.length < perPage) hasMore = false;
        else page++;
        if (page > 20) break; // cap at 2000
      }

      const customerIds = allCustomers.map((c) => String(c.id));
      const linkedIds = new Set();
      if (customerIds.length > 0) {
        const { data: leadRows } = await supabase
          .from('leads')
          .select('customer_id')
          .not('customer_id', 'is', null);
        (leadRows || []).forEach((row) => {
          if (row.customer_id != null) linkedIds.add(String(row.customer_id));
        });
      }

      setCustomers(
        allCustomers.map((c) => ({
          id: c.id,
          name: c.name ?? '—',
          email: c.email ?? '—',
          created_at: c.created_at ?? null,
          linked: linkedIds.has(String(c.id)),
        }))
      );
    } catch (e) {
      setError(e.message || 'Failed to load Kajabi customers');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }

  const displayCustomers =
    linkFilter === 'all'
      ? customers
      : linkFilter === 'linked'
        ? customers.filter((c) => c.linked)
        : customers.filter((c) => !c.linked);

  const linkedCount = customers.filter((c) => c.linked).length;

  function handleLinked(customerId) {
    setCustomers((prev) =>
      prev.map((c) => (String(c.id) === String(customerId) ? { ...c, linked: true } : c))
    );
    setLinkModalCustomer(null);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Kajabi customers</h1>
        <p className="text-sm text-gray-500 mb-4">
          Customers from Kajabi, sorted by created_at descending. Link connects a Kajabi customer to a lead (stores{' '}
          <code>customer_id</code> in leads table).
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <button
            type="button"
            onClick={() => setLinkFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              linkFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setLinkFilter('linked')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              linkFilter === 'linked' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Linked
          </button>
          <button
            type="button"
            onClick={() => setLinkFilter('unlinked')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              linkFilter === 'unlinked' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Unlinked
          </button>
          <span className="text-sm text-gray-600">
            {customers.length} customer(s) · {linkedCount} linked
          </span>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading Kajabi customers…</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Linked</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No customers to show.
                    </td>
                  </tr>
                ) : (
                  displayCustomers.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{row.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {row.linked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {row.linked ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setLinkModalCustomer({
                                customerId: row.id,
                                name: row.name,
                                email: row.email,
                              })
                            }
                            className="text-indigo-600 hover:underline font-medium text-sm"
                          >
                            Link to lead
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {linkModalCustomer && (
        <LinkKajabiCustomerModal
          open={true}
          customer={linkModalCustomer}
          onClose={() => setLinkModalCustomer(null)}
          onLinked={() => handleLinked(linkModalCustomer.customerId)}
        />
      )}
    </div>
  );
}
