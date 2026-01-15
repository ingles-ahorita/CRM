import React, { useState } from 'react';

const ComparisonTable = ({ 
  data, 
  title, 
  description, 
  periodLabel, 
  loading 
}) => {
  const [showOrganicSplit, setShowOrganicSplit] = useState(false);
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-lg text-gray-600">Loading {title.toLowerCase()}...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-lg text-gray-600">No data available</div>
      </div>
    );
  }

  const getChangeIndicator = (current, previous) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return (
      <span className={`text-xs ml-2 ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
        ({change > 0 ? '+' : ''}{change.toFixed(1)}%)
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow mb-8">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
          <button
            onClick={() => setShowOrganicSplit(!showOrganicSplit)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              showOrganicSplit
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {showOrganicSplit ? 'Hide' : 'Show'} Organic/Ads Split
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto" style={{ width: '100%', maxWidth: '100%' }}>
        <table className="divide-y divide-gray-200" style={{ minWidth: 'max-content' }}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {periodLabel}
              </th>
              {(periodLabel === 'Day' || periodLabel === 'Week') && (
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Book Date
                </th>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Bookings
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organic Bookings
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ads Bookings
                  </th>
                </>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pick Up Rate
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Pick Ups
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organic Pick Up Rate
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ads Pick Up Rate
                  </th>
                </>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Calls
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organic Calls
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ads Calls
                  </th>
                </>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Confirmation Rate
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organic Confirmation Rate
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ads Confirmation Rate
                  </th>
                </>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Confirmed
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organic Confirmed
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ads Confirmed
                  </th>
                </>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Show Up Rate
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organic Show Up Rate
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ads Show Up Rate
                  </th>
                </>
              )}
              {(periodLabel !== 'Day') && (
                <>
                  {periodLabel === 'Week' ? (
                    <>
                      {showOrganicSplit ? (
                        <>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Organic Conversion Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Ads Conversion Rate
                          </th>
                        </>
                      ) : (
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Conversion Rate
                        </th>
                      )}
                    </>
                  ) : (
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Conversion Rate
                    </th>
                  )}
                </>
              )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Purchased
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organic Purchased
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ads Purchased
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, index) => {
              // Previous period in time is next in the array (more recent)
              const prevItem = index < data.length - 1 ? data[index + 1] : null;
              
              return (
                <tr key={index} className={index === 0 ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                        {(periodLabel === 'Month') && (
                          <span className="text-xs text-gray-500">{item.periodLabel}</span>
                        )}
                        {(periodLabel === 'Week') && (
                          <span className="text-xs text-gray-500">
                            {item.periodLabel} {index === 0 ? '🟢 Current Period' : `${periodLabel} -${index}`}
                          </span>
                        )}
                        {(periodLabel === 'Day') && (
                          <span className="text-xs text-gray-500">{item.periodLabel}</span>
                        )}
                      <br />
                    </div>
                  </td>
                  {(periodLabel === 'Day' || periodLabel === 'Week') && (
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-600">
                        {(() => {
                          if (periodLabel === 'Week' && item.weekStart && item.weekEnd) {
                            const start = new Date(item.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const end = new Date(item.weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            return `${start} - ${end}`;
                          } else if (periodLabel === 'Day' && item.dayStart) {
                            return new Date(item.dayStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }
                          return 'N/A';
                        })()}
                      </div>
                    </td>
                  )}
                   <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.bookingsMadeinPeriod}
                    </div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-green-600">
                          {typeof item.bookingsBySource?.organic === 'object' 
                            ? item.bookingsBySource.organic.total || 0
                            : item.bookingsBySource?.organic || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-blue-600">
                          {typeof item.bookingsBySource?.ads === 'object'
                            ? item.bookingsBySource.ads.total || 0
                            : item.bookingsBySource?.ads || 0}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.pickUpRate?.toFixed(1) || (item.bookingsMadeinPeriod > 0 
                        ? ((item.totalPickedUpFromBookings || 0) / item.bookingsMadeinPeriod * 100).toFixed(1)
                        : '0.0')}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.totalPickedUpFromBookings || 0}
                    </div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-green-600">
                          {item.sourceStats?.organic?.pickUpRate?.toFixed(1) || '0.0'}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-blue-600">
                          {item.sourceStats?.ads?.pickUpRate?.toFixed(1) || '0.0'}%
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.totalBooked}
                    </div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-green-600">
                          {item.sourceStats?.organic?.totalBooked || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-blue-600">
                          {item.sourceStats?.ads?.totalBooked || 0}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.confirmationRate?.toFixed(1) || (item.totalBooked > 0 
                        ? ((item.totalConfirmed || 0) / item.totalBooked * 100).toFixed(1)
                        : '0.0')}%
                    </div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-green-600">
                          {item.sourceStats?.organic?.totalBooked > 0 
                            ? ((item.sourceStats?.organic?.totalConfirmed || 0) / item.sourceStats?.organic?.totalBooked * 100).toFixed(1)
                            : '0.0'}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-blue-600">
                          {item.sourceStats?.ads?.totalBooked > 0 
                            ? ((item.sourceStats?.ads?.totalConfirmed || 0) / item.sourceStats?.ads?.totalBooked * 100).toFixed(1)
                            : '0.0'}%
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.totalConfirmed}
                    </div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-green-600">
                          {item.sourceStats?.organic?.totalConfirmed || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-blue-600">
                          {item.sourceStats?.ads?.totalConfirmed || 0}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.showUpRateConfirmed?.toFixed(1) || '0.0'}%
                    </div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-green-600">
                          {item.sourceStats?.organic?.showUpRate?.toFixed(1) || '0.0'}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-blue-600">
                          {item.sourceStats?.ads?.showUpRate?.toFixed(1) || '0.0'}%
                        </div>
                      </td>
                    </>
                  )}
                  {(periodLabel !== 'Day') && (
                    <>
                      {periodLabel === 'Week' ? (
                        <>
                          {showOrganicSplit ? (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm text-green-600">
                                  {item.organicConversionRate?.toFixed(1) || '0.0'}%
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="text-sm text-blue-600">
                                  {item.adsConversionRate?.toFixed(1) || '0.0'}%
                                </div>
                              </td>
                            </>
                          ) : (
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">
                                {item.conversionRateShowedUp?.toFixed(1) || '0.0'}%
                              </div>
                            </td>
                          )}
                        </>
                      ) : (
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">
                            {item.conversionRateShowedUp?.toFixed(1) || '0.0'}%
                          </div>
                        </td>
                      )}
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-green-600">
                      {item.totalPurchased}
                    </div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm font-semibold text-green-600">
                          {item.sourceStats?.organic?.totalPurchased || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm font-semibold text-blue-600">
                          {item.sourceStats?.ads?.totalPurchased || 0}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ComparisonTable;
