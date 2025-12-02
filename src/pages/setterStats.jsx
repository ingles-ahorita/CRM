import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';

export default function FortnightDashboard() {
     const { setter} = useParams(); 
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  

  // Mock data - replace with your actual Supabase fetch
useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const fortnightData = await fetchFortnightStats(setter);
      setData(fortnightData);
      setLoading(false);
    };
    loadData();
  }, [setter]); 

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
        <h1 className="text-3xl font-bold text-gray-900 mb-8"> {data[0].setterName} - Monthly recap</h1>
        
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Fortnight
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Calls Booked
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Pick-Ups
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Confirmed
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Show-Ups
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Purchases
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider bg-blue-50">
                    Pick Up Rate
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider bg-green-50">
                    Show Up Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.filter(row => `${row.period}-${row.fortnight}` >= '2025-10-B').map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {row.period}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                        row.fortnight === 'A' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {row.fortnight}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 font-semibold">
                      {row.callsBooked}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {row.pickUps}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {row.confirmed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {row.showUps}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {row.purchases}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-900">
                      ${row.total?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold bg-blue-50">
                      <span className={`${
                        row.pickUpRate >= 60 ? 'text-green-600' : 
                        row.pickUpRate >= 50 ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {row.pickUpRate > 0 ? `${row.pickUpRate?.toFixed(2)}%` : '-%'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold bg-green-50">
                      <span className={`${
                        row.showUpRate >= 40 ? 'text-green-600' : 
                        row.showUpRate >= 30 ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>
                        {row.showUpRate > 0 ? `${row.showUpRate?.toFixed(2)}%` : '-%'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Total Calls Booked</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {data.reduce((sum, row) => sum + row.callsBooked, 0)}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Average Pick-Up Rate</div>
            <div className="mt-2 text-3xl font-bold text-blue-600"> 
              {(data.reduce((sum, row) => sum + row.pickUpRate, 0) / data.length)?.toFixed(1)}%
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Average Show-Up Rate</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {(data.reduce((sum, row) => sum + row.showUpRate, 0) / data.length)?.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


async function fetchFortnightStats(setter = null) {
 let query = supabase
  .from('calls')
  .select(`
    name,
    book_date,
    call_date, 
    picked_up, 
    showed_up, 
    confirmed, 
    purchased,
    purchased_at,
    setters (id, name),
    closers (id, name)
  `)
  .gte('book_date', '2025-07-01')
  .order('book_date', { ascending: true });

  // Filter by setter if provided
  if (setter) {
    query = query.eq('setter_id', setter);
  }

  const { data: calls, error } = await query;

  if (error) {
    console.error('Error fetching calls:', error);
    return [];
  }

  // Fetch purchases from outcome_log table
  let outcomeQuery = supabase
    .from('outcome_log')
    .select(`
      purchase_date,
      outcome,
      call_id,
      calls!inner!call_id (
        setter_id,
        setters (id, name)
      )
    `)
    .eq('outcome', 'yes')
    .not('purchase_date', 'is', null)
    .gte('purchase_date', '2025-07-01');

  // Filter by setter via the calls relationship
  if (setter) {
    outcomeQuery = outcomeQuery.eq('calls.setter_id', setter);
  }

  const { data: purchases, error: purchasesError } = await outcomeQuery;

  if (purchasesError) {
    console.error('Error fetching purchases from outcome_log:', purchasesError);
  }

  return calculateFortnightData(calls, purchases || []);
}

function calculateFortnightData(calls, purchases = []) {
  const grouped = {};
  // Use UTC for today's date to ensure consistency across timezones
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Reset time to start of day in UTC

  function getFortnight(dateValue){
    if (!dateValue) return null;

    // Parse date as UTC to ensure consistent results across timezones
    const date = new Date(dateValue);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = date.getUTCDate();

    const fortnight = day <= 15 ? 'A' : 'B';
    const key = `${year}-${month}-${fortnight}`;

    if (!grouped[key]) {
      grouped[key] = {
        period: `${year}-${month}`,
        fortnight: fortnight,
        callsBooked: 0,
        confirmed: 0,
        confirmedPast: 0, // Only confirmed calls that have already happened
        pickUps: 0,
        showUps: 0,
        purchases: 0,
      };
    }
    return grouped[key];
  }

  calls.forEach(call => {
    if (!call.book_date) return;

    const fortnightBook = getFortnight(call.book_date);
    if (fortnightBook) {
      fortnightBook.callsBooked++;
    }
    
    if (call.picked_up === true) {
      const fortnight = getFortnight(call.book_date);
      if (fortnight) fortnight.pickUps++;
    }
    
    if (call.showed_up === true) {
      const fortnight = getFortnight(call.call_date);
      if (fortnight) fortnight.showUps++;
    }
    
    if (call.confirmed === true) {
      const fortnight = getFortnight(call.call_date);
      if (fortnight) {
        fortnight.confirmed++;
        // Only count confirmed calls that have already happened for show-up rate calculation
        // Compare dates in UTC to ensure consistency
        if (call.call_date) {
          const callDate = new Date(call.call_date);
          callDate.setUTCHours(0, 0, 0, 0);
          if (callDate < today) {
            fortnight.confirmedPast++;
          }
        }
      }
    }
  });

  // Count purchases from outcome_log table
  purchases.forEach(purchase => {
    if (purchase.purchase_date) {
      const fortnightP = getFortnight(purchase.purchase_date);
      if (fortnightP) {
        fortnightP.purchases++;
      }
    }
  });

  return Object.values(grouped).map(item => ({
    ...item,
    pickUpRate: item.callsBooked > 0 ? (item.pickUps / item.callsBooked) * 100 : 0,
    showUpRate: item.confirmedPast > 0 ? (item.showUps / item.confirmedPast) * 100 : 0,
    total: (item.showUps * 4) + (item.purchases * 25),
    setterName: calls[0].setters.name
  })).sort((a, b) => {
    // Sort by period (year-month), then by fortnight (A before B)
    if (a.period !== b.period) {
      return a.period.localeCompare(b.period);
    }
    return a.fortnight.localeCompare(b.fortnight);
  });
}

