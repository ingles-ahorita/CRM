import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {LeadItemCompact, LeadListHeader} from './components/LeadItem';
import { fetchAll } from '../utils/fetchLeads';
import {getDailySlotsTotal} from '../utils/ocuppancy';
import Header from './components/Header';
import { useSimpleAuth } from '../useSimpleAuth'; 
import {useSearchParams} from 'react-router-dom';
import { EndShiftModal } from './components/EndShiftModal';
import { useRealtimeLeads } from '../hooks/useRealtimeLeads';

export default function ManagementPage() {
  const { userId } = useSimpleAuth();

  const [slots, setSlots] = useState({});
  const [dashboardStats, setDashboardStats] = useState({
    avgAttendance: null,
    numberOfClasses: null,
    numberOfStudents: null,
    showUpRate: null,
    loading: true,
    error: null,
  });

  const [chartSeries, setChartSeries] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState('showUpRate');
  const [chartSplitBySource, setChartSplitBySource] = useState(false);

  const [dataState, setDataState] = useState({
    leads: [],
    loading: true,
    calltimeLoading: false,
    setterMap: {},
    closerMap: {},
    counts: { booked:0, confirmed: 0, cancelled: 0, noShow: 0, noPickup: 0, slots: 0 },
    currentDate: new Date().toISOString().split('T')[0]
  });

  const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  const [headerState, setHeaderState] = useState({
    showSearch: false,
    searchTerm: searchParams.get('search') || '',
    activeTab: searchParams.get('tab') || 'today',
    sortBy: searchParams.get('sortBy') || 'book_date',
    sortOrder: searchParams.get('sortOrder') || 'desc',
    startDate: searchParams.get('start') || '',
    endDate: searchParams.get('end') || '',
    setterFilter: searchParams.get('setter') || '',
    closerFilter: searchParams.get('closer') || '',
    filters: {
      confirmed: searchParams.get('confirmed') === 'true',
      cancelled: searchParams.get('cancelled') === 'true',
      noShow: searchParams.get('noShow') === 'true',
      noPickUp: searchParams.get('noPickUp') === 'true',
      rescheduled: searchParams.get('rescheduled') === 'true',
      transferred: searchParams.get('transferred') === 'true',
      purchased: searchParams.get('purchased') === 'true',
      lockIn: searchParams.get('lockIn') === 'true'
    },
    onEndShift: () => setIsEndShiftModalOpen(true)
  });

  // Enable real-time updates for admin view
  useRealtimeLeads(dataState, setDataState, headerState.activeTab);

  useEffect(() => {
    let cancelled = false;
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/academic-stats');
        const raw = await res.text();
        let data = {};
        if (raw.trim()) {
          try {
            data = JSON.parse(raw);
          } catch (_) {
            if (!cancelled) {
              setDashboardStats({
                avgAttendance: null,
                numberOfClasses: null,
                numberOfStudents: null,
                showUpRate: null,
                loading: false,
                error: res.ok ? 'Invalid response' : `HTTP ${res.status}`,
              });
            }
            return;
          }
        }
        if (!cancelled) {
          setDashboardStats({
            avgAttendance: data.avgAttendance ?? null,
            numberOfClasses: data.numberOfClasses ?? null,
            numberOfStudents: data.numberOfStudents ?? null,
            showUpRate: data.showUpRate ?? null,
            loading: false,
            error: data.error || null,
          });
        }
      } catch (err) {
        console.error('Dashboard stats error:', err);
        if (!cancelled) {
          setDashboardStats({
            avgAttendance: null,
            numberOfClasses: null,
            numberOfStudents: null,
            showUpRate: null,
            loading: false,
            error: err.message,
          });
        }
      }
    };
    fetchDashboard();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchSeries = async () => {
      setChartLoading(true);
      try {
        const res = await fetch('/api/management-series?days=7');
        const raw = await res.text();
        let data = {};
        if (raw.trim()) {
          try {
            data = JSON.parse(raw);
          } catch (_) {
            if (!cancelled) setChartSeries([]);
            return;
          }
        }
        if (!cancelled) {
          setChartSeries(Array.isArray(data.series) ? data.series : []);
        }
      } catch (err) {
        if (!cancelled) setChartSeries([]);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };
    fetchSeries();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    console.log('Updating URL with headerState:', headerState);
    const params = new URLSearchParams();
    
    if (headerState.searchTerm) params.set('search', headerState.searchTerm);
    if (headerState.activeTab !== 'today') params.set('tab', headerState.activeTab);
    if (headerState.sortBy !== 'book_date') params.set('sortBy', headerState.sortBy);
    if (headerState.sortOrder !== 'desc') params.set('sortOrder', headerState.sortOrder);
    if (headerState.startDate) params.set('start', headerState.startDate);
    if (headerState.endDate) params.set('end', headerState.endDate);
    if (headerState.setterFilter) params.set('setter', headerState.setterFilter);
    if (headerState.closerFilter) params.set('closer', headerState.closerFilter);
    if (headerState.transferred) params.set('transferred', headerState.transferred);
    if (headerState.purchased) params.set('purchased', headerState.purchased);
    // Add filters
    Object.entries(headerState.filters).forEach(([key, value]) => {
      if (value) params.set(key, 'true');
    });
    
    setSearchParams(params);
  }, [headerState, setSearchParams]);

  useEffect(() => {
    console.log('Fetching leadsaaaa with headerState:', headerState);
    fetchAll(
      headerState.searchTerm,
      headerState.activeTab,
      headerState.sortBy,
      headerState.sortOrder,
      setDataState,
      null, null,
      headerState.filters,
      undefined,
      headerState.startDate,
      headerState.endDate,
      headerState.setterFilter,
      headerState.closerFilter
    );
    const loadSlots = async () => {
      try {
        const slotsData = await getDailySlotsTotal();
        // getDailySlotsTotal returns an object with date keys: { 'YYYY-MM-DD': number }
        if (slotsData && typeof slotsData === 'object' && !Array.isArray(slotsData)) {
          setSlots(slotsData);
        } else {
          console.warn('Unexpected slots data format:', slotsData);
          setSlots({});
        }
      } catch (error) {
        console.error('Error loading slots:', error);
        setSlots({});
      }
    };
    
    loadSlots();
  }, [headerState.searchTerm, headerState.activeTab, headerState.sortBy, headerState.sortOrder, headerState.filters, headerState.startDate, headerState.endDate, headerState.setterFilter, headerState.closerFilter]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb',boxSizing: 'border-box', padding: '24px', display: 'flex', width: '100%', position: 'relative'}}>
      <div style={{ width: '90%', maxWidth: 1280, margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
          Management
        </h1>

        {/* Management dashboard - cards + chart; cards fit content height, chart has fixed height */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              padding: '20px',
              width: '200px',
              flexShrink: 0,
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Yesterday's avg attendance
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
              {dashboardStats.loading
                ? '…'
                : dashboardStats.error
                  ? '—'
                  : dashboardStats.avgAttendance != null
                    ? `${Number(dashboardStats.avgAttendance).toFixed(2)}`
                    : '—'}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '13px', color: '#4b5563' }}>
              <span>
                <strong>Classes:</strong>{' '}
                {dashboardStats.loading ? '…' : dashboardStats.numberOfClasses != null ? dashboardStats.numberOfClasses : '—'}
              </span>
              <span>
                <strong>Students:</strong>{' '}
                {dashboardStats.loading ? '…' : dashboardStats.numberOfStudents != null ? dashboardStats.numberOfStudents : '—'}
              </span>
            </div>
            {dashboardStats.error && (
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>From academic app</div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              border: '1px solid #e5e7eb',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: '280px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Past 7 days
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {chartMetric === 'showUpRate' && (
                  <button
                    type="button"
                    onClick={() => setChartSplitBySource((v) => !v)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: chartSplitBySource ? '#6366f1' : '#f9fafb',
                      color: chartSplitBySource ? '#fff' : '#374151',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Split by organic/ads
                  </button>
                )}
                <select
                  value={chartMetric}
                  onChange={(e) => setChartMetric(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="showUpRate">Show up rate (%)</option>
                  <option value="purchaseRate">Purchase rate (%)</option>
                  <option value="conversionRate">Conversion rate, closers (%)</option>
                  <option value="bookings">Bookings</option>
                  <option value="calls">Show ups</option>
                </select>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: '220px', height: '220px' }}>
              {chartLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                  Loading…
                </div>
              ) : !chartSeries.length ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={chartSeries.map((d) => {
                      const bookings = d.bookings ?? 0;
                      const purchased = d.totalPurchased ?? 0;
                      const showed = d.totalShowedUp ?? 0;
                      const purchaseRate = bookings > 0 ? (purchased / bookings) * 100 : 0;
                      const conversionRateClosers = showed > 0 ? (purchased / showed) * 100 : 0;
                      return {
                        ...d,
                        label: d.date?.slice(5) ?? d.date,
                        value: chartMetric === 'showUpRate' ? (d.showUpRate ?? 0) : chartMetric === 'purchaseRate' ? purchaseRate : chartMetric === 'conversionRate' ? conversionRateClosers : chartMetric === 'bookings' ? d.bookings : (d.totalShowedUp ?? 0),
                        valueOrganic: typeof d.showUpRateOrganic === 'number' ? d.showUpRateOrganic : 0,
                        valueAds: typeof d.showUpRateAds === 'number' ? d.showUpRateAds : 0,
                      };
                    })}
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    {chartMetric === 'showUpRate' && <ReferenceLine y={55} stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" label={{ value: 'Target 55%', position: 'right', fill: '#22c55e', fontSize: 11 }} />}
                    {chartMetric === 'purchaseRate' && <ReferenceLine y={10} stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" label={{ value: 'Target 10%', position: 'right', fill: '#22c55e', fontSize: 11 }} />}
                    {chartMetric === 'conversionRate' && <ReferenceLine y={30} stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" label={{ value: 'Target 30%', position: 'right', fill: '#22c55e', fontSize: 11 }} />}
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={chartMetric === 'showUpRate' || chartMetric === 'purchaseRate' || chartMetric === 'conversionRate' ? (v) => `${v}%` : (v) => v}
                      domain={chartMetric === 'showUpRate' || chartMetric === 'purchaseRate' || chartMetric === 'conversionRate' ? [0, 100] : [0, 'auto']}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const raw = payload[0]?.payload;
                        const isBookings = chartMetric === 'bookings';
                        const isShowUpSplit = chartMetric === 'showUpRate' && chartSplitBySource;
                        const isPurchaseRate = chartMetric === 'purchaseRate';
                        const isConversionRate = chartMetric === 'conversionRate';
                        const isShowUps = chartMetric === 'calls';
                        const v = chartMetric === 'showUpRate'
                          ? (raw?.showUpRate != null ? `${Number(raw.showUpRate).toFixed(1)}%` : '—')
                          : isPurchaseRate || isConversionRate
                            ? (raw?.value != null ? `${Number(raw.value).toFixed(1)}%` : '—')
                            : isBookings
                              ? raw?.bookings
                              : isShowUps
                                ? (raw?.totalShowedUp ?? 0)
                                : raw?.calls;
                        return (
                          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px', fontSize: '13px' }}>
                            <div style={{ color: '#6b7280', marginBottom: '6px' }}>{raw?.date ?? raw?.label}</div>
                            {isBookings ? (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ color: '#22c55e' }}>Organic: {raw?.bookingsOrganic ?? 0}</div>
                                  <div style={{ color: '#3b82f6' }}>Ads: {raw?.bookingsAds ?? 0}</div>
                                  <div style={{ color: '#f59e0b' }}>Rescheduled: {raw?.bookingsRescheduled ?? 0}</div>
                                </div>
                                <div style={{ fontWeight: '600', color: '#111827', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }}>
                                  Total: {v}
                                </div>
                              </>
                            ) : isShowUpSplit ? (
                              <>
                                <div style={{ color: '#22c55e' }}>Organic: {raw?.valueOrganic != null ? `${Number(raw.valueOrganic).toFixed(1)}%` : '—'}</div>
                                <div style={{ color: '#3b82f6' }}>Ads: {raw?.valueAds != null ? `${Number(raw.valueAds).toFixed(1)}%` : '—'}</div>
                                <div style={{ fontWeight: '600', color: '#111827', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #e5e7eb' }}>
                                  Total: {v}
                                </div>
                              </>
                            ) : isPurchaseRate ? (
                              <>
                                <div style={{ fontWeight: '600', color: '#111827' }}>{v}</div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                  {raw?.totalPurchased ?? 0} / {raw?.bookings ?? 0} booked
                                </div>
                              </>
                            ) : isConversionRate ? (
                              <>
                                <div style={{ fontWeight: '600', color: '#111827' }}>{v}</div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                  {raw?.totalPurchased ?? 0} / {raw?.totalShowedUp ?? 0} showed up
                                </div>
                              </>
                            ) : isShowUps ? (
                              <>
                                <div style={{ fontWeight: '600', color: '#111827' }}>{v}</div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                  {raw?.totalShowedUp ?? 0} / {raw?.totalConfirmed ?? 0} confirmed
                                </div>
                              </>
                            ) : (
                              <div style={{ fontWeight: '600', color: '#111827' }}>{v}</div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {chartMetric === 'showUpRate' && chartSplitBySource ? (
                      <>
                        <Line type="monotone" dataKey="valueOrganic" name="Organic" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} activeDot={{ r: 6 }} connectNulls />
                        <Line type="monotone" dataKey="valueAds" name="Ads" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} connectNulls />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </>
                    ) : (
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ fill: '#6366f1', strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }}
                        connectNulls={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '200px', flexShrink: 0 }}>
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                padding: '20px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Yesterday's show up rate
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                {chartLoading
                  ? '…'
                  : (() => {
                      const yesterday = chartSeries.length ? chartSeries[chartSeries.length - 1] : null;
                      const rate = yesterday?.showUpRate;
                      return rate != null ? `${Number(rate).toFixed(1)}%` : '—';
                    })()}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                {chartLoading ? '…' : (() => {
                  const yesterday = chartSeries.length ? chartSeries[chartSeries.length - 1] : null;
                  const showed = yesterday?.totalShowedUp ?? 0;
                  const confirmed = yesterday?.totalConfirmed ?? 0;
                  return confirmed > 0 ? `${showed} / ${confirmed} confirmed` : '—';
                })()}
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                padding: '20px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Yesterday's conversion rate
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                {chartLoading
                  ? '…'
                  : (() => {
                      const yesterday = chartSeries.length ? chartSeries[chartSeries.length - 1] : null;
                      const showed = yesterday?.totalShowedUp ?? 0;
                      const purchased = yesterday?.totalPurchased ?? 0;
                      const rate = showed > 0 ? (purchased / showed) * 100 : null;
                      return rate != null ? `${Number(rate).toFixed(1)}%` : '—';
                    })()}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                {chartLoading ? '…' : (() => {
                  const yesterday = chartSeries.length ? chartSeries[chartSeries.length - 1] : null;
                  const purchased = yesterday?.totalPurchased ?? 0;
                  const showed = yesterday?.totalShowedUp ?? 0;
                  return showed > 0 ? `${purchased} / ${showed} showed up` : '—';
                })()}
              </div>
            </div>
          </div>
        </div>
        
        <Header
          state={{...headerState, setterMap: dataState.setterMap, closerMap: dataState.closerMap}}
          setState={setHeaderState}
          mode='full'
        />

        {/* Stats Section */}
        {(headerState.activeTab !== 'all') && (
          <div style={{ 
            display: 'flex', 
            gap: '16px', 
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px'
          }}>
            { (headerState.sortBy === 'call_date') && (
              <>
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  <strong>Slots:</strong> {slots[dataState.currentDate] || 0}
                </span>
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  <strong>Occupancy:</strong> {slots[dataState.currentDate] ? ((dataState.counts.confirmed / slots[dataState.currentDate]) * 100).toFixed(2) : 0}%
                </span>
              </>
            )}

            <span style={{ fontSize: '14px', color: '#374151' }}>
              <strong>Booked:</strong> {dataState.counts.booked}
            </span>
            <span style={{ fontSize: '14px', color: '#374151' }}>
              <strong>Confirmed:</strong> {dataState.counts.confirmed}
            </span>
            <span style={{ fontSize: '14px', color: '#374151' }}>
              <strong>Cancelled:</strong> {dataState.counts.cancelled}
            </span>
            <span style={{ fontSize: '14px', color: '#374151' }}>
              <strong>No Pick up:</strong> {dataState.counts.noPickup}
            </span>
            <span style={{ fontSize: '14px', color: '#374151' }}>
              <strong>No Shows:</strong> {dataState.counts.noShow}
            </span>
          </div>
        )}

        {dataState.loading && (
          <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading leads...</div>
          </div>
        )}

        {!dataState.loading && (
          <div>
            <LeadListHeader />
            {dataState.leads.map(lead => (
              <LeadItemCompact
                key={lead.id}
                lead={lead}
                setterMap={dataState.setterMap}
                closerMap={dataState.closerMap}
                calltimeLoading={dataState.calltimeLoading}
              />
            ))}

            {(dataState.leads.length === 0 && !dataState.loading) && (
              <div style={{ fontSize: '18px', color: '#6b7280', textAlign: 'center', marginTop: '24px' }}>
                No leads found.
              </div>
            )}
          </div>
        )}

        {/* End Shift Modal */}
        <EndShiftModal
          isOpen={isEndShiftModalOpen}
          onClose={() => setIsEndShiftModalOpen(false)}
          mode="admin"
          userId={null}
          setterMap={dataState.setterMap}
          closerMap={dataState.closerMap}
          leads={dataState.leads}
        />
      </div>
    </div>
  );
}

