import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';
import { LeadItemCompact, LeadListHeader } from './components/LeadItem';
import { ViewNotesModal } from './components/Modal';
import { Phone, Mail } from 'lucide-react';
import * as DateHelpers from '../utils/dateHelpers';

export default function CloserStatsDashboard() {
  const { closer } = useParams(); 
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [viewMode, setViewMode] = useState('stats'); // 'stats' or 'purchases'
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [setterMap, setSetterMap] = useState({});
  const [closerMap, setCloserMap] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const monthlyData = await fetchMonthlyCloserStats(closer);
      setData(monthlyData);
      setLoading(false);
    };
    loadData();
  }, [closer]);

  // Fetch setters and closers maps
  useEffect(() => {
    const fetchMaps = async () => {
      const { data: settersData } = await supabase
        .from('setters')
        .select('id, name');
      if (settersData) {
        const setterMapObj = {};
        settersData.forEach(s => { setterMapObj[s.id] = s.name; });
        setSetterMap(setterMapObj);
      }

      const { data: closersData } = await supabase
        .from('closers')
        .select('id, name');
      if (closersData) {
        const closerMapObj = {};
        closersData.forEach(c => { closerMapObj[c.id] = c.name; });
        setCloserMap(closerMapObj);
      }
    };
    fetchMaps();
  }, []);

  // Fetch purchases when month changes or view mode changes
  useEffect(() => {
    if (viewMode === 'purchases') {
      const loadPurchases = async () => {
        setPurchasesLoading(true);
        const purchasesData = await fetchPurchases(closer, selectedMonth);
        setPurchases(purchasesData);
        setPurchasesLoading(false);
      };
      loadPurchases();
    }
  }, [closer, selectedMonth, viewMode]); 

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          style={{ backgroundColor: '#727272ff', marginBottom: 12, color: 'white', padding: '5px 7px' }}
        >
          ← Back
        </button>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {data[0]?.closerName || 'Closer'} - Monthly Stats
        </h1>
        
        {/* View Mode Toggle */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setViewMode('stats')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'stats'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setViewMode('purchases')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'purchases'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Purchase Log
          </button>
        </div>

        {/* Month Selector */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {data.map((row) => (
              <option key={row.month} value={row.month}>
                {row.month}
              </option>
            ))}
          </select>
        </div>
        
        {viewMode === 'stats' ? (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Month
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Show-Ups
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Purchases
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider bg-green-50">
                        Conversion Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.filter(row => row.month >= '2025-10').map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.month}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 font-semibold">
                          {row.showUps}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 font-semibold">
                          {row.purchases}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-900">
                          ${row.revenue?.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold bg-green-50">
                          <span className={`${
                            row.conversionRate >= 70 ? 'text-green-600' : 
                            row.conversionRate >= 50 ? 'text-yellow-600' : 
                            'text-red-600'
                          }`}>
                            {row.conversionRate > 0 ? `${row.conversionRate?.toFixed(2)}%` : '-%'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Current Month Stats */}
            {(() => {
              const currentMonthData = data.find(row => row.month === selectedMonth);
              if (!currentMonthData) return null;
              
              return (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Show-Ups ({selectedMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900">
                      {currentMonthData.showUps}
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Purchases ({selectedMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-green-600">
                      {currentMonthData.purchases}
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Conversion Rate ({selectedMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-blue-600">
                      {currentMonthData.conversionRate?.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500">Revenue ({selectedMonth})</div>
                <div className="mt-2 text-3xl font-bold text-purple-600">
                  ${data.find(row => row.month === selectedMonth)?.revenue?.toFixed(2) || '0.00'}
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500">Best Month Overall</div>
                <div className="mt-2 text-2xl font-bold text-green-600">
                  {data.length > 0 ? data.reduce((best, current) => 
                    (current.purchases > best.purchases) ? current : best
                  ).month : 'N/A'}
                </div>
                <div className="text-sm text-gray-500">
                  {data.length > 0 ? data.reduce((best, current) => 
                    (current.purchases > best.purchases) ? current : best
                  ).purchases : 0} purchases
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Purchase Log - {selectedMonth}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {purchases.length} purchase{purchases.length !== 1 ? 's' : ''} found
              </p>
            </div>
            {purchasesLoading ? (
              <div className="p-8 text-center text-gray-500">Loading purchases...</div>
            ) : purchases.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No purchases found for this month.</div>
            ) : (
              <div>
                {/* Purchase Log Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.2fr 1.2fr 1.5fr 1fr 1fr',
                    gap: '16px',
                    padding: '12px 16px',
                    backgroundColor: '#f3f4f6',
                    borderBottom: '2px solid #e5e7eb',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  <div>Contact Info</div>
                  <div>Setter</div>
                  <div>Purchase Date</div>
                  <div>Offer</div>
                  <div style={{ textAlign: 'center' }}>Commission</div>
                  <div style={{ textAlign: 'center' }}>Notes</div>
                </div>
                {purchases.map(lead => (
                  <PurchaseItem
                    key={lead.id}
                    lead={lead}
                    setterMap={setterMap}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

async function fetchMonthlyCloserStats(closer = null) {
  console.log('this is the closer', closer);
  // Fetch calls for show-up calculations
  let callsQuery = supabase
    .from('calls')
    .select(`
      call_date, 
      showed_up,
      closers (id, name)
    `)
    .gte('call_date', '2025-10-01')
    .order('call_date', { ascending: true });

  // Filter by closer if provided
  if (closer) {
    callsQuery = callsQuery.eq('closer_id', closer);
  }

  const { data: calls, error: callsError } = await callsQuery;

  if (callsError) {
    console.error('Error fetching calls:', callsError);
    return [];
  }

  // Fetch outcome_log entries for purchase calculations (only 'yes' outcomes)
  let outcomeQuery = supabase
    .from('outcome_log')
    .select(`
      purchase_date,
      outcome,
      commission,
      call_id,
      calls!inner!call_id (
        closer_id,
        closers (id, name)
      )
    `)
    .eq('outcome', 'yes')
    .not('purchase_date', 'is', null);

  // Filter by closer via the calls relationship
  if (closer) {
    outcomeQuery = outcomeQuery.eq('calls.closer_id', closer);
    console.log('Filtering outcome_log by closer_id:', closer);
  }

  const { data: outcomeLogs, error: outcomeError } = await outcomeQuery;
  
  if (closer && outcomeLogs) {
    console.log(`Found ${outcomeLogs.length} outcome_log entries for closer ${closer}`);
    // Check if any entries have the wrong closer_id
    const wrongCloser = outcomeLogs.filter(ol => ol.calls && ol.calls.closer_id !== closer);
    if (wrongCloser.length > 0) {
      console.warn(`Warning: Found ${wrongCloser.length} outcome_log entries with wrong closer_id:`, wrongCloser);
    }
  }

  if (outcomeError) {
    console.error('Error fetching outcome logs:', outcomeError);
    return [];
  }

  return calculateMonthlyCloserData(calls, outcomeLogs || []);
}

function calculateMonthlyCloserData(calls, outcomeLogs) {
  const grouped = {};

  function getMonth(dateValue) {
    if (!dateValue) return null;

    const date = new Date(dateValue);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;

    if (!grouped[key]) {
      grouped[key] = {
        month: `${year}-${month}`,
        showUps: 0,
        purchases: 0,
        revenue: 0,
      };
    }
    return grouped[key];
  }

  // Count show-ups based on call_date from calls
  calls.forEach(call => {
    if (!call.call_date) return;
    if (call.showed_up === true) {
      getMonth(call.call_date).showUps++;
    }
  });
  
  // Count purchases and calculate revenue from outcome_log
  outcomeLogs.forEach(outcomeLog => {
    if (!outcomeLog.purchase_date) return;
    const monthP = getMonth(outcomeLog.purchase_date);
    if (monthP && outcomeLog.outcome === 'yes') {
      console.log(monthP.month, outcomeLog.outcome);
      monthP.purchases++;
      // Add commission to revenue if available
      if (outcomeLog.commission) {
        monthP.revenue += outcomeLog.commission;
      }
    }
  });

  return Object.values(grouped).map(item => ({
    ...item,
    conversionRate: item.showUps > 0 ? (item.purchases / item.showUps) * 100 : 0,
    closerName: calls[0]?.closers?.name || outcomeLogs[0]?.calls?.closers?.name || 'Unknown Closer'
  })).sort((a, b) => a.month.localeCompare(b.month));
}

async function fetchPurchases(closer = null, month = null) {
  if (!month) return [];

  // Parse month (format: YYYY-MM)
  const [year, monthNum] = month.split('-');
  const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
  const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999);

  // First, get calls filtered by closer if specified
  let callsQuery = supabase
    .from('calls')
    .select('id')
    .not('id', 'is', null);
  
  if (closer) {
    callsQuery = callsQuery.eq('closer_id', closer);
  }
  
  const { data: callsData, error: callsError } = await callsQuery;
  
  if (callsError) {
    console.error('Error fetching calls:', callsError);
    return [];
  }
  
  const callIds = callsData?.map(c => c.id) || [];
  
  if (closer && callIds.length === 0) {
    return [];
  }

  // Now query outcome_log with proper filtering
  let query = supabase
    .from('outcome_log')
    .select(`
      *,
      calls!inner!call_id (
        *,
        closers (id, name),
        setters (id, name)
      ),
      offers!offer_id (
        id,
        name
      )
    `)
    .eq('outcome', 'yes')
    .gte('purchase_date', startDate.toISOString())
    .lte('purchase_date', endDate.toISOString())
    .order('purchase_date', { ascending: false });

  // Filter by call IDs if closer is specified
  if (closer && callIds.length > 0) {
    query = query.in('call_id', callIds);
  }

  const { data: outcomeLogs, error } = await query;

  if (error) {
    console.error('Error fetching purchases:', error);
    return [];
  }

  // Transform outcome_log entries to match the expected lead format
  // Merge outcome_log data with calls data
  // Filter out entries where calls is null or missing
  // Also filter by closer_id if specified (double-check)
  let purchases = (outcomeLogs || [])
    .filter(outcomeLog => {
      // Must have a valid call
      if (!outcomeLog.calls || !outcomeLog.calls.id) return false;
      
      // Double-check closer_id if specified
      if (closer && outcomeLog.calls.closer_id !== closer) {
        return false;
      }
      
      return true;
    })
    .map(outcomeLog => ({
      ...outcomeLog.calls,
      // Add outcome_log fields that might be useful
      outcome_log_id: outcomeLog.id,
      purchase_date: outcomeLog.purchase_date,
      outcome: outcomeLog.outcome,
      commission: outcomeLog.commission,
      offer_id: outcomeLog.offer_id,
      offer_name: outcomeLog.offers?.name || null,
      discount: outcomeLog.discount,
      // Keep purchased_at for backward compatibility, but use purchase_date
      purchased_at: outcomeLog.purchase_date,
      purchased: true
    }));

  // Deduplicate by call_id - each call should only appear once in the purchase log
  // If a call has multiple outcome_log entries, keep the most recent one (by outcome_log_id)
  const seenCallIds = new Map();
  
  purchases.forEach(purchase => {
    const callId = purchase.id; // This is the call_id from the calls table
    const existing = seenCallIds.get(callId);
    
    // If no existing entry, or this outcome_log_id is newer, keep this one
    if (!existing || purchase.outcome_log_id > existing.outcome_log_id) {
      seenCallIds.set(callId, purchase);
    }
  });
  
  // Convert map values back to array
  purchases = Array.from(seenCallIds.values());
  
  // Sort by purchase_date descending
  purchases.sort((a, b) => {
    const dateA = new Date(a.purchase_date);
    const dateB = new Date(b.purchase_date);
    return dateB - dateA;
  });

  return purchases;
}

// Purchase Item Component - Simplified for purchase log
function PurchaseItem({ lead, setterMap = {} }) {
  const navigate = useNavigate();
  const [viewModalOpen, setViewModalOpen] = useState(false);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.2fr 1.2fr 1.5fr 1fr 1fr',
        gap: '16px',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '14px',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
    >
      {/* Contact Info */}
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <a
          href={`/lead/${lead.lead_id}`} 
          target="_blank"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              navigate(`/lead/${lead.lead_id}`);
            }
          }}
          style={{
            fontWeight: '600',
            color: '#111827',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: '4px',
            display: 'block'
          }}
        >
          {lead.name || 'No name'}
        </a>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginBottom: '2px'
        }}>
          <Mail size={12} />
          <a 
            style={{ color: '#6b7280', textDecoration: 'none' }} 
            href={`https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(lead.email)}`} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            {lead.email || 'No email'}
          </a>
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Phone size={12} />
          <a
            href={`https://app.manychat.com/fb1237190/chat/${lead.manychat_user_id || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#6b7280', textDecoration: 'none' }}
          >
            {lead.phone || 'No phone'}
          </a>
        </div>
      </div>

      {/* Setter */}
      <div
        onClick={() => navigate(`/setter/${lead.setter_id}`)}
        style={{
          color: '#001749ff',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '13px'
        }}
      >
        {setterMap[lead.setter_id] || 'N/A'}
      </div>

      {/* Purchase Date */}
      <div style={{ fontSize: '13px', color: '#6b7280' }}>
        {DateHelpers.formatTimeWithRelative(lead.purchase_date) || 'N/A'}
      </div>

      {/* Offer Name */}
      <div style={{ fontSize: '13px', color: '#111827', fontWeight: '500' }}>
        {lead.offer_name || 'N/A'}
      </div>

      {/* Commission */}
      <div style={{ fontSize: '13px', color: '#10b981', fontWeight: '600', textAlign: 'center' }}>
        {lead.commission ? `$${lead.commission.toFixed(2)}` : 'N/A'}
      </div>

      {/* Notes */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        <button
          onClick={() => setViewModalOpen(true)}
          style={{
            padding: '5px 12px',
            backgroundColor: (lead.setter_note_id) || (lead.closer_note_id) ? '#7053d0ff' : '#3f2f76ff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          📝 Notes
        </button>
      </div>

      <ViewNotesModal 
        isOpen={viewModalOpen} 
        onClose={() => setViewModalOpen(false)} 
        lead={lead}
        callId={lead.id}
      />
    </div>
  );
}
