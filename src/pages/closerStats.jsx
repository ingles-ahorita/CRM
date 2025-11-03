import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';
import { LeadItemCompact, LeadListHeader } from './components/LeadItem';

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
                    {data.map((row, index) => (
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
                <LeadListHeader />
                {purchases.map(lead => (
                  <LeadItemCompact
                    key={lead.id}
                    lead={lead}
                    setterMap={setterMap}
                    closerMap={closerMap}
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
  let query = supabase
    .from('calls')
    .select(`
      call_date, 
      showed_up, 
      purchased,
      purchased_at,
      closers (id, name)
    `)
    .gte('call_date', '2025-10-01') // Start from beginning of 2024
    .order('call_date', { ascending: true });

  // Filter by closer if provided
  if (closer) {
    query = query.eq('closer_id', closer);
  }

  const { data: calls, error } = await query;

  if (error) {
    console.error('Error fetching calls:', error);
    return [];
  }

  return calculateMonthlyCloserData(calls);
}

function calculateMonthlyCloserData(calls) {
  const grouped = {};

  calls.forEach(call => {
    if (!call.call_date) return;

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
        };
      }
      return grouped[key];
    }

    // Count show-ups based on call_date
    if (call.showed_up === true) {
      getMonth(call.call_date).showUps++;
    }
    
    // Count purchases based on purchased_at date
    const monthP = getMonth(call.purchased_at);
    if (monthP && call.purchased === true) {
      monthP.purchases++;
    }
  });

  return Object.values(grouped).map(item => ({
    ...item,
    conversionRate: item.showUps > 0 ? (item.purchases / item.showUps) * 100 : 0,
    revenue: 0, // Assuming $25 per purchase
    closerName: calls[0]?.closers?.name || 'Unknown Closer'
  })).sort((a, b) => a.month.localeCompare(b.month));
}

async function fetchPurchases(closer = null, month = null) {
  if (!month) return [];

  // Parse month (format: YYYY-MM)
  const [year, monthNum] = month.split('-');
  const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
  const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999);

  let query = supabase
    .from('calls')
    .select(`
      *,
      closers (id, name),
      setters (id, name)
    `)
    .eq('purchased', true)
    .gte('purchased_at', startDate.toISOString())
    .lte('purchased_at', endDate.toISOString())
    .order('purchased_at', { ascending: false });

  // Filter by closer if provided
  if (closer) {
    query = query.eq('closer_id', closer);
  }

  const { data: purchases, error } = await query;

  if (error) {
    console.error('Error fetching purchases:', error);
    return [];
  }

  return purchases || [];
}
