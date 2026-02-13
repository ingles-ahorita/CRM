import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { searchCustomers } from '../../lib/kajabiApi';

const LINK_SEARCH_DEBOUNCE_MS = 300;

/**
 * Modal to link a Kajabi customer to a lead.
 * - If customer is passed: search leads, pick one → set that lead's customer_id = customer.customerId.
 * - If lead is passed (no customer): search Kajabi customers, pick one → set this lead's customer_id = selected customer id.
 * @param {boolean} open
 * @param {{ customerId: string, name: string, email: string } | null} customer
 * @param {{ leadId: string, name: string, email: string } | null} lead - When set (and no customer), "link this lead to a Kajabi customer"
 * @param {() => void} onClose
 * @param {() => void} [onLinked] - Called after successful link (e.g. to refetch data)
 */
export default function LinkKajabiCustomerModal({ open, customer, lead, onClose, onLinked }) {
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearchLoading, setLinkSearchLoading] = useState(false);
  const [linkSelectedLead, setLinkSelectedLead] = useState(null);
  const [kajabiSearchResults, setKajabiSearchResults] = useState([]);
  const [kajabiSearchLoading, setKajabiSearchLoading] = useState(false);
  const [linkSelectedKajabiCustomer, setLinkSelectedKajabiCustomer] = useState(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const linkSearchTimeoutRef = useRef(null);

  const isLeadMode = open && lead && !customer;

  useEffect(() => {
    if (!open) return;
    setLinkSearchQuery('');
    setLinkSearchResults([]);
    setLinkSelectedLead(null);
    setKajabiSearchResults([]);
    setLinkSelectedKajabiCustomer(null);
    if (lead?.name || lead?.email) setLinkSearchQuery([lead.name, lead.email].filter(Boolean).join(' ').trim());
  }, [open, lead]);

  // Search leads (customer mode)
  useEffect(() => {
    if (!open || isLeadMode) return;
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
  }, [open, isLeadMode, linkSearchQuery]);

  // Search Kajabi customers (lead mode)
  useEffect(() => {
    if (!open || !isLeadMode) return;
    const q = linkSearchQuery.trim();
    if (q.length < 2) {
      setKajabiSearchResults([]);
      return;
    }
    if (linkSearchTimeoutRef.current) clearTimeout(linkSearchTimeoutRef.current);
    linkSearchTimeoutRef.current = setTimeout(() => {
      setKajabiSearchLoading(true);
      searchCustomers({ search: q, perPage: 20 })
        .then((res) => setKajabiSearchResults(res.data || []))
        .catch(() => setKajabiSearchResults([]))
        .finally(() => setKajabiSearchLoading(false));
    }, LINK_SEARCH_DEBOUNCE_MS);
    return () => { if (linkSearchTimeoutRef.current) clearTimeout(linkSearchTimeoutRef.current); };
  }, [open, isLeadMode, linkSearchQuery]);

  const handleLinkConfirm = async () => {
    if (customer && linkSelectedLead) {
      setLinkSaving(true);
      const { error } = await supabase
        .from('leads')
        .update({ customer_id: customer.customerId })
        .eq('id', linkSelectedLead.lead_id);
      setLinkSaving(false);
      if (!error) { onLinked?.(); onClose(); }
      return;
    }
    if (lead && linkSelectedKajabiCustomer) {
      setLinkSaving(true);
      const { error } = await supabase
        .from('leads')
        .update({ customer_id: linkSelectedKajabiCustomer.id })
        .eq('id', lead.leadId);
      setLinkSaving(false);
      if (!error) { onLinked?.(); onClose(); }
    }
  };

  if (!open) return null;
  if (!customer && !lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !linkSaving && onClose()}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200">
          {customer ? (
            <>
              <h3 className="text-lg font-semibold text-gray-900">Link Kajabi customer to a lead</h3>
              <p className="text-sm text-gray-600 mt-1">
                Kajabi customer: <strong>{customer.name}</strong> ({customer.email}) · ID {customer.customerId}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-gray-900">Link this lead to a Kajabi customer</h3>
              <p className="text-sm text-gray-600 mt-1">
                Lead: <strong>{lead.name}</strong> ({lead.email})
              </p>
            </>
          )}
        </div>
        <div className="p-4 flex-1 overflow-auto">
          {customer ? (
            <>
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
                    linkSearchResults.map((l) => (
                      <button
                        key={l.lead_id}
                        type="button"
                        onClick={() => setLinkSelectedLead(l)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${linkSelectedLead?.lead_id === l.lead_id ? 'bg-indigo-50 text-indigo-800' : 'text-gray-900'}`}
                      >
                        {l.name} · {l.email} <span className="text-gray-400 font-mono">(lead {l.lead_id})</span>
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
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Kajabi customers (by name or email)</label>
              <input
                type="text"
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                placeholder="Type to search…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
              />
              {kajabiSearchLoading && <p className="text-sm text-gray-500 mb-2">Searching Kajabi…</p>}
              {linkSearchQuery.trim().length >= 2 && !kajabiSearchLoading && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-auto">
                  {kajabiSearchResults.length === 0 ? (
                    <p className="p-3 text-sm text-gray-500">No Kajabi customers found.</p>
                  ) : (
                    kajabiSearchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setLinkSelectedKajabiCustomer(c)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${linkSelectedKajabiCustomer?.id === c.id ? 'bg-indigo-50 text-indigo-800' : 'text-gray-900'}`}
                      >
                        {c.name ?? '—'} · {c.email ?? '—'} <span className="text-gray-400 font-mono">(id {c.id})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {linkSelectedKajabiCustomer && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-900">Confirm link</p>
                  <p className="text-sm text-amber-800 mt-1">
                    Set this lead&apos;s Kajabi customer ID to <strong>{linkSelectedKajabiCustomer.id}</strong> ({linkSelectedKajabiCustomer.name ?? '—'}, {linkSelectedKajabiCustomer.email ?? '—'})?
                  </p>
                  <p className="text-xs text-amber-700 mt-2">This will set leads.customer_id = {linkSelectedKajabiCustomer.id} for this lead.</p>
                </div>
              )}
            </>
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
            disabled={(customer ? !linkSelectedLead : !linkSelectedKajabiCustomer) || linkSaving}
            onClick={handleLinkConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {linkSaving ? 'Linking…' : customer ? 'Link to this lead' : 'Link to this Kajabi customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
