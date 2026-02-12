  import {LeadItem, LeadItemCompact, LeadListHeader} from './components/LeadItem';
  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { fetchAll } from '../utils/fetchLeads';
  import { fetchTransactions, fetchOffer, fetchCustomer } from '../lib/kajabiApi';
  import { supabase } from '../lib/supabaseClient';

  export default function LeadDetail() {
    const { leadID } = useParams();
    const navigate = useNavigate();

    const [dataState, setDataState] = useState({
      leads: [],
      loading: true,
      calltimeLoading: false,
      setterMap: {},
      closerMap: {}
    });

    const [kajabiTransactions, setKajabiTransactions] = useState([]);
    const [kajabiOfferMap, setKajabiOfferMap] = useState({});
    const [kajabiCustomerName, setKajabiCustomerName] = useState(null);
    const [kajabiCustomerUrl, setKajabiCustomerUrl] = useState(null);
    const [kajabiTransactionsLoading, setKajabiTransactionsLoading] = useState(false);
    const [kajabiTransactionsError, setKajabiTransactionsError] = useState(null);

    const [kajabiIdModalOpen, setKajabiIdModalOpen] = useState(false);
    const [kajabiIdInput, setKajabiIdInput] = useState('');
    const [kajabiIdSaving, setKajabiIdSaving] = useState(false);
    const [kajabiIdError, setKajabiIdError] = useState(null);

    useEffect(() => {
      fetchAll(
        undefined, undefined, undefined, undefined,
        setDataState,
        null, null, null, leadID
      );
    }, [leadID]);

    const kajabiId = dataState.leads?.[0]?.leads?.customer_id;

    useEffect(() => {
      if (!kajabiId) {
        setKajabiTransactions([]);
        setKajabiOfferMap({});
        setKajabiCustomerName(null);
        setKajabiCustomerUrl(null);
        setKajabiTransactionsError(null);
        return;
      }
      let cancelled = false;
      setKajabiTransactionsLoading(true);
      setKajabiTransactionsError(null);
      setKajabiTransactions([]);
      setKajabiOfferMap({});
      setKajabiCustomerName(null);
      setKajabiCustomerUrl(null);
      fetchTransactions({ customerId: kajabiId, perPage: 50, sort: '-created_at' })
        .then(async (res) => {
          if (cancelled) return;
          const data = res.data || [];
          setKajabiTransactions(data);
          const [offerMapResult, customer] = await Promise.all([
            (async () => {
              const offerIds = [...new Set(data.map((t) => t.relationships?.offer?.data?.id).filter(Boolean))];
              const map = {};
              await Promise.all(
                offerIds.map(async (offerId) => {
                  try {
                    const offer = await fetchOffer(offerId);
                    if (offer) map[offerId] = offer.internal_title ?? offerId;
                  } catch {
                    map[offerId] = offerId;
                  }
                })
              );
              return map;
            })(),
            fetchCustomer(kajabiId),
          ]);
          if (!cancelled) {
            setKajabiOfferMap(offerMapResult);
            setKajabiCustomerName(customer?.name ?? null);
            const contactId = customer?.contact_id;
            setKajabiCustomerUrl(
              contactId
                ? `https://app.kajabi.com/admin/contacts/${encodeURIComponent(contactId)}`
                : `https://app.kajabi.com/admin/contacts/${encodeURIComponent(kajabiId)}`
            );
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setKajabiTransactionsError(e.message || 'Failed to load Kajabi transactions');
            setKajabiTransactions([]);
          }
        })
        .finally(() => {
          if (!cancelled) setKajabiTransactionsLoading(false);
        });
      return () => { cancelled = true; };
    }, [kajabiId]);


    if (dataState.loading) return <div style={{ height: '100vh', margin: '0 auto', padding: 60, backgroundColor: '#f9fafb', color: '#6b7280' }}><h2>Loading lead...</h2></div>;
    if (!dataState.leads || dataState.leads.length === 0) return <div style={{ padding: 24 }}>Lead not found.</div>;

    const lead = dataState.leads[0];
    const leadSource = lead.leads?.source || 'organic';
    const leadMedium = lead.leads?.medium;
    const isAds = leadSource.toLowerCase().includes('ad') || leadSource.toLowerCase().includes('ads');
    
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ backgroundColor: '#727272ff', marginBottom: 12, color: 'white', padding: '5px 7px' }}>← Back</button> 
        <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto', background: 'white', padding: 20, borderRadius: 8, color: '#000000' }}>
          <h1 style={{ fontSize: 20, marginBottom: '8px' }}>
            {lead.name}
          </h1>
          
          {/* Lead Source Information */}
          <div style={{ 
            display: 'flex', 
            gap: '16px', 
            alignItems: 'center',
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Source:</span>
              <span style={{ 
                fontSize: '14px', 
                color: isAds ? '#2563eb' : '#059669',
                fontWeight: '600',
                padding: '4px 12px',
                borderRadius: '4px',
                backgroundColor: isAds ? '#dbeafe' : '#d1fae5'
              }}>
                {isAds ? 'Ads' : 'Organic'}
              </span>
            </div>
            
            {isAds && leadMedium && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Medium:</span>
                <span style={{ 
                  fontSize: '14px', 
                  color: leadMedium.toLowerCase() === 'tiktok' ? '#ec4899' : '#8b5cf6',
                  fontWeight: '600',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  backgroundColor: leadMedium.toLowerCase() === 'tiktok' ? '#fce7f3' : '#f3e8ff',
                  textTransform: 'capitalize'
                }}>
                  {leadMedium}
                </span>
              </div>
            )}
          </div>
          
          {dataState.leads.map((call) => (
            <LeadItem
            key={call.id}
            lead={call}
            setterMap={dataState.setterMap}
            closerMap={dataState.closerMap}
            mode={localStorage.getItem('userRole')}
            calltimeLoading={dataState.calltimeLoading}/>
          ))}

          {/* Kajabi transactions for this lead (using leads.customer_id) */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Kajabi transactions</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {kajabiCustomerUrl && (
                  <a
                    href={kajabiCustomerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '6px 14px', fontSize: 14, fontWeight: 500, color: '#4f46e5', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 6, textDecoration: 'none' }}
                  >
                    Open in Kajabi
                  </a>
                )}
                <button
                type="button"
                onClick={() => {
                  setKajabiIdInput(lead.leads?.customer_id ?? '');
                  setKajabiIdError(null);
                  setKajabiIdModalOpen(true);
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#4f46e5',
                  backgroundColor: '#eef2ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {lead.leads?.customer_id ? 'Edit Kajabi customer ID' : 'Add Kajabi customer ID'}
              </button>
              </div>
            </div>
            {kajabiIdModalOpen && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => !kajabiIdSaving && setKajabiIdModalOpen(false)}>
                <div style={{ backgroundColor: 'white', padding: 24, borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', minWidth: 320 }} onClick={(e) => e.stopPropagation()}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Kajabi customer ID</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>Set the Kajabi customer ID for this lead (stored in <code style={{ fontSize: 12 }}>leads.customer_id</code>).</p>
                  <input
                    type="text"
                    value={kajabiIdInput}
                    onChange={(e) => setKajabiIdInput(e.target.value)}
                    placeholder="e.g. 2641455136"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12 }}
                  />
                  {kajabiIdError && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#dc2626' }}>{kajabiIdError}</p>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => !kajabiIdSaving && setKajabiIdModalOpen(false)} style={{ padding: '8px 16px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer' }}>Cancel</button>
                    <button
                      type="button"
                      disabled={kajabiIdSaving}
                      onClick={async () => {
                        setKajabiIdError(null);
                        setKajabiIdSaving(true);
                        const value = kajabiIdInput.trim() || null;
                        const { error: e } = await supabase.from('leads').update({ customer_id: value }).eq('id', lead.lead_id);
                        if (e) {
                          setKajabiIdError(e.message || 'Failed to update');
                          setKajabiIdSaving(false);
                          return;
                        }
                        setKajabiIdSaving(false);
                        setKajabiIdModalOpen(false);
                        fetchAll(undefined, undefined, undefined, undefined, setDataState, null, null, null, leadID);
                      }}
                      style={{ padding: '8px 16px', fontSize: 14, fontWeight: 500, color: 'white', backgroundColor: '#4f46e5', border: 'none', borderRadius: 6, cursor: kajabiIdSaving ? 'wait' : 'pointer' }}
                    >
                      {kajabiIdSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!kajabiId ? (
              <p style={{ fontSize: 14, color: '#6b7280' }}>No Kajabi customer ID linked for this lead. Use the button above or the All Leads page to find and store it.</p>
            ) : kajabiTransactionsLoading ? (
              <p style={{ fontSize: 14, color: '#6b7280' }}>Loading transactions…</p>
            ) : kajabiTransactionsError ? (
              <p style={{ fontSize: 14, color: '#dc2626' }}>{kajabiTransactionsError}</p>
            ) : kajabiTransactions.length === 0 ? (
              <p style={{ fontSize: 14, color: '#6b7280' }}>No transactions found in Kajabi for this customer.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Purchase ID</th>
                      <th style={{ padding: '8px 12px' }}>Customer (Kajabi)</th>
                      <th style={{ padding: '8px 12px' }}>Customer ID</th>
                      <th style={{ padding: '8px 12px' }}>Amount</th>
                      <th style={{ padding: '8px 12px' }}>Currency</th>
                      <th style={{ padding: '8px 12px' }}>Payment type</th>
                      <th style={{ padding: '8px 12px' }}>Created</th>
                      <th style={{ padding: '8px 12px' }}>Offer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kajabiTransactions.map((t) => {
                      const attrs = t.attributes || {};
                      const customerId = t.relationships?.customer?.data?.id;
                      const customerUrl = kajabiCustomerUrl || (customerId ? `https://app.kajabi.com/admin/contacts/${customerId}` : null);
                      const offerId = t.relationships?.offer?.data?.id;
                      const offerTitle = offerId ? (kajabiOfferMap[offerId] ?? offerId) : '—';
                      const formatAmount = (cents, currency = 'USD') => {
                        if (cents == null) return '—';
                        const value = (cents / 100).toFixed(2);
                        return currency === 'USD' ? `$${value}` : `${value} ${currency}`;
                      };
                      const formatDate = (str) => {
                        if (!str) return '—';
                        try { return new Date(str).toLocaleString(); } catch { return str; }
                      };
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{t.id}</td>
                          <td style={{ padding: '8px 12px' }}>{kajabiCustomerName ?? '—'}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                            {customerId ? (
                              <a href={customerUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'underline' }}>
                                {customerId}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '8px 12px' }}>{formatAmount(attrs.amount_in_cents, attrs.currency)}</td>
                          <td style={{ padding: '8px 12px' }}>{attrs.currency || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>{attrs.payment_type || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>{formatDate(attrs.created_at)}</td>
                          <td style={{ padding: '8px 12px' }}>{offerTitle}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };