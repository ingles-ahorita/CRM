import React from 'react';

const ComparisonTable = ({ 
  data, 
  title, 
  description, 
  periodLabel, 
  loading 
}) => {
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
    <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {periodLabel}
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pick Up Rate
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Show Up Rate
              </th>
              {(periodLabel !== 'Day') && (
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Conversion Rate
              </th> )}
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Bookings
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Calls
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Confirmed
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Purchased
              </th>
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
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.pickUpRate.toFixed(1)}%
                      {periodLabel !== 'Day' ? getChangeIndicator(item.pickUpRate, prevItem?.pickUpRate) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.showUpRateConfirmed.toFixed(1)}%
                      {periodLabel !== 'Day' ? getChangeIndicator(item.showUpRateConfirmed, prevItem?.showUpRateConfirmed) : null}
                    </div>
                  </td>
                  {(periodLabel !== 'Day') && (
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.conversionRateShowedUp.toFixed(1)}%
                      {periodLabel !== 'Day' ? getChangeIndicator(item.conversionRateShowedUp, prevItem?.conversionRateShowedUp) : null}
                    </div>
                  </td>)}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.bookinsMadeinPeriod}
                      {periodLabel !== 'Day' ? getChangeIndicator(item.totalBooked, prevItem?.totalBooked) : null}
                    </div>
                  </td>
                   <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.totalBooked}
                      {periodLabel !== 'Day' ? getChangeIndicator(item.totalBooked, prevItem?.totalBooked) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm text-gray-900">
                      {item.totalConfirmed}
                      {periodLabel !== 'Day' ? getChangeIndicator(item.totalConfirmed, prevItem?.totalConfirmed) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-semibold text-green-600">
                      {item.totalPurchased}
                      {periodLabel !== 'Day' ? getChangeIndicator(item.totalPurchased, prevItem?.totalPurchased) : null}
                    </div>
                  </td>
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
