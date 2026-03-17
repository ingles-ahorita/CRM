import React, { useState, useCallback } from 'react';

// Custom tooltip that shows immediately (avoids native title delay) and escapes overflow
const ConversionTooltip = ({ children, text }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const onMouseEnter = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setVisible(true);
  }, []);
  const onMouseLeave = useCallback(() => setVisible(false), []);
  if (!text) return children;
  return (
    <span
      className="block cursor-help relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
      {visible && (
        <span
          className="fixed z-[9999] px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 rounded shadow-lg whitespace-nowrap -translate-x-1/2 -translate-y-full -top-1"
          style={{ left: pos.x, top: pos.y }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

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

  // Target-based color: green when >= target, red when < target
  const getTargetColor = (value, target) => {
    if (value == null) return 'text-gray-900';
    return value >= target ? 'text-green-600' : 'text-red-600';
  };

  // Rate cell with percentage and subtext (e.g. "85.7%" + "42 / 49 bookings")
  const RateCell = ({ rate, subtext, target, colorClass, bgClass, tooltip }) => (
    <td className={`px-4 py-3 whitespace-nowrap text-center ${bgClass ?? ''}`}>
      <ConversionTooltip text={tooltip}>
        <div>
          <div className={`text-sm font-medium ${colorClass ?? getTargetColor(rate, target ?? 0)}`}>
            {rate?.toFixed(1) ?? '0.0'}%
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{subtext}</div>
        </div>
      </ConversionTooltip>
    </td>
  );

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
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {periodLabel}
              </th>
              {(periodLabel === 'Day' || periodLabel === 'Week') && (
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Book Date
                </th>
              )}
              <th className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-emerald-50' : ''}`}>
                Bookings
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-emerald-50">
                    Organic
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-emerald-50">
                    Ads
                  </th>
                </>
              )}
              <th className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-sky-50' : ''}`}>
                Pick Up
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-sky-50">
                    Organic
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-sky-50">
                    Ads
                  </th>
                </>
              )}
              <th className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-amber-50' : ''}`}>
                DQ
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-amber-50">
                    Organic
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-amber-50">
                    Ads
                  </th>
                </>
              )}
              <th className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-violet-50' : ''}`}>
                Confirmation
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-violet-50">
                    Organic
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-violet-50">
                    Ads
                  </th>
                </>
              )}
              <th className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-rose-50' : ''}`}>
                Show Up
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-rose-50">
                    Organic
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-rose-50">
                    Ads
                  </th>
                </>
              )}
              {(periodLabel !== 'Day') && (
                showOrganicSplit && (periodLabel === 'Week' || periodLabel === 'Month') ? (
                  <>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-teal-50">
                      Conv. Organic
                      </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-teal-50">
                      Conv. Ads
                      </th>
                        </>
                      ) : (
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conversion
                        </th>
                )
              )}
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Success
              </th>
              <th className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-indigo-50' : ''}`}>
                Purchased
              </th>
              {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                <>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50">
                    Organic
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50">
                    Ads
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, index) => {
              const pickUpRate = item.pickUpRate ?? (item.bookingsMadeinPeriod > 0 ? (item.totalPickedUpFromBookings || 0) / item.bookingsMadeinPeriod * 100 : null);
              const dqRate = item.dqRate ?? (item.totalPickedUpByBookDate > 0 ? (item.totalDQ || 0) / item.totalPickedUpByBookDate * 100 : null);
              const confirmationRate = item.confirmationRate ?? (item.totalBooked > 0 ? (item.totalConfirmed || 0) / item.totalBooked * 100 : null);
              const showUpRate = item.showUpRateConfirmed ?? (item.totalConfirmed > 0 ? (item.totalShowedUp || 0) / item.totalConfirmed * 100 : null);
              const successRate = item.conversionRateBooked ?? (item.totalBooked > 0 ? (item.totalPurchased || 0) / item.totalBooked * 100 : null);
              
              return (
                <tr key={index} className={index === 0 ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {(periodLabel === 'Month') && <span className="text-xs text-gray-500">{item.periodLabel}</span>}
                        {(periodLabel === 'Week') && (
                          <span className="text-xs text-gray-500">
                          {item.periodLabel} {index === 0 ? '🟢 Current' : `-${index}`}
                          </span>
                        )}
                      {(periodLabel === 'Day') && <span className="text-xs text-gray-500">{item.periodLabel}</span>}
                    </div>
                  </td>
                  {(periodLabel === 'Day' || periodLabel === 'Week') && (
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-600">
                      {periodLabel === 'Week' && item.weekStart && item.weekEnd
                        ? `${new Date(item.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${new Date(item.weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                        : periodLabel === 'Day' && item.dayStart
                          ? new Date(item.dayStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                          : '—'}
                    </td>
                  )}
                  <td className={`px-4 py-3 whitespace-nowrap text-center text-sm text-gray-900 ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-emerald-50' : ''}`}>
                      {item.bookingsMadeinPeriod}
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-green-600 bg-emerald-50">
                        {typeof item.bookingsBySource?.organic === 'object' ? item.bookingsBySource.organic.total || 0 : item.bookingsBySource?.organic || 0}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-blue-600 bg-emerald-50">
                        {typeof item.bookingsBySource?.ads === 'object' ? item.bookingsBySource.ads.total || 0 : item.bookingsBySource?.ads || 0}
                      </td>
                    </>
                  )}
                  <RateCell
                    rate={pickUpRate}
                    subtext={`${item.totalPickedUpFromBookings || 0} / ${item.bookingsMadeinPeriod || 0} bookings`}
                    target={null}
                    colorClass="text-gray-900"
                    bgClass={showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-sky-50' : ''}
                  />
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <RateCell
                        rate={item.sourceStats?.organic?.pickUpRate}
                        subtext={`${item.sourceStats?.organic?.pickedUpFromBookings ?? 0} / ${item.sourceStats?.organic?.bookingsMadeInPeriod ?? 0}`}
                        target={null}
                        colorClass="text-green-600"
                        bgClass="bg-sky-50"
                      />
                      <RateCell
                        rate={item.sourceStats?.ads?.pickUpRate}
                        subtext={`${item.sourceStats?.ads?.pickedUpFromBookings ?? 0} / ${item.sourceStats?.ads?.bookingsMadeInPeriod ?? 0}`}
                        target={null}
                        colorClass="text-blue-600"
                        bgClass="bg-sky-50"
                      />
                    </>
                  )}
                  <RateCell
                    rate={dqRate}
                    subtext={`${item.totalDQ || 0} / ${item.totalPickedUpByBookDate ?? item.totalPickedUp ?? 0} picked up`}
                    target={null}
                    colorClass="text-gray-900"
                    bgClass={showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-amber-50' : ''}
                  />
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <RateCell
                        rate={item.sourceStats?.organic?.dqRate}
                        subtext={`${item.sourceStats?.organic?.totalDQ ?? 0} / ${item.sourceStats?.organic?.totalPickedUpByBookDate ?? item.sourceStats?.organic?.totalPickedUp ?? 0}`}
                        target={null}
                        colorClass="text-green-600"
                        bgClass="bg-amber-50"
                      />
                      <RateCell
                        rate={item.sourceStats?.ads?.dqRate}
                        subtext={`${item.sourceStats?.ads?.totalDQ ?? 0} / ${item.sourceStats?.ads?.totalPickedUpByBookDate ?? item.sourceStats?.ads?.totalPickedUp ?? 0}`}
                        target={null}
                        colorClass="text-blue-600"
                        bgClass="bg-amber-50"
                      />
                    </>
                  )}
                  <RateCell
                    rate={confirmationRate}
                    subtext={`${item.totalConfirmed || 0} / ${item.totalBooked || 0} bookings`}
                    target={75}
                    bgClass={showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-violet-50' : ''}
                  />
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <RateCell
                        rate={item.sourceStats?.organic?.totalBooked > 0 ? (item.sourceStats?.organic?.totalConfirmed || 0) / item.sourceStats?.organic?.totalBooked * 100 : null}
                        subtext={`${item.sourceStats?.organic?.totalConfirmed ?? 0} / ${item.sourceStats?.organic?.totalBooked ?? 0}`}
                        target={75}
                        bgClass="bg-violet-50"
                      />
                      <RateCell
                        rate={item.sourceStats?.ads?.totalBooked > 0 ? (item.sourceStats?.ads?.totalConfirmed || 0) / item.sourceStats?.ads?.totalBooked * 100 : null}
                        subtext={`${item.sourceStats?.ads?.totalConfirmed ?? 0} / ${item.sourceStats?.ads?.totalBooked ?? 0}`}
                        target={75}
                        bgClass="bg-violet-50"
                      />
                    </>
                  )}
                  <RateCell
                    rate={showUpRate}
                    subtext={`${item.totalShowedUp || 0} / ${item.totalConfirmed || 0} confirmed`}
                    target={50}
                    bgClass={showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-rose-50' : ''}
                  />
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <RateCell
                        rate={item.sourceStats?.organic?.showUpRateConfirmed ?? item.sourceStats?.organic?.showUpRate}
                        subtext={`${item.sourceStats?.organic?.totalShowedUp ?? 0} / ${item.sourceStats?.organic?.totalConfirmed ?? 0}`}
                        target={50}
                        bgClass="bg-rose-50"
                      />
                      <RateCell
                        rate={item.sourceStats?.ads?.showUpRateConfirmed ?? item.sourceStats?.ads?.showUpRate}
                        subtext={`${item.sourceStats?.ads?.totalShowedUp ?? 0} / ${item.sourceStats?.ads?.totalConfirmed ?? 0}`}
                        target={50}
                        bgClass="bg-rose-50"
                      />
                    </>
                  )}
                  {(periodLabel !== 'Day') && (
                    showOrganicSplit && (periodLabel === 'Week' || periodLabel === 'Month') ? (
                      <>
                        <RateCell
                          rate={item.organicConversionRate}
                          subtext={`${item.sourceStats?.organic?.totalPurchased ?? 0} / ${item.sourceStats?.organic?.totalShowedUp ?? 0}`}
                          target={30}
                          bgClass="bg-teal-50"
                          tooltip={`PIF: ${(item.pifPercent ?? 0).toFixed(1)}% • Downsell: ${(item.downsellPercent ?? 0).toFixed(1)}%`}
                        />
                        <RateCell
                          rate={item.adsConversionRate}
                          subtext={`${item.sourceStats?.ads?.totalPurchased ?? 0} / ${item.sourceStats?.ads?.totalShowedUp ?? 0}`}
                          target={30}
                          bgClass="bg-teal-50"
                          tooltip={`PIF: ${(item.pifPercent ?? 0).toFixed(1)}% • Downsell: ${(item.downsellPercent ?? 0).toFixed(1)}%`}
                        />
                        </>
                      ) : (
                      <RateCell
                        rate={item.conversionRateShowedUp}
                        subtext={`${item.totalPurchased || 0} / ${item.totalShowedUp || 0} showed up`}
                        target={30}
                        tooltip={`PIF: ${(item.pifPercent ?? 0).toFixed(1)}% • Downsell: ${(item.downsellPercent ?? 0).toFixed(1)}%`}
                      />
                    )
                  )}
                  <RateCell
                    rate={successRate}
                    subtext={`${item.totalPurchased || 0} / ${item.totalBooked || 0} calls`}
                    target={10}
                  />
                  <td className={`px-4 py-3 whitespace-nowrap text-center ${showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month') ? 'bg-indigo-50' : ''}`}>
                    <div className="text-sm font-semibold text-green-600">{item.totalPurchased}</div>
                  </td>
                  {(showOrganicSplit && (periodLabel === 'Day' || periodLabel === 'Week' || periodLabel === 'Month')) && (
                    <>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-semibold text-green-600 bg-indigo-50">
                          {item.sourceStats?.organic?.totalPurchased || 0}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-semibold text-blue-600 bg-indigo-50">
                          {item.sourceStats?.ads?.totalPurchased || 0}
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
