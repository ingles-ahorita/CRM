import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

// Mock function - replace with your actual Supabase fetch
async function fetchStatsData(startDate, endDate) {
  const { data: calls, error } = await supabase
    .from('calls')
    .select(`
      picked_up,
      showed_up,
      confirmed,
      purchased,
      is_reschedule,
      lead_id,
      closers (id, name)
    `)
    .gte('book_date', startDate)
    .lte('book_date', endDate);

  if (error) {
    console.error('Error:', error);
    return null;
  }

   const rescheduledLeadIds = new Set(
  calls.filter(c => c.is_reschedule === true).map(c => c.lead_id)
);

const filteredCalls = calls.filter(call => {
  const keep = call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id);
  return keep;
});


// Calculate totals
const totalBooked = filteredCalls.length;
const totalPickedUp = filteredCalls.filter(c => c.picked_up === true).length;
const totalShowedUp = filteredCalls.filter(c => c.showed_up === true).length;
const totalConfirmed = filteredCalls.filter(c => c.confirmed === true).length;
const totalPurchased = filteredCalls.filter(c => c.purchased === true).length;
  // Group by closer
  const closerStats = {};
  filteredCalls.forEach(call => {
    if (call.closers) {
      const closerId = call.closers.id;
      if (!closerStats[closerId]) {
        closerStats[closerId] = {
          id: closerId,
          name: call.closers.name,
          showedUp: 0,
          purchased: 0
        };
      }
      if (call.showed_up) closerStats[closerId].showedUp++;
      if (call.purchased) closerStats[closerId].purchased++;
    }
  });

  return {
    totalBooked,
    totalPickedUp,
    totalShowedUp,
    totalConfirmed,
    totalPurchased,
    totalRescheduled: calls.filter(c => c.is_reschedule).length,
    closers: Object.values(closerStats)
  };
}

export default function StatsDashboard() {
    const getStartOfWeek = () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday as start of week
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split('T')[0];
};


    const navigate = useNavigate();
  const [startDate, setStartDate] = useState(getStartOfWeek);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    const goToPreviousWeek = () => {
  const newStart = new Date(startDate);
  newStart.setDate(newStart.getDate() - 7);
  const newEnd = new Date(endDate);
  newEnd.setDate(newStart.getDate() + 7);
  
  setStartDate(newStart.toISOString().split('T')[0]);
  setEndDate(newEnd.toISOString().split('T')[0]);
};

const goToNextWeek = () => {
  const newStart = new Date(startDate);
  newStart.setDate(newStart.getDate() + 7);
  const newEnd = new Date(endDate);
  newEnd.setDate(newStart.getDate() + 7);
  
  setStartDate(newStart.toISOString().split('T')[0]);
  setEndDate(newEnd.toISOString().split('T')[0]);
};

