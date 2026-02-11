import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import * as DateHelpers from '../utils/dateHelpers';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend as LineLegend,
  BarChart,
  Bar,
} from 'recharts';

// Parse date string as UTC (matches SQL date_trunc behavior; consistent with generalStats/closerStats)
function parseDateAsUTC(dateString) {
  if (!dateString) return null;
  const hasTimezone = typeof dateString === 'string' && (dateString.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(dateString));
  const isoString = hasTimezone ? dateString : dateString + 'Z';
  return parseISO(isoString);
}

// Color palette for charts (Recharts)
const CHART_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#facc15',
  '#ef4444',
];

// Exclude source_type that is ads (don't include ads in any chart)
function isAdsSource(sourceType) {
  if (!sourceType) return false;
  const lower = sourceType.toLowerCase();
  return lower.includes('ad') || lower.includes('ads');
}

async function fetchUTMAnalytics(startDate, endDate) {
  // Normalize to UTC day boundaries (consistent with generalStats/closerStats)
  const startDateObj = parseDateAsUTC(startDate);
  const endDateObj = parseDateAsUTC(endDate);
  if (!startDateObj || !endDateObj) {
    return {
      pieData: [], organicDaily: [], totalOrganicCalls: 0,
      mediumBySource: [], campaignData: [], conversionByPlatform: [], conversionByCampaign: [],
    };
  }
  let startUTC, endUTC;
  if (DateHelpers.DEFAULT_TIMEZONE === 'UTC') {
    startUTC = new Date(startDateObj);
    startUTC.setUTCHours(0, 0, 0, 0);
    endUTC = new Date(endDateObj);
    endUTC.setUTCHours(23, 59, 59, 999);
  } else {
    const startDateNormalized = DateHelpers.normalizeToTimezone(startDateObj, DateHelpers.DEFAULT_TIMEZONE);
    const endDateNormalized = DateHelpers.normalizeToTimezone(endDateObj, DateHelpers.DEFAULT_TIMEZONE);
    const startOfDay = new Date(startDateNormalized);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(endDateNormalized);
    endOfDay.setHours(23, 59, 59, 999);
    startUTC = fromZonedTime(startOfDay, DateHelpers.DEFAULT_TIMEZONE);
    endUTC = fromZonedTime(endOfDay, DateHelpers.DEFAULT_TIMEZONE);
  }
  const startISO = startUTC.toISOString();
  const endISO = endUTC.toISOString();

  const { data: calls, error } = await supabase
    .from('calls')
    .select(`
      id,
      book_date,
      call_date,
      showed_up,
      source_type,
      utm_source,
      utm_medium,
      utm_campaign,
      is_reschedule,
      lead_id
    `)
    .gte('call_date', startISO)
    .lte('call_date', endISO);

  if (error) {
    console.error('Error fetching UTM calls:', error);
    return {
      pieData: [],
      organicDaily: [],
      totalOrganicCalls: 0,
      mediumBySource: [],
      campaignData: [],
      conversionByPlatform: [],
      conversionByCampaign: [],
    };
  }

  const allCalls = calls || [];

  // Reschedule deduplication
  const rescheduledLeadIds = new Set(
    allCalls.filter(c => c.is_reschedule === true).map(c => c.lead_id)
  );

  const dedupedCalls = allCalls.filter(call => {
    const keepReschedule =
      call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id);
    return keepReschedule;
  });

  // Exclude ads from all analytics
  const organicCalls = dedupedCalls.filter(call => !isAdsSource(call.source_type));

  // When utm_source is actually null (not the string "null"), don't count rescheduled calls
  const callsForStats = organicCalls.filter(call => {
    const sourceIsNull = call.utm_source == null || call.utm_source === undefined;
    if (sourceIsNull && call.is_reschedule === true) return false;
    return true;
  });

  // Pie: calls per utm_source (organic only, no ads)
  const sourceCounts = {};
  callsForStats.forEach(call => {
    const src = call.utm_source ?? 'Unknown'; // null/undefined -> 'Unknown'; string "null" stays as "null"
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  const totalCalls = Object.values(sourceCounts).reduce((sum, v) => sum + v, 0);

  const pieData = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      name: source,
      value: count,
      percentage: totalCalls > 0 ? (count / totalCalls) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Line: organic leads per day by book_date (already non-ads)
  const organicDailyMap = {};
  callsForStats.forEach(call => {
    if (!call.book_date) return;
    const dayKey = new Date(call.book_date).toISOString().slice(0, 10);
    organicDailyMap[dayKey] = (organicDailyMap[dayKey] || 0) + 1;
  });

  const organicDaily = Object.entries(organicDailyMap)
    .map(([date, count]) => ({ date, leads: count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Total organic calls booked in period
  const totalOrganicCalls = callsForStats.length;

  // Medium by source: Instagram, Facebook, TikTok, YouTube only
  const SOURCES_OF_INTEREST = ['instagram', 'facebook', 'tiktok', 'youtube'];
  const sourceMediumCounts = {};
  const allMediums = new Set();

  callsForStats.forEach(call => {
    const src = (call.utm_source || '').toLowerCase();
    if (!SOURCES_OF_INTEREST.includes(src)) return;
    const med = call.utm_medium || 'Unknown';
    allMediums.add(med);
    if (!sourceMediumCounts[src]) sourceMediumCounts[src] = {};
    sourceMediumCounts[src][med] = (sourceMediumCounts[src][med] || 0) + 1;
  });

  const sourceOrder = ['instagram', 'facebook', 'tiktok', 'youtube'];
  const mediumBySource = sourceOrder
    .filter(src => sourceMediumCounts[src])
    .map(source => {
      const mediums = sourceMediumCounts[source];
      const total = Object.values(mediums).reduce((s, v) => s + v, 0);
      const row = {
        source: source.charAt(0).toUpperCase() + source.slice(1),
        total,
      };
      allMediums.forEach(med => {
        row[med] = mediums[med] || 0;
      });
      return row;
    });

  // Campaign comparison
  const campaignCounts = {};
  callsForStats.forEach(call => {
    const c = call.utm_campaign || 'Unknown';
    campaignCounts[c] = (campaignCounts[c] || 0) + 1;
  });
  const campaignTotal = Object.values(campaignCounts).reduce((s, v) => s + v, 0);
  const campaignData = Object.entries(campaignCounts)
    .map(([name, value]) => ({
      name: name.length > 20 ? name.slice(0, 18) + '…' : name,
      fullName: name,
      value,
      percentage: campaignTotal > 0 ? (value / campaignTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15); // top 15 campaigns

  // --- Conversion rate: fetch purchases from outcome_log ---
  const { data: outcomeLogs } = await supabase
    .from('outcome_log')
    .select(`
      outcome,
      clawback,
      call_id,
      calls!inner!call_id (
        id,
        utm_source,
        utm_campaign,
        source_type,
        is_reschedule
      )
    `)
    .gte('purchase_date', startISO)
    .lte('purchase_date', endISO)
    .in('outcome', ['yes', 'refund']);

  const showUpsBySource = {};
  const showUpsByCampaign = {};
  callsForStats.forEach(call => {
    if (call.showed_up !== true) return;
    const src = call.utm_source ?? 'Unknown';
    const camp = call.utm_campaign ?? 'Unknown';
    showUpsBySource[src] = (showUpsBySource[src] || 0) + 1;
    showUpsByCampaign[camp] = (showUpsByCampaign[camp] || 0) + 1;
  });

  // Dedupe outcome_log by call_id (keep latest), same as generalStats fetchPurchasesForDateRange
  const outcomeLogsByCallId = new Map();
  (outcomeLogs || []).forEach(log => {
    if (!log.calls?.id) return;
    const existing = outcomeLogsByCallId.get(log.calls.id);
    if (!existing || log.id > existing.id) outcomeLogsByCallId.set(log.calls.id, log);
  });

  // Count purchases by purchase_date in range (same as generalStats), organic only, same null+reschedule rule.
  // Do NOT restrict to calls with call_date in range, so we match generalStats purchase count when all are organic.
  const purchasesBySource = {};
  const purchasesByCampaign = {};
  outcomeLogsByCallId.forEach((log) => {
    const call = log.calls;
    if (!call) return;
    if (isAdsSource(call.source_type)) return;
    const sourceIsNull = call.utm_source == null || call.utm_source === undefined;
    if (sourceIsNull && call.is_reschedule === true) return;
    const isPurchase = log.outcome === 'yes' || (log.outcome === 'refund' && (log.clawback ?? 100) < 100);
    if (!isPurchase) return;
    const src = call.utm_source ?? 'Unknown';
    const camp = call.utm_campaign ?? 'Unknown';
    purchasesBySource[src] = (purchasesBySource[src] || 0) + 1;
    purchasesByCampaign[camp] = (purchasesByCampaign[camp] || 0) + 1;
  });

  const allSources = new Set([...Object.keys(showUpsBySource), ...Object.keys(purchasesBySource)]);
  const conversionByPlatform = Array.from(allSources).map(name => {
    const showUps = showUpsBySource[name] || 0;
    const purchases = purchasesBySource[name] || 0;
    return {
      name: name.length > 18 ? name.slice(0, 16) + '…' : name,
      fullName: name,
      showUps,
      purchases,
      conversionRate: showUps > 0 ? (purchases / showUps) * 100 : 0,
    };
  }).sort((a, b) => b.conversionRate - a.conversionRate);

  const allCampaigns = new Set([...Object.keys(showUpsByCampaign), ...Object.keys(purchasesByCampaign)]);
  const conversionByCampaign = Array.from(allCampaigns).map(name => {
    const showUps = showUpsByCampaign[name] || 0;
    const purchases = purchasesByCampaign[name] || 0;
    return {
      name: name.length > 18 ? name.slice(0, 16) + '…' : name,
      fullName: name,
      showUps,
      purchases,
      conversionRate: showUps > 0 ? (purchases / showUps) * 100 : 0,
    };
  }).sort((a, b) => b.conversionRate - a.conversionRate);

  return {
    pieData,
    organicDaily,
    totalOrganicCalls,
    mediumBySource,
    campaignData,
    mediumKeys: Array.from(allMediums),
    conversionByPlatform,
    conversionByCampaign,
  };
}

// Custom tooltip for pie: show name, value, percentage
function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="font-medium text-gray-900">{d.name}</div>
      <div className="text-gray-600">{d.value} calls</div>
      <div className="text-gray-500">{d.percentage?.toFixed(1)}%</div>
    </div>
  );
}

// Custom tooltip for line: show date and count
function LineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="font-medium text-gray-900">{label}</div>
      <div className="text-gray-600">{payload[0].value} leads</div>
    </div>
  );
}

// Last N months for dropdown (UTC-normalized, consistent with dateHelpers)
function getLast12Months() {
  const now = new Date();
  const list = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    list.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      year: y,
      month: m,
    });
  }
  return list;
}

