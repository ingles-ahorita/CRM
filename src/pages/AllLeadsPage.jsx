import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { findCustomerByEmail } from '../lib/kajabiApi';

/**
 * Very simple page:
 * - Shows all calls whose outcome = 'yes'
 * - Button to try to find & STORE the Kajabi customer id into leads.customer_id
 * - Toggle to show only calls where no customer id was found/stored yet
 */
export default function AllLeadsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [onlyWithoutKajabi, setOnlyWithoutKajabi] = useState(false);

  useEffect(() => {
    loadOutcomeYesCalls();
  }, []);

  async function loadOutcomeYesCalls() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('outcome_log')
        .select(`
          id,
          outcome,
          calls!call_id (
            id,
            lead_id,
            email,
            name,
            book_date,
            leads (
              id,
              customer_id
            )
          )
        `)
        .eq('outcome', 'yes')
        .order('id', { ascending: false });

      if (e) throw e;

      const mapped = (data || [])
        .filter((row) => row.calls)
        .map((row) => ({
          outcomeLogId: row.id,
          callId: row.calls.id,
          leadId: row.calls.lead_id,
          email: row.calls.email,
          name: row.calls.name,
          bookDate: row.calls.book_date,
          kajabiId: row.calls.leads?.customer_id ?? null,
          status: null,
          error: null,
        }));

      setRows(mapped);
    } catch (e) {
      setError(e.message || 'Failed to load calls with outcome = yes');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleFindAndStoreKajabiIds() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = [...rows];

      for (let i = 0; i < updated.length; i++) {
        const row = updated[i];

        // Skip if we already have a Kajabi ID stored
        if (row.kajabiId) {
          continue;
        }

        if (!row.email) {
          row.status = 'no_email';
          continue;
        }

        try {
          const customer = await findCustomerByEmail(row.email);

          if (customer) {
            // Store in leads.customer_id
            const { error: updError } = await supabase
              .from('leads')
              .update({ customer_id: customer.id })
              .eq('id', row.leadId);

            if (updError) {
              row.status = 'update_error';
              row.error = updError.message;
            } else {
              row.kajabiId = customer.id;
              row.status = 'stored';
              row.error = null;
            }
          } else {
            row.status = 'not_found';
            row.error = null;
          }
        } catch (e) {
          row.status = 'search_error';
          row.error = e.message || String(e);
        }
      }

      setRows(updated);
    } catch (e) {
      setSaveError(e.message || 'Failed to process leads');
    } finally {
      setSaving(false);
    }
  }

  const displayRows = onlyWithoutKajabi
    ? rows.filter((r) => !r.kajabiId)
    : rows;

  const totalWithKajabi = rows.filter((r) => r.kajabiId).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Outcome = yes calls</h1>
        <p className="text-sm text-gray-500 mb-4">
          This page shows all calls whose closer outcome is <strong>yes</strong>. Use the button to look up the Kajabi
          customer by email and store the id into <code>leads.customer_id</code>.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleFindAndStoreKajabiIds}
            disabled={saving || rows.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-indigo-700"
          >
            {saving ? 'Finding & storing Kajabi IDs…' : 'Find & store Kajabi IDs (leads.customer_id)'}
          </button>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={onlyWithoutKajabi}
              onChange={(e) => setOnlyWithoutKajabi(e.target.checked)}
            />
            Show only calls without Kajabi customer ID
          </label>

          <span className="text-sm text-gray-600">
            {rows.length} call(s) with outcome = yes · {totalWithKajabi} have a Kajabi ID stored
          </span>
        </div>

        {saveError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {saveError}
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading calls…</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Call id</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Lead id</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Kajabi ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Book date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No calls to show.
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row) => (
                    <tr key={row.outcomeLogId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={() => navigate(`/lead/${row.leadId}`)}
                          className="text-indigo-600 hover:underline font-mono"
                        >
                          {row.callId}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={() => navigate(`/lead/${row.leadId}`)}
                          className="text-indigo-600 hover:underline font-mono"
                        >
                          {row.leadId ?? '—'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{row.name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.email || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {row.kajabiId ? (
                          <a
                            href={`https://app.kajabi.com/admin/sites/2147813413/customers/${row.kajabiId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline font-mono"
                          >
                            {row.kajabiId}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {row.status === 'stored'
                          ? 'Stored'
                          : row.status === 'not_found'
                          ? 'Not found'
                          : row.status === 'no_email'
                          ? 'No email'
                          : row.status === 'update_error' || row.status === 'search_error'
                          ? 'Error'
                          : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {row.bookDate ? new Date(row.bookDate).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