const goToCurrentWeek = () => {
  setStartDate(getStartOfWeek());
  setEndDate(new Date().toISOString().split('T')[0]);
};




  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [startDate, endDate]);

  const loadStats = async () => {
    setLoading(true);
    const data = await fetchStatsData(startDate, endDate);
    setStats(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading stats...</div>
      </div>
    );
  }

  if (!stats) return null;

  // Calculate metrics
  const pickUpRate = stats.totalBooked > 0 ? (stats.totalPickedUp / stats.totalBooked) * 100 : 0;
  const showUpRateConfirmed = stats.totalConfirmed > 0 ? (stats.totalShowedUp / stats.totalConfirmed) * 100 : 0;
  const showUpRateBooked = stats.totalBooked > 0 ? (stats.totalShowedUp / stats.totalBooked) * 100 : 0;
  const conversionRateShowedUp = stats.totalShowedUp > 0 ? (stats.totalPurchased / stats.totalShowedUp) * 100 : 0;
  const conversionRateBooked = stats.totalBooked > 0 ? (stats.totalPurchased / stats.totalBooked) * 100 : 0;




  return (
    <div className="min-h-screen bg-gray-50 p-8" >
        <button onClick={() => navigate(-1)} style={{ backgroundColor: '#727272ff', marginBottom: 12, color: 'white', padding: '5px 7px' }}>← Back</button> 
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Sales Performance Dashboard</h1>

           {/* Navigation Buttons */}
    <div className="flex gap-2" style={{marginBottom: '2vh'}}>
      <button
        onClick={goToPreviousWeek}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
      >
        ← Previous Week
      </button>
      <button
        onClick={goToCurrentWeek}
        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
      >
        This Week
      </button>
      <button
        onClick={goToNextWeek}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
      >
        Next Week →
      </button>
    </div>
          
          {/* Date Range Filters */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex gap-6 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={loadStats}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Overall Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Pick Up Rate */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Pick Up Rate</h3>
              <span className="text-xs text-gray-400">Picked Up / Booked</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">
              {pickUpRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {stats.totalPickedUp} / {stats.totalBooked} calls
            </div>
          </div>

          {/* Show Up Rate / Confirmed */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Show Up Rate</h3>
              <span className="text-xs text-gray-400">Showed Up / Confirmed</span>
            </div>
            <div className="text-3xl font-bold text-green-600">
              {showUpRateConfirmed.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {stats.totalShowedUp} / {stats.totalConfirmed} confirmed
            </div>
          </div>

          {/* Show Up Rate / Booked */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Show Up Rate</h3>
              <span className="text-xs text-gray-400">Showed Up / Booked</span>
            </div>
            <div className="text-3xl font-bold text-green-600">
              {showUpRateBooked.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {stats.totalShowedUp} / {stats.totalBooked} calls
            </div>
          </div>

          {/* Conversion Rate / Show up */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
              <span className="text-xs text-gray-400">Purchased / Confirmed</span>
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {conversionRateShowedUp.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {stats.totalPurchased} / {stats.totalShowedUp} Showed Up
            </div>
          </div>

          {/* Conversion Rate / Booked */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
              <span className="text-xs text-gray-400">Purchased / Booked</span>
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {conversionRateBooked.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {stats.totalPurchased} / {stats.totalBooked} calls
            </div>
          </div>

          {/* Rescheduleds */}

          <div className="bg-white p-6 rounded-lg shadow">
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-sm font-medium text-gray-500">Rescheduled Calls</h3>
    <span className="text-xs text-gray-400">Total Rescheduled</span>
  </div>
  <div className="text-3xl font-bold text-orange-600">
    {stats.totalRescheduled}
  </div>
  <div className="text-sm text-gray-500 mt-2">
    {stats.totalBooked > 0 
      ? ((stats.totalRescheduled / stats.totalBooked) * 100).toFixed(1) 
      : 0}% of total calls
  </div>
</div>

          {/* Total Calls Summary */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-lg shadow text-white">
            <h3 className="text-sm font-medium mb-2 opacity-90">Total Calls</h3>
            <div className="text-3xl font-bold">{stats.totalShowedUp}</div>
            <div className="text-sm mt-2 opacity-90">
              {stats.totalPurchased} closed deals
            </div>
          </div>
        </div>

        {/* Conversion Rate by Closer */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Conversion Rate by Closer</h2>
            <p className="text-sm text-gray-500 mt-1">Purchased / Confirmed per closer</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Closer
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Showed up
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Purchased
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conversion Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.closers.map((closer) => {
                  const conversionRate = closer.showedUp > 0 
                    ? (closer.purchased / closer.showedUp) * 100 
                    : 0;
                  
                  return (
                    <tr key={closer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900" onClick={() => navigate(`/closer-stats/${closer.id}`)} onMouseEnter={(e) => e.currentTarget.style.cursor = 'pointer'}>{closer.name} </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-900">{closer.showedUp}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm font-semibold text-green-600">{closer.purchased}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center">
                          <span className={`text-lg font-bold ${
                            conversionRate >= 70 ? 'text-green-600' :
                            conversionRate >= 50 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {conversionRate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div> 
    </div>);
}