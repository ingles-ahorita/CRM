import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';

const LINK_SEARCH_DEBOUNCE_MS = 300;

/**
 * Modal to link a Kajabi customer (customerId, name, email) to a lead in the DB.
 * Search leads by name/email, select one, confirm → updates leads.customer_id.
 * @param {boolean} open
 * @param {{ customerId: string, name: string, email: string } | null} customer
 * @param {() => void} onClose
 * @param {() => void} [onLinked] - Called after successful link (e.g. to refetch data)
 */
export default function LinkKajabiCustomerModal({ open, customer, onClose, onLinked }) {
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearchLoading, setLinkSearchLoading] = useState(false);
  const [linkSelectedLead, setLinkSelectedLead] = useState(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const linkSearchTimeoutRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLinkSearchQuery('');
    setLinkSearchResults([]);
    setLinkSelectedLead(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = linkSearchQuery.trim();
    if (q.length < 2) {
      setLinkSearchResults([]);
      return;
    }
    if (linkSearchTimeoutRef.current) clearTimeout(linkSearchTimeoutRef.current);
    linkSearchTimeoutRef.current = setTimeout(() => {
      setLinkSearchLoading(true);
      supabase
        .from('calls')
        .select('lead_id, name, email')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(30)
        .then(({ data, error: e }) => {
          if (e) {
            setLinkSearchResults([]);
            return;
          }
          const byLead = new Map();
          (data || []).forEach((row) => {
            if (row.lead_id != null && !byLead.has(row.lead_id)) {
              byLead.set(row.lead_id, { lead_id: row.lead_id, name: row.name ?? '—', email: row.email ?? '—' });
            }
          });
          setLinkSearchResults(Array.from(byLead.values()));
        })
        .finally(() => setLinkSearchLoading(false));
    }, LINK_SEARCH_DEBOUNCE_MS);
    return () => { if (linkSearchTimeoutRef.current) clearTimeout(linkSearchTimeoutRef.current); };
  }, [open, linkSearchQuery]);

  const handleLinkConfirm = async () => {
    if (!customer || !linkSelectedLead) return;
    setLinkSaving(true);
    const { error } = await supabase
      .from('leads')
      .update({ customer_id: customer.customerId })
      .eq('id', linkSelectedLead.lead_id);
    setLinkSaving(false);
    if (error) return;
    onLinked?.();
    onClose();
  };

  if (!open || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !linkSaving && onClose()}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Link Kajabi customer to a lead</h3>
          <p className="text-sm text-gray-600 mt-1">
            Kajabi customer: <strong>{customer.name}</strong> ({customer.email}) · ID {customer.customerId}
          </p>
        </div>
        <div className="p-4 flex-1 overflow-auto">
          <label className="block text-sm font-medium text-gray-700 mb-2">Search leads in database (by name or email)</label>
          <input
            type="text"
            value={linkSearchQuery}
            onChange={(e) => setLinkSearchQuery(e.target.value)}
            placeholder="Type to search…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
          />
          {linkSearchLoading && <p className="text-sm text-gray-500 mb-2">Searching…</p>}
          {linkSearchQuery.trim().length >= 2 && !linkSearchLoading && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-auto">
              {linkSearchResults.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">No leads found.</p>
              ) : (
                linkSearchResults.map((lead) => (
                  <button
                    key={lead.lead_id}
                    type="button"
                    onClick={() => setLinkSelectedLead(lead)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${linkSelectedLead?.lead_id === lead.lead_id ? 'bg-indigo-50 text-indigo-800' : 'text-gray-900'}`}
                  >
                    {lead.name} · {lead.email} <span className="text-gray-400 font-mono">(lead {lead.lead_id})</span>
                  </button>
                ))
              )}
            </div>
          )}
          {linkSelectedLead && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-900">Confirm link</p>
              <p className="text-sm text-amber-800 mt-1">
                Link Kajabi customer <strong>{customer.name}</strong> to lead <strong>{linkSelectedLead.lead_id}</strong> ({linkSelectedLead.name}, {linkSelectedLead.email})?
              </p>
              <p className="text-xs text-amber-700 mt-2">This will set leads.customer_id = {customer.customerId} for that lead.</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !linkSaving && onClose()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!linkSelectedLead || linkSaving}
            onClick={handleLinkConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {linkSaving ? 'Linking…' : 'Link to this lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
