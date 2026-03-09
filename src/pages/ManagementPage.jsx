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
import { getWeekBoundsUTC } from '../utils/dateHelpers';
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
  const [chartDays, setChartDays] = useState(7);

  const ADS_VSL_PATH = '/ads-new-masterclass-job';
  const ADS_OPT_IN_PATH = '/ads-opt-in-masterclass';
  const ORGANIC_VSL_PATH = '/masterclass-job';
  const ORGANIC_OPT_IN_PATHS = '/pro,/';
  const [gaOptInBooking, setGaOptInBooking] = useState({
    loading: true,
    optInAds: null,
    optInOrganic: null,
    bookingAds: null,
    bookingOrganic: null,
    viewsAds: 0,
    eventsAds: 0,
    viewsOrganic: 0,
    eventsOrganic: 0,
  });

  const [occupancyNext3, setOccupancyNext3] = useState({
    loading: true,
    availableSlots: null,
    occupancyPct: null,
    freeSlotsByDay: null,
    error: null,
  });

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
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (chartDays - 1));
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
    const params = { startDate: startStr, endDate: endStr };
    const sessionParams = { ...params, metric: 'sessions' };
    async function fetchGaRates() {
      setGaOptInBooking((p) => ({ ...p, loading: true }));
      try {
        const [
          resAdsVsl,
          resAdsOptIn,
          resOrgVsl,
          resOrgOptIn,
          resAdsViews,
          resOrgViews,
        ] = await Promise.all([
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePath: ADS_VSL_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePath: ADS_OPT_IN_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePath: ORGANIC_VSL_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...sessionParams, pagePaths: ORGANIC_OPT_IN_PATHS }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...params, pagePath: ADS_VSL_PATH }).toString()}`),
          fetch(`/api/google-analytics?${new URLSearchParams({ ...params, pagePath: ORGANIC_VSL_PATH }).toString()}`),
        ]);
        const parse = async (res) => {
          const json = await res.json().catch(() => ({}));
          return res.ok ? json : null;
        };
        const [adsVsl, adsOptIn, orgVsl, orgOptIn, adsViews, orgViews] = await Promise.all([
          parse(resAdsVsl),
          parse(resAdsOptIn),
          parse(resOrgVsl),
          parse(resOrgOptIn),
          parse(resAdsViews),
          parse(resOrgViews),
        ]);
        if (cancelled) return;
        const sumSessions = (rows) => (rows || []).reduce((a, r) => a + (r.sessions ?? 0), 0);
        const sumViewsAndEvents = (rows) => (rows || []).reduce(
          (a, r) => ({ views: a.views + (r.views ?? 0), events: a.events + (r.eventCount ?? 0) }),
          { views: 0, events: 0 }
        );
        const sessAdsVsl = sumSessions(adsVsl?.rows);
        const sessAdsOptIn = sumSessions(adsOptIn?.rows);
        const sessOrgVsl = sumSessions(orgVsl?.rows);
        const sessOrgOptIn = sumSessions(orgOptIn?.rows);
        const { views: vAds, events: eAds } = sumViewsAndEvents(adsViews?.rows);
        const { views: vOrg, events: eOrg } = sumViewsAndEvents(orgViews?.rows);
        const optInAds = sessAdsOptIn > 0 ? (sessAdsVsl / sessAdsOptIn) * 100 : null;
        const optInOrganic = sessOrgOptIn > 0 ? (sessOrgVsl / sessOrgOptIn) * 100 : null;
        const bookingAds = vAds > 0 ? (eAds / vAds) * 100 : null;
        const bookingOrganic = vOrg > 0 ? (eOrg / vOrg) * 100 : null;
        setGaOptInBooking({
          loading: false,
          optInAds,
          optInOrganic,
          bookingAds,
          bookingOrganic,
          viewsAds: vAds,
          eventsAds: eAds,
          viewsOrganic: vOrg,
          eventsOrganic: eOrg,
        });
      } catch (err) {
        if (!cancelled) {
          setGaOptInBooking((p) => ({ ...p, loading: false, optInAds: null, optInOrganic: null, bookingAds: null, bookingOrganic: null }));
        }
      }
    }
    fetchGaRates();
    return () => { cancelled = true; };
  }, [chartDays]);

  useEffect(() => {
    let cancelled = false;
    async function fetchOccupancyNext3() {
      setOccupancyNext3((p) => ({ ...p, loading: true, error: null }));
      try {
        const res = await fetch('/api/closer-availability');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setOccupancyNext3({ loading: false, availableSlots: null, occupancyPct: null, freeSlotsByDay: null, error: data.error || `HTTP ${res.status}` });
          return;
        }
        // hours = available time from schedule; busyHours = 45-min blocks. Availability uses hour boundaries, so 1 hour ≈ 1 block.
        const now = new Date();
        const refTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const refToday = now.toLocaleDateString('en-CA', { timeZone: refTz });
        const refD = new Date(now);
        const next3Dates = [refToday];
        for (let i = 1; i < 3; i++) {
          refD.setDate(refD.getDate() + 1);
          next3Dates.push(refD.toLocaleDateString('en-CA', { timeZone: refTz }));
        }
        const next3Set = new Set(next3Dates);
        const refHour = parseInt(now.toLocaleString('en-US', { timeZone: refTz, hour: 'numeric', hour12: false }), 10) || 0;
        const refMinute = parseInt(now.toLocaleString('en-US', { timeZone: refTz, minute: 'numeric' }), 10) || 0;
        const refMinsIntoDay = refHour * 60 + refMinute;
        const firstCountableBlockHour = Math.ceil((refMinsIntoDay + 60) / 60);
        let totalAvailableSlots = 0;
        let totalBusySlots = 0;
        const freeByDate = {};
        (data.hoursGrid || []).forEach((row) => {
          (row.days || []).forEach((day) => {
            if (day?.date && next3Set.has(day.date)) {
              const isToday = day.date === refToday;
              const availableSlots = Math.round(day.hours || 0);
              const busySlots = Math.floor(day.busyHours ?? 0);
              let avail;
              let busy;
              if (isToday && firstCountableBlockHour >= 24) {
                avail = 0;
                busy = 0;
              } else if (isToday) {
                const lastBlockHour = 20;
                const countableBlocks = Math.max(0, lastBlockHour - firstCountableBlockHour + 1);
                avail = Math.min(availableSlots, countableBlocks);
                busy = Math.min(busySlots, countableBlocks);
              } else {
                avail = availableSlots;
                busy = busySlots;
              }
              const free = Math.max(0, avail - busy);
              totalAvailableSlots += avail;
              totalBusySlots += busy;
              freeByDate[day.date] = (freeByDate[day.date] || 0) + free;
            }
          });
        });
        const freeSlots = Math.max(0, totalAvailableSlots - totalBusySlots);
        const occupancyPct = totalAvailableSlots > 0 ? Math.round((totalBusySlots / totalAvailableSlots) * 100) : null;
        const freeSlotsByDay = next3Dates.map((date) => ({ date, free: freeByDate[date] || 0 }));
        setOccupancyNext3({
          loading: false,
          availableSlots: freeSlots,
          occupancyPct,
          freeSlotsByDay,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setOccupancyNext3({ loading: false, availableSlots: null, occupancyPct: null, freeSlotsByDay: null, error: err.message });
        }
      }
    }
    fetchOccupancyNext3();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchSeries = async () => {
      setChartLoading(true);
      try {
        const res = await fetch(`/api/management-series?days=${chartDays}`);
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
  }, [chartDays]);

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
      headerState.closerFilter,
      'call_date'  // Always filter by call_date so confirmation/occupancy are based on when calls happen
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
          Quick view
        </h1>

        {/* Management dashboard - cards + chart; cards fit content height, chart has fixed height */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                padding: '16px 20px',
                border: '1px solid #e5e7eb',
                minWidth: '240px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Opt-in &amp; booking rate (last {chartDays} days)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Opt-in conversion rate</div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
                    <span><span style={{ color: '#3b82f6', fontWeight: 600 }}>Ads:</span> {gaOptInBooking.loading ? '…' : gaOptInBooking.optInAds != null ? `${gaOptInBooking.optInAds.toFixed(1)}%` : '—'}</span>
                    <span><span style={{ color: '#f97316', fontWeight: 600 }}>Organic:</span> {gaOptInBooking.loading ? '…' : gaOptInBooking.optInOrganic != null ? `${gaOptInBooking.optInOrganic.toFixed(1)}%` : '—'}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>VSL sessions / opt-in sessions</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Booking rate</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
                      <span><span style={{ color: '#3b82f6', fontWeight: 600 }}>Ads:</span> {gaOptInBooking.loading ? '…' : gaOptInBooking.bookingAds != null ? `${gaOptInBooking.bookingAds.toFixed(1)}%` : '—'}</span>
                      <span><span style={{ color: '#f97316', fontWeight: 600 }}>Organic:</span> {gaOptInBooking.loading ? '…' : gaOptInBooking.bookingOrganic != null ? `${gaOptInBooking.bookingOrganic.toFixed(1)}%` : '—'}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                      <div><span style={{ color: '#3b82f6' }}>Ads:</span> {gaOptInBooking.loading ? '…' : `${gaOptInBooking.eventsAds} / ${gaOptInBooking.viewsAds} views`}</div>
                      <div><span style={{ color: '#f97316' }}>Organic:</span> {gaOptInBooking.loading ? '…' : `${gaOptInBooking.eventsOrganic} / ${gaOptInBooking.viewsOrganic} views`}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  padding: '16px',
                  flex: 1,
                  minWidth: '140px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Yesterday's avg attendance
                </div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>
                  {dashboardStats.loading
                    ? '…'
                    : dashboardStats.error
                      ? '—'
                      : dashboardStats.avgAttendance != null
                        ? `${Number(dashboardStats.avgAttendance).toFixed(2)}`
                        : '—'}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px', color: '#4b5563' }}>
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
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>From academic app</div>
                )}
              </div>
              <div
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  padding: '16px',
                  flex: 1,
                  minWidth: '140px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Occupancy (next 3 days)
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div
                    title={occupancyNext3.freeSlotsByDay?.length
                      ? occupancyNext3.freeSlotsByDay.map((d) => {
                          const dt = new Date(d.date + 'T12:00:00');
                          const label = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                          return `${label}: ${d.free}`;
                        }).join('\n')
                      : undefined}
                    style={{ cursor: occupancyNext3.freeSlotsByDay ? 'help' : undefined }}
                  >
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>Free slots</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                      {occupancyNext3.loading ? '…' : occupancyNext3.error ? '—' : occupancyNext3.availableSlots != null ? `${occupancyNext3.availableSlots}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>Rate</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                      {occupancyNext3.loading ? '…' : occupancyNext3.error ? '—' : occupancyNext3.occupancyPct != null ? `${occupancyNext3.occupancyPct}%` : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px' }}>45-min blocks</div>
                {occupancyNext3.error && (
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>From Calendly closers</div>
                )}
              </div>
            </div>
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
              <select
                value={chartDays}
                onChange={(e) => setChartDays(Number(e.target.value))}
                style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
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
                  <option value="purchaseRate">Success rate (%)</option>
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
                      const value = chartMetric === 'showUpRate' ? (d.showUpRate ?? 0) : chartMetric === 'purchaseRate' ? purchaseRate : chartMetric === 'conversionRate' ? conversionRateClosers : chartMetric === 'bookings' ? d.bookings : (d.totalShowedUp ?? 0);
                      const target = chartMetric === 'showUpRate' ? 55 : chartMetric === 'purchaseRate' ? 10 : chartMetric === 'conversionRate' ? 30 : null;
                      const isPercentMetricWithTarget = target != null && (chartMetric === 'showUpRate' || chartMetric === 'purchaseRate' || chartMetric === 'conversionRate');
                      const numValue = typeof value === 'number' ? value : 0;
                      const belowTarget = isPercentMetricWithTarget && numValue < target;
                      return {
                        ...d,
                        label: d.date?.slice(5) ?? d.date,
                        value,
                        belowTarget,
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
                      domain={chartMetric === 'showUpRate' || chartMetric === 'conversionRate' ? [0, 100] : chartMetric === 'purchaseRate' ? [0, 30] : [0, 'auto']}
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
                                  <div style={{ color: '#f97316' }}>Organic: {raw?.bookingsOrganic ?? 0}</div>
                                  <div style={{ color: '#3b82f6' }}>Ads: {raw?.bookingsAds ?? 0}</div>
                                  <div style={{ color: '#f59e0b' }}>Rescheduled: {raw?.bookingsRescheduled ?? 0}</div>
                                </div>
                                <div style={{ fontWeight: '600', color: '#111827', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }}>
                                  Total: {v}
                                </div>
                              </>
                            ) : isShowUpSplit ? (
                              <>
                                <div style={{ color: '#f97316' }}>Organic: {raw?.valueOrganic != null ? `${Number(raw.valueOrganic).toFixed(1)}%` : '—'}</div>
                                <div style={{ color: '#3b82f6' }}>Ads: {raw?.valueAds != null ? `${Number(raw.valueAds).toFixed(1)}%` : '—'}</div>
                                <div style={{ fontWeight: '600', color: '#111827', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #e5e7eb' }}>
                                  Total: {v}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                  {raw?.totalShowedUp ?? 0} / {raw?.totalConfirmed ?? 0} confirmed
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
                            ) : chartMetric === 'showUpRate' ? (
                              <>
                                <div style={{ fontWeight: '600', color: '#111827' }}>{v}</div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                  {raw?.totalShowedUp ?? 0} / {raw?.totalConfirmed ?? 0} confirmed
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
                        <Line type="linear" dataKey="valueOrganic" name="Organic" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} activeDot={{ r: 6 }} connectNulls />
                        <Line type="linear" dataKey="valueAds" name="Ads" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} connectNulls />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </>
                    ) : (chartMetric === 'showUpRate' || chartMetric === 'purchaseRate' || chartMetric === 'conversionRate') ? (
                      <Line
                        type="linear"
                        dataKey="value"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload } = props;
                          const fill = payload?.belowTarget ? '#ef4444' : '#6366f1';
                          return <circle cx={cx} cy={cy} r={4} fill={fill} />;
                        }}
                        activeDot={(props) => {
                          const { cx, cy, payload } = props;
                          const fill = payload?.belowTarget ? '#ef4444' : '#818cf8';
                          return <circle cx={cx} cy={cy} r={6} fill={fill} stroke="#fff" strokeWidth={2} />;
                        }}
                        connectNulls={false}
                      />
                    ) : (
                      <Line
                        type="linear"
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                padding: '16px 20px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Yesterday
              </div>
              {(() => {
                const yesterday = chartSeries.length >= 2 ? chartSeries[chartSeries.length - 2] : chartSeries.length ? chartSeries[chartSeries.length - 1] : null;
                const showed = yesterday?.totalShowedUp ?? 0;
                const confirmed = yesterday?.totalConfirmed ?? 0;
                const calls = yesterday?.callsForConfirmation ?? yesterday?.callsDeduped ?? yesterday?.calls ?? 0;
                const purchased = yesterday?.totalPurchased ?? 0;
                const conversionRate = showed > 0 ? (purchased / showed) * 100 : null;
                const successRate = calls > 0 ? (purchased / calls) * 100 : null;
                const confirmationRate = calls > 0 ? (confirmed / calls) * 100 : null;
                const showUpRate = yesterday?.showUpRate ?? null;
                const formatPct = (v) => (v != null ? `${Number(v).toFixed(1)}%` : '—');
                const color = (v, threshold) => (v == null ? '#111827' : v >= threshold ? '#22c55e' : '#ef4444');
                const Metric = ({ label, value, subtext, thresh, first }) => (
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: first ? 0 : 16, paddingRight: 16, ...(first ? {} : { borderLeft: '1px solid #e5e7eb' }) }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: color(value, thresh) }}>
                      {chartLoading ? '…' : formatPct(value)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{chartLoading ? '…' : subtext}</div>
                  </div>
                );
                return (
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 0 }}>
                    <Metric first label="Show up" value={showUpRate} subtext={confirmed > 0 ? `${showed} / ${confirmed} confirmed` : '—'} thresh={55} />
                    <Metric label="Confirmation" value={confirmationRate} subtext={calls > 0 ? `${confirmed} / ${calls} calls` : '—'} thresh={75} />
                    <Metric label="Conversion" value={conversionRate} subtext={showed > 0 ? `${purchased} / ${showed} show-ups` : '—'} thresh={30} />
                    <Metric label="Success" value={successRate} subtext={calls > 0 ? `${purchased} / ${calls} calls` : '—'} thresh={10} />
                  </div>
                );
              })()}
            </div>

            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                padding: '16px 20px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                This week
              </div>
              {(() => {
                const now = new Date();
                const { weekStart } = getWeekBoundsUTC(now);
                const mondayStr = weekStart.toISOString().slice(0, 10);
                const todayStr = now.toISOString().slice(0, 10);
                const thisWeek = chartSeries.filter((d) => d.date && d.date >= mondayStr && d.date <= todayStr);
                const showed = thisWeek.reduce((a, d) => a + (d.totalShowedUp ?? 0), 0);
                const confirmed = thisWeek.reduce((a, d) => a + (d.totalConfirmed ?? 0), 0);
                const calls = thisWeek.reduce((a, d) => a + (d.callsForConfirmation ?? d.callsDeduped ?? d.calls ?? 0), 0);
                const purchased = thisWeek.reduce((a, d) => a + (d.totalPurchased ?? 0), 0);
                const conversionRate = showed > 0 ? (purchased / showed) * 100 : null;
                const successRate = calls > 0 ? (purchased / calls) * 100 : null;
                const confirmationRate = calls > 0 ? (confirmed / calls) * 100 : null;
                const showUpRate = confirmed > 0 ? (showed / confirmed) * 100 : null;
                const formatPct = (v) => (v != null ? `${Number(v).toFixed(1)}%` : '—');
                const color = (v, threshold) => (v == null ? '#111827' : v >= threshold ? '#22c55e' : '#ef4444');
                const Metric = ({ label, value, subtext, thresh, first }) => (
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: first ? 0 : 16, paddingRight: 16, ...(first ? {} : { borderLeft: '1px solid #e5e7eb' }) }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: color(value, thresh) }}>
                      {chartLoading ? '…' : formatPct(value)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{chartLoading ? '…' : subtext}</div>
                  </div>
                );
                return (
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 0 }}>
                    <Metric first label="Show up" value={showUpRate} subtext={confirmed > 0 ? `${showed} / ${confirmed} confirmed` : '—'} thresh={55} />
                    <Metric label="Confirmation" value={confirmationRate} subtext={calls > 0 ? `${confirmed} / ${calls} calls` : '—'} thresh={75} />
                    <Metric label="Conversion" value={conversionRate} subtext={showed > 0 ? `${purchased} / ${showed} show-ups` : '—'} thresh={30} />
                    <Metric label="Success" value={successRate} subtext={calls > 0 ? `${purchased} / ${calls} calls` : '—'} thresh={10} />
                  </div>
                );
              })()}
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

