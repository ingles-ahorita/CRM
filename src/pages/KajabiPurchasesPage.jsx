import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPurchases, fetchCustomer, searchCustomers, fetchOffer } from '../lib/kajabiApi';
import { supabase } from '../lib/supabaseClient';
import { NotesModal } from './components/Modal';
import { StatusBadge } from './components/LeadItem';

const SEARCH_DEBOUNCE_MS = 400;
const LINK_SEARCH_DEBOUNCE_MS = 300;
const MAX_CUSTOMERS_TO_FETCH_PURCHASES = 15;
const LOCK_IN_OFFER_ID = '2150523894';
const PAYOFF_OFFER_ID = '2150799973';

/**
 * Standalone Kajabi purchases page – not connected to the rest of the app.
 * Search bar queries the whole Kajabi customer DB (name/email); results show those customers' purchases.
 */
export default function KajabiPurchasesPage() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [links, setLinks] = useState({});
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [customerMap, setCustomerMap] = useState({});
  const [customersLoading, setCustomersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [searchPurchases, setSearchPurchases] = useState([]);
  const [searchCustomerMap, setSearchCustomerMap] = useState({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchMeta, setSearchMeta] = useState(null);
  const searchTimeoutRef = useRef(null);

  const [linkedCustomerIds, setLinkedCustomerIds] = useState(new Set());
  const [linkedCustomerLeadIdMap, setLinkedCustomerLeadIdMap] = useState({});
  const [linkedPurchaseIdsFromOutcome, setLinkedPurchaseIdsFromOutcome] = useState(new Set());
  const [linkedPurchaseIdsFromOutcomeLockIn, setLinkedPurchaseIdsFromOutcomeLockIn] = useState(new Set());
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [offerMap, setOfferMap] = useState({});

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalCustomer, setLinkModalCustomer] = useState(null);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearchLoading, setLinkSearchLoading] = useState(false);
  const [linkSelectedLead, setLinkSelectedLead] = useState(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const linkSearchTimeoutRef = useRef(null);

  const [findCallModalOpen, setFindCallModalOpen] = useState(false);
  const [findCallPurchase, setFindCallPurchase] = useState(null);
  const [findCallCalls, setFindCallCalls] = useState([]);
  const [findCallLoading, setFindCallLoading] = useState(false);
  const [closerNoteOpen, setCloserNoteOpen] = useState(false);
  const [closerNoteLead, setCloserNoteLead] = useState(null);
  const [closerNoteCallId, setCloserNoteCallId] = useState(null);
  const [closerNoteInitialPurchaseId, setCloserNoteInitialPurchaseId] = useState(null);
  const [closerNoteInitialPurchaseDisplay, setCloserNoteInitialPurchaseDisplay] = useState(null);

  const [activeTab, setActiveTab] = useState('purchases'); // 'purchases' | 'lockins'
  const getCurrentMonthKey = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  };
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey); // 'YYYY-MM', default current month

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
    if (!searchQuery.trim()) {
      load(page);
    }
  }, [page, searchQuery.trim()]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchPurchases([]);
      setSearchCustomerMap({});
      setSearchError(null);
      setSearchMeta(null);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      setSearchPurchases([]);
      setSearchCustomerMap({});
      setSearchMeta(null);
      try {
        const { data: customers, meta: customersMeta } = await searchCustomers({
          search: q,
          perPage: MAX_CUSTOMERS_TO_FETCH_PURCHASES,
        });
        setSearchMeta(customersMeta);
        const map = {};
        customers.forEach((c) => { map[c.id] = { name: c.name, email: c.email }; });
        setSearchCustomerMap(map);
        const customerIds = customers.map((c) => c.id);
        const purchaseResults = await Promise.all(
          customerIds.map((id) =>
            fetchPurchases({ customerId: id, perPage: 100, sort: '-created_at' })
          )
        );
        const merged = purchaseResults.flatMap((r) => r.data || []);
        merged.sort((a, b) => {
          const t1 = (a.attributes?.created_at || '').toString();
          const t2 = (b.attributes?.created_at || '').toString();
          return t2.localeCompare(t1);
        });
        setSearchPurchases(merged);
      } catch (e) {
        setSearchError(e.message || 'Search failed');
      } finally {
        setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

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

  const isSearchMode = searchQuery.trim() !== '';
  const displayPurchases = isSearchMode ? searchPurchases : purchases;
  const displayCustomerMap = isSearchMode ? searchCustomerMap : customerMap;
  const displayLoading = isSearchMode ? searchLoading : loading;
  const displayError = isSearchMode ? searchError : error;
  const customersLoadingDisplay = isSearchMode ? false : customersLoading;

  useEffect(() => {
    const customerIds = [...new Set(
      displayPurchases
        .map((p) => p.relationships?.customer?.data?.id)
        .filter(Boolean)
    )];
    if (customerIds.length === 0) {
      setLinkedCustomerIds(new Set());
      setLinkedCustomerLeadIdMap({});
      return;
    }
    let cancelled = false;
    setLinkedLoading(true);
    supabase
      .from('leads')
      .select('id, customer_id')
      .in('customer_id', customerIds)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setLinkedCustomerIds(new Set());
          setLinkedCustomerLeadIdMap({});
          return;
        }
        const rows = data || [];
        const idSet = new Set(rows.map((r) => String(r.customer_id)));
        const leadIdMap = {};
        rows.forEach((r) => { leadIdMap[String(r.customer_id)] = r.id; });
        setLinkedCustomerIds(idSet);
        setLinkedCustomerLeadIdMap(leadIdMap);
      })
      .finally(() => {
        if (!cancelled) setLinkedLoading(false);
      });
    return () => { cancelled = true; };
  }, [displayPurchases]);

  // Purchase ids linked via outcome_log outcome = 'yes'
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('outcome_log')
      .select('kajabi_purchase_id')
      .eq('outcome', 'yes')
      .not('kajabi_purchase_id', 'is', null)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setLinkedPurchaseIdsFromOutcome(new Set());
          return;
        }
        const ids = new Set((data || []).map((r) => String(r.kajabi_purchase_id)).filter(Boolean));
        setLinkedPurchaseIdsFromOutcome(ids);
      });
    return () => { cancelled = true; };
  }, []);

  // Purchase ids linked via outcome_log outcome = 'lock_in' (count as linked only on lock-ins/payoffs tabs)
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('outcome_log')
      .select('kajabi_purchase_id')
      .eq('outcome', 'lock_in')
      .not('kajabi_purchase_id', 'is', null)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setLinkedPurchaseIdsFromOutcomeLockIn(new Set());
          return;
        }
        const ids = new Set((data || []).map((r) => String(r.kajabi_purchase_id)).filter(Boolean));
        setLinkedPurchaseIdsFromOutcomeLockIn(ids);
      });
    return () => { cancelled = true; };
  }, []);

  // When Find call modal opens with a purchase that has customerId, fetch calls for that lead
  useEffect(() => {
    if (!findCallModalOpen || !findCallPurchase?.customerId) {
      setFindCallCalls([]);
      return;
    }
    const leadId = linkedCustomerLeadIdMap[String(findCallPurchase.customerId)];
    if (!leadId) {
      setFindCallCalls([]);
      return;
    }
    let cancelled = false;
    setFindCallLoading(true);
    supabase
      .from('calls')
      .select('id, name, email, book_date, closer_note_id, setter_note_id, closer_id, setter_id, timezone, picked_up, confirmed, showed_up, purchased, outcome_log!call_id(id, outcome)')
      .eq('lead_id', leadId)
      .order('book_date', { ascending: false })
      .limit(100)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) setFindCallCalls([]);
        else setFindCallCalls(data || []);
      })
      .finally(() => {
        if (!cancelled) setFindCallLoading(false);
      });
    return () => { cancelled = true; };
  }, [findCallModalOpen, findCallPurchase?.customerId, linkedCustomerLeadIdMap]);

  useEffect(() => {
    const offerIds = [...new Set(
      displayPurchases
        .map((p) => p.relationships?.offer?.data?.id)
        .filter(Boolean)
    )];
    if (offerIds.length === 0) {
      setOfferMap({});
      return;
    }
    let cancelled = false;
    const map = {};
    Promise.all(
      offerIds.map(async (offerId) => {
        try {
          const offer = await fetchOffer(offerId);
          if (!cancelled && offer) map[offerId] = offer.internal_title ?? offerId;
        } catch {
          if (!cancelled) map[offerId] = offerId;
        }
      })
    ).then(() => {
      if (!cancelled) setOfferMap(map);
    });
    return () => { cancelled = true; };
  }, [displayPurchases]);

  useEffect(() => {
    if (!linkModalOpen) return;
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
  }, [linkModalOpen, linkSearchQuery]);

  const monthKey = (createdAt) => {
    if (!createdAt) return '—';
    const d = new Date(createdAt);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = (key) => {
    if (!key || key === '—') return key;
    const [y, m] = key.split('-');
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const lockInPurchases = displayPurchases.filter((p) => String(p.relationships?.offer?.data?.id) === LOCK_IN_OFFER_ID);
  const payoffPurchases = displayPurchases.filter((p) => String(p.relationships?.offer?.data?.id) === PAYOFF_OFFER_ID);
  const mainPurchases = displayPurchases.filter(
    (p) => String(p.relationships?.offer?.data?.id) !== LOCK_IN_OFFER_ID && String(p.relationships?.offer?.data?.id) !== PAYOFF_OFFER_ID
  );
  const tabPurchases =
    activeTab === 'lockins' ? lockInPurchases : activeTab === 'payoffs' ? payoffPurchases : mainPurchases;

  const allMonthsInTab = [...new Set(tabPurchases.map((p) => monthKey(p.attributes?.created_at)))].filter((k) => k && k !== '—').sort().reverse();
  const currentMonthKey = getCurrentMonthKey();
  const monthsForDropdown = [...new Set([currentMonthKey, ...allMonthsInTab])].filter((k) => k && k !== '—').sort().reverse();
  const countByMonth = {};
  tabPurchases.forEach((p) => {
    const k = monthKey(p.attributes?.created_at);
    if (k && k !== '—') countByMonth[k] = (countByMonth[k] || 0) + 1;
  });
  const filteredTabPurchases = selectedMonth
    ? tabPurchases.filter((p) => monthKey(p.attributes?.created_at) === selectedMonth)
    : tabPurchases;

  const isPurchaseLinked = (p) => {
    const linkedByYes = linkedPurchaseIdsFromOutcome.has(String(p.id));
    const linkedByLockIn = linkedPurchaseIdsFromOutcomeLockIn.has(String(p.id));
    if (linkedByYes) return true;
    if (activeTab === 'lockins' || activeTab === 'payoffs') return linkedByLockIn;
    return false;
  };
  const linkedPurchases = filteredTabPurchases.filter(isPurchaseLinked);
  const unlinkedPurchases = filteredTabPurchases.filter((p) => !isPurchaseLinked(p));

  const linkedByMonth = {};
  linkedPurchases.forEach((p) => {
    const key = monthKey(p.attributes?.created_at);
    if (!linkedByMonth[key]) linkedByMonth[key] = [];
    linkedByMonth[key].push(p);
  });
  const monthsSorted = Object.keys(linkedByMonth).sort().reverse();

  const stripEmoji = (str) => (str == null || str === '') ? str : String(str).replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, '').trim() || str;
  const renderPurchaseRow = (p) => {
    const attrs = p.attributes || {};
    const rels = p.relationships || {};
    const customerId = rels.customer?.data?.id;
    const customer = customerId ? displayCustomerMap[customerId] : null;
    const offerId = rels.offer?.data?.id;
    const offerTitle = offerId ? (offerMap[offerId] ?? '…') : '—';
    const isLinked = isPurchaseLinked(p);
    const leadId = customerId ? linkedCustomerLeadIdMap[String(customerId)] : null;
    const goToLead = leadId ? () => navigate(`/lead/${leadId}`) : undefined;
    const customerName = stripEmoji(customer?.name ?? '—');
    const customerEmail = customer?.email ?? '—';
    const customerIdStr = rels.customer?.data?.id || '—';
    const cellCls = 'px-2 py-1.5 text-xs whitespace-nowrap';
    const rowCls = !isLinked ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50';
    return (
      <tr key={p.id} className={rowCls}>
        <td className={`${cellCls} text-gray-900 font-mono`}>{p.id}</td>
        <td className={`${cellCls} text-gray-900`}>
          {customersLoadingDisplay ? (
            '…'
          ) : goToLead ? (
            <button type="button" onClick={goToLead} className="text-indigo-600 hover:underline text-left font-medium">
              {customerName}
            </button>
          ) : (
            customerName
          )}
        </td>
        <td className={`${cellCls} text-gray-600`}>
          {customersLoadingDisplay ? (
            '…'
          ) : goToLead ? (
            <button type="button" onClick={goToLead} className="text-indigo-600 hover:underline text-left">
              {customerEmail}
            </button>
          ) : (
            customerEmail
          )}
        </td>
        <td className={`${cellCls} text-gray-900`}>{formatAmount(attrs.amount_in_cents, attrs.currency)}</td>
        <td className={`${cellCls} text-gray-600`}>{formatDate(attrs.created_at)}</td>
        <td className={`${cellCls} text-gray-600`}>{offerTitle}</td>
        <td className={`${cellCls} text-gray-500 font-mono`}>{customerIdStr}</td>
        <td className={`${cellCls} text-center`} title={isLinked ? 'Linked via outcome log' : (customerId ? 'Not linked – click to search and link a lead' : '—')}>
          {linkedLoading ? (
            <span className="text-gray-400">…</span>
          ) : isLinked ? (
            <span className="text-green-600">Linked</span>
          ) : !customerId ? (
            <button
              type="button"
              onClick={() => {
                setLinkModalCustomer({ customerId: null, name: customer?.name ?? '—', email: customer?.email ?? '—' });
                setLinkSearchQuery('');
                setLinkSearchResults([]);
                setLinkSelectedLead(null);
                setLinkModalOpen(true);
              }}
              className="text-amber-600 hover:underline cursor-pointer"
            >
              Not linked
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFindCallPurchase({
                  purchaseId: p.id,
                  customerId,
                  name: customer?.name ?? '—',
                  email: customer?.email ?? '—',
                  amount_in_cents: p.attributes?.amount_in_cents ?? null,
                });
                setFindCallCalls([]);
                setFindCallModalOpen(true);
              }}
              className="text-amber-600 hover:underline cursor-pointer"
            >
              Not linked
            </button>
          )}
        </td>
      </tr>
    );
  };

  const thCls = 'px-2 py-1.5 text-xs font-semibold text-gray-700 uppercase text-left whitespace-nowrap';
  const tableHeader = (
    <tr>
      <th className={thCls}>Id</th>
      <th className={thCls}>Customer</th>
      <th className={thCls}>Email</th>
      <th className={thCls}>Amount</th>
      <th className={thCls}>Created</th>
      <th className={thCls}>Offer</th>
      <th className={thCls}>Customer id</th>
      <th className={`${thCls} text-center`}>In DB</th>
    </tr>
  );

  const handleLinkConfirm = async () => {
    if (!linkModalCustomer || !linkSelectedLead) return;
    setLinkSaving(true);
    const { error } = await supabase
      .from('leads')
      .update({ customer_id: linkModalCustomer.customerId })
      .eq('id', linkSelectedLead.lead_id);
    setLinkSaving(false);
    if (error) return;
    setLinkModalOpen(false);
    setLinkModalCustomer(null);
    setLinkSelectedLead(null);
    const customerIds = [...new Set(displayPurchases.map((p) => p.relationships?.customer?.data?.id).filter(Boolean))];
    if (customerIds.length > 0) {
      const { data } = await supabase.from('leads').select('id, customer_id').in('customer_id', customerIds);
      const rows = data || [];
      setLinkedCustomerIds(new Set(rows.map((r) => String(r.customer_id))));
      const map = {};
      rows.forEach((r) => { map[String(r.customer_id)] = r.id; });
      setLinkedCustomerLeadIdMap(map);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Kajabi Purchases</h1>
        <p className="text-sm text-gray-500 mb-6">
          Standalone page – data from Kajabi API (list purchases). Token is hardcoded for now.
        </p>

        <div className="mb-4">
          <label htmlFor="customer-search" className="sr-only">
            Search by customer name or email
          </label>
          <input
            id="customer-search"
            type="search"
            placeholder="Search by name or email (searches entire Kajabi customer database)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
          />
          {isSearchMode && (
            <p className="mt-1 text-sm text-gray-500">
              {searchLoading
                ? 'Searching Kajabi…'
                : searchMeta?.total_count != null
                  ? `${searchMeta.total_count} customer(s) matched; showing up to ${MAX_CUSTOMERS_TO_FETCH_PURCHASES} — ${displayPurchases.length} purchase(s).`
                  : `${displayPurchases.length} purchase(s) for matching customers.`}
            </p>
          )}
        </div>

        {displayError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {displayError}
          </div>
        )}

        {!displayLoading && displayPurchases.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="flex gap-1 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setActiveTab('purchases')}
                className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 -mb-px ${
                  activeTab === 'purchases'
                    ? 'bg-white border-gray-300 text-gray-900'
                    : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                Purchases
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lockins')}
                className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 -mb-px ${
                  activeTab === 'lockins'
                    ? 'bg-white border-gray-300 text-gray-900'
                    : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                Lock-ins
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('payoffs')}
                className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 -mb-px ${
                  activeTab === 'payoffs'
                    ? 'bg-white border-gray-300 text-gray-900'
                    : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                Payoffs
              </button>
            </div>
            {monthsForDropdown.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All months ({tabPurchases.length})</option>
                  {monthsForDropdown.map((key) => (
                    <option key={key} value={key}>
                      {monthLabel(key)} ({(countByMonth[key] ?? 0)})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {displayLoading ? (
          <div className="py-12 text-center text-gray-500">
            {isSearchMode ? 'Searching customers and loading purchases…' : 'Loading purchases…'}
          </div>
        ) : (
          <>
            {displayPurchases.length === 0 ? (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-4 py-8 text-center text-gray-500">
                  {isSearchMode
                    ? 'No customers found or no purchases for matching customers.'
                    : 'No purchases returned.'}
                </div>
              </div>
            ) : tabPurchases.length === 0 ? (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-4 py-8 text-center text-gray-500">
                  {activeTab === 'lockins'
                    ? 'No lock-ins in this result.'
                    : activeTab === 'payoffs'
                      ? 'No payoffs in this result.'
                      : 'No other purchases in this result.'}
                </div>
              </div>
            ) : filteredTabPurchases.length === 0 ? (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-4 py-8 text-center text-gray-500">
                  No purchases in selected month.
                </div>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-gray-600">
                  {filteredTabPurchases.length} purchase{filteredTabPurchases.length !== 1 ? 's' : ''}
                  {selectedMonth ? ` in ${monthLabel(selectedMonth)}` : ''}
                </p>
                {unlinkedPurchases.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Unlinked purchases</h2>
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-max w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            {tableHeader}
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {unlinkedPurchases.map((p) => renderPurchaseRow(p))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {monthsSorted.length > 0 && (
                  <div className="space-y-8">
                    <h2 className="text-lg font-semibold text-gray-800">Purchases by month (linked)</h2>
                    {monthsSorted.map((key) => (
                      <div key={key} className="bg-white rounded-lg shadow overflow-hidden">
                        <h3 className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-base font-medium text-gray-800">
                          {monthLabel(key)}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-max w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                              {tableHeader}
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {linkedByMonth[key].map((p) => renderPurchaseRow(p))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {!isSearchMode && (
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
          )}
          </>
        )}

        {/* Find call modal: pick a call to open closer note and link this purchase */}
        {findCallModalOpen && findCallPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setFindCallModalOpen(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Link purchase to a call</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Purchase #{findCallPurchase.purchaseId} · {findCallPurchase.name} · {findCallPurchase.email}
                </p>
              </div>
              <div className="p-4 flex-1 overflow-auto">
                {!linkedCustomerLeadIdMap[String(findCallPurchase.customerId)] ? (
                  <div>
                    <p className="text-sm text-gray-700 mb-3">This customer is not linked to a lead. Link them to a lead first, then you can pick a call to attach this purchase to.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkModalCustomer({ customerId: findCallPurchase.customerId, name: findCallPurchase.name, email: findCallPurchase.email });
                        setLinkSearchQuery('');
                        setLinkSearchResults([]);
                        setLinkSelectedLead(null);
                        setLinkModalOpen(true);
                        setFindCallModalOpen(false);
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      Link customer to a lead
                    </button>
                  </div>
                ) : findCallLoading ? (
                  <p className="text-sm text-gray-500">Loading calls…</p>
                ) : findCallCalls.length === 0 ? (
                  <p className="text-sm text-gray-500">No calls found for this lead.</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-700 mb-2">Select a call to open the outcome note and link this purchase:</p>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-auto">
                      {findCallCalls.map((call) => (
                        <button
                          key={call.id}
                          type="button"
                          onClick={() => {
                            setCloserNoteLead(call);
                            setCloserNoteCallId(call.id);
                            setCloserNoteInitialPurchaseId(findCallPurchase.purchaseId);
                            setCloserNoteInitialPurchaseDisplay({
                              name: findCallPurchase.name,
                              email: findCallPurchase.email,
                              amount_in_cents: findCallPurchase.amount_in_cents,
                            });
                            setFindCallModalOpen(false);
                            setFindCallPurchase(null);
                            setCloserNoteOpen(true);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 flex flex-col gap-0.5"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">{call.name || '—'}</span>
                            <span className="flex items-center gap-1">
                              <StatusBadge value={call.picked_up} label="P" title="Picked Up" />
                              <StatusBadge value={call.confirmed} label="C" title="Confirmed" />
                              <StatusBadge value={call.showed_up} label="S" title="Showed Up" />
                              <StatusBadge value={call.purchased} label="$" title="Purchased" outcomeLog={call.outcome_log} />
                            </span>
                          </div>
                          <span className="text-gray-500 text-xs">
                            {call.book_date ? new Date(call.book_date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {call.closer_note_id ? ' · has note' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setFindCallModalOpen(false); setFindCallPurchase(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Closer note modal (from Find call flow) – save with kajabi_purchase_id to link */}
        {closerNoteLead && (
          <NotesModal
            isOpen={closerNoteOpen}
            onClose={() => {
              setCloserNoteOpen(false);
              setCloserNoteLead(null);
              setCloserNoteCallId(null);
              setCloserNoteInitialPurchaseId(null);
              setCloserNoteInitialPurchaseDisplay(null);
              Promise.all([
                supabase.from('outcome_log').select('kajabi_purchase_id').eq('outcome', 'yes').not('kajabi_purchase_id', 'is', null),
                supabase.from('outcome_log').select('kajabi_purchase_id').eq('outcome', 'lock_in').not('kajabi_purchase_id', 'is', null),
              ]).then(([yesRes, lockInRes]) => {
                const yesIds = new Set((yesRes.data || []).map((r) => String(r.kajabi_purchase_id)).filter(Boolean));
                const lockInIds = new Set((lockInRes.data || []).map((r) => String(r.kajabi_purchase_id)).filter(Boolean));
                setLinkedPurchaseIdsFromOutcome(yesIds);
                setLinkedPurchaseIdsFromOutcomeLockIn(lockInIds);
              });
            }}
            lead={closerNoteLead}
            callId={closerNoteCallId}
            mode="closer"
            initialKajabiPurchaseId={closerNoteInitialPurchaseId}
            initialPurchaseDisplay={closerNoteInitialPurchaseDisplay}
          />
        )}

        {linkModalOpen && linkModalCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !linkSaving && setLinkModalOpen(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Link Kajabi customer to a lead</h3>
                {linkModalCustomer.customerId ? (
                  <p className="text-sm text-gray-600 mt-1">
                    Kajabi customer: <strong>{linkModalCustomer.name}</strong> ({linkModalCustomer.email}) · ID {linkModalCustomer.customerId}
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 mt-1">This purchase has no customer in Kajabi. Link is not available.</p>
                )}
              </div>
              <div className="p-4 flex-1 overflow-auto">
                {!linkModalCustomer.customerId ? (
                  <p className="text-sm text-gray-500">Cannot link: no Kajabi customer on this purchase.</p>
                ) : (
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
                {linkSelectedLead && linkModalCustomer.customerId && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-900">Confirm link</p>
                    <p className="text-sm text-amber-800 mt-1">
                      Link Kajabi customer <strong>{linkModalCustomer.name}</strong> to lead <strong>{linkSelectedLead.lead_id}</strong> ({linkSelectedLead.name}, {linkSelectedLead.email})?
                    </p>
                    <p className="text-xs text-amber-700 mt-2">This will set leads.customer_id = {linkModalCustomer.customerId} for that lead.</p>
                  </div>
                )}
                  </>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => !linkSaving && setLinkModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!linkModalCustomer.customerId || !linkSelectedLead || linkSaving}
                  onClick={handleLinkConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {linkSaving ? 'Linking…' : 'Link to this lead'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