export default function UTMAnalyticsPage() {
  const navigate = useNavigate();

  // Default range: last 30 days in UTC
  const now = new Date();
  const endDefault = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
  const startDefault = new Date(endDefault);
  startDefault.setUTCDate(startDefault.getUTCDate() - 29);
  startDefault.setUTCHours(0, 0, 0, 0);

  const [startDate, setStartDate] = useState(startDefault.toISOString());
  const [endDate, setEndDate] = useState(endDefault.toISOString());
  const [pieData, setPieData] = useState([]);
  const [organicDaily, setOrganicDaily] = useState([]);
  const [totalOrganicCalls, setTotalOrganicCalls] = useState(0);
  const [mediumBySource, setMediumBySource] = useState([]);
  const [mediumKeys, setMediumKeys] = useState([]);
  const [campaignData, setCampaignData] = useState([]);
  const [conversionByPlatform, setConversionByPlatform] = useState([]);
  const [conversionByCampaign, setConversionByCampaign] = useState([]);
  const [conversionChartMode, setConversionChartMode] = useState('platform'); // 'platform' | 'campaign'
  const [loading, setLoading] = useState(false);

  const loadAnalytics = async (s, e) => {
    setLoading(true);
    const result = await fetchUTMAnalytics(s, e);
    setPieData(result.pieData);
    setOrganicDaily(result.organicDaily);
    setTotalOrganicCalls(result.totalOrganicCalls ?? 0);
    setMediumBySource(result.mediumBySource ?? []);
    setMediumKeys(result.mediumKeys ?? []);
    setCampaignData(result.campaignData ?? []);
    setConversionByPlatform(result.conversionByPlatform ?? []);
    setConversionByCampaign(result.conversionByCampaign ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadAnalytics(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateChange = async (type, value) => {
    if (!value) return;
    if (type === 'start') {
      const newStart = value + 'T00:00:00.000Z';
      setStartDate(newStart);
      await loadAnalytics(newStart, endDate);
    } else {
      const newEnd = value + 'T23:59:59.999Z';
      setEndDate(newEnd);
      await loadAnalytics(startDate, newEnd);
    }
  };

  const goToPreviousWeek = async () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setUTCDate(start.getUTCDate() - 7);
    end.setUTCDate(end.getUTCDate() - 7);
    const newStart = start.toISOString();
    const newEnd = end.toISOString();
    setStartDate(newStart);
    setEndDate(newEnd);
    await loadAnalytics(newStart, newEnd);
  };

  const goToNextWeek = async () => {
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setUTCDate(start.getUTCDate() + 7);
    end.setUTCDate(end.getUTCDate() + 7);
    if (end > today) return; // don't go past today
    const newStart = start.toISOString();
    const newEnd = end.toISOString();
    setStartDate(newStart);
    setEndDate(newEnd);
    await loadAnalytics(newStart, newEnd);
  };

  const goToMonth = async (year, month) => {
    const monthDate = new Date(Date.UTC(year, month - 1, 15));
    const range = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
    if (!range) return;
    const start = range.startDate.toISOString();
    const end = range.endDate.toISOString();
    setStartDate(start);
    setEndDate(end);
    await loadAnalytics(start, end);
  };

  const availableMonths = getLast12Months();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Organic Stats
          </h1>
          <button
            onClick={() => navigate('/admin')}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Back
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousWeek}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
              >
                ← Previous week
              </button>
              <button
                type="button"
                onClick={goToNextWeek}
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
              >
                Next week →
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select month
              </label>
              <select
                value=""
                onChange={e => {
                  const v = e.target.value;
                  if (!v) return;
                  const [y, m] = v.split('-').map(Number);
                  goToMonth(y, m);
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                <option value="">— Choose month —</option>
                {availableMonths.map(m => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start date (UTC)
              </label>
              <input
                type="date"
                value={startDate.slice(0, 10)}
                onChange={e => handleDateChange('start', e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End date (UTC)
              </label>
              <input
                type="date"
                value={endDate.slice(0, 10)}
                onChange={e => handleDateChange('end', e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="text-xs text-gray-500 self-center">
              {startDate.slice(0, 10)} → {endDate.slice(0, 10)} (organic only)
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            Loading analytics...
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-sm font-medium text-gray-500 mb-1">Organic calls booked (period)</h2>
              <div className="text-4xl font-bold text-gray-900">{totalOrganicCalls}</div>
              <p className="text-xs text-gray-500 mt-1">Reschedules deduped; ads excluded</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie: calls per utm_source (Recharts, hover tooltip) */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Calls by UTM Source (organic only)
                </h2>
              {pieData.length === 0 ? (
                <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
                  No organic calls in the selected period.
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius="70%"
                        label={({ name, percentage }) => `${name} ${percentage?.toFixed(0)}%`}
                        labelLine={true}
                      >
                        {pieData.map((item, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={item.name === 'null' ? '#9ca3af' : CHART_COLORS[index % CHART_COLORS.length]}
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<PieTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Line: organic leads per day (Recharts, hover tooltip) */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Organic Leads per Day (by book_date)
              </h2>
              {organicDaily.length === 0 ? (
                <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
                  No organic leads in the selected period.
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={organicDaily}
                      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={v => (v ? v.slice(5) : '')}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip content={<LineTooltip />} />
                      <LineLegend />
                      <Line
                        type="monotone"
                        dataKey="leads"
                        name="Leads"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#2563eb', r: 4 }}
                        activeDot={{ r: 6, fill: '#1d4ed8' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            </div>

            {/* Medium by source (Instagram, Facebook, TikTok, YouTube) - stacked bar */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Medium by source (Instagram, Facebook, TikTok, YouTube)
              </h2>
              {mediumBySource.length === 0 || mediumKeys.length === 0 ? (
                <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
                  No data for these sources in the selected period.
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mediumBySource}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 60, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="source" width={52} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload;
                          const total = row.total || 1;
                          const withValue = payload.filter(p => p.value > 0);
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                              <div className="font-medium text-gray-900 mb-1">{row.source}</div>
                              {withValue.map((p, i) => {
                                const colorIndex = mediumKeys.indexOf(p.name);
                                const color = colorIndex >= 0 ? CHART_COLORS[colorIndex % CHART_COLORS.length] : '#6b7280';
                                return (
                                  <div key={i} className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-2 text-gray-700">
                                      <span
                                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                        style={{ backgroundColor: color }}
                                      />
                                      {p.name}:
                                    </span>
                                    <span>{p.value} ({(p.value / total * 100).toFixed(1)}%)</span>
                                  </div>
                                );
                              })}
                              <div className="border-t mt-1 pt-1 text-gray-500">Total: {total}</div>
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      {mediumKeys.map((med, i) => (
                        <Bar
                          key={med}
                          dataKey={med}
                          name={med}
                          stackId="a"
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          radius={[0, 2, 2, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Conversion rate: platform or campaign (dropdown) */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Conversion rate (show-ups → purchases)
                </h2>
                <select
                  value={conversionChartMode}
                  onChange={e => setConversionChartMode(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="platform">By platform (utm_source)</option>
                  <option value="campaign">By campaign (utm_campaign)</option>
                </select>
              </div>
              {(() => {
                const data = conversionChartMode === 'platform' ? conversionByPlatform : conversionByCampaign;
                const label = conversionChartMode === 'platform' ? 'Platform' : 'Campaign';
                if (!data || data.length === 0) {
                  return (
                    <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
                      No conversion data in the selected period.
                    </div>
                  );
                }
                return (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data}
                        margin={{ top: 8, right: 16, left: 8, bottom: 60 }}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} unit="%" />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                                <div className="font-medium text-gray-900 mb-1">{d.fullName}</div>
                                <div className="text-gray-600">Show-ups: {d.showUps}</div>
                                <div className="text-gray-600">Purchases: {d.purchases}</div>
                                <div className="text-gray-700 font-medium mt-0.5">Conversion: {d.conversionRate?.toFixed(1)}%</div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="conversionRate"
                          name="Conversion %"
                          radius={[0, 2, 2, 0]}
                        >
                          {data.map((entry, index) => (
                            <Cell
                              key={index}
                              fill={entry.fullName === 'null' ? '#9ca3af' : '#14b8a6'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </div>

            {/* Campaign comparison - bar chart */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Campaigns (top 15, organic only)
              </h2>
              {campaignData.length === 0 ? (
                <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
                  No campaign data in the selected period.
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={campaignData}
                      margin={{ top: 8, right: 16, left: 8, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10 }}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        interval={0}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                              <div className="font-medium text-gray-900">{d.fullName}</div>
                              <div className="text-gray-600">{d.value} calls</div>
                              <div className="text-gray-500">{d.percentage?.toFixed(1)}%</div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="value"
                        name="Calls"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

