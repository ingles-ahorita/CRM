import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import * as DateHelpers from '../utils/dateHelpers';

// Simple color palette for charts
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

// Helper to determine if a source_type is ads
function isAdsSource(sourceType) {
  if (!sourceType) return false;
  const lower = sourceType.toLowerCase();
  return lower.includes('ad') || lower.includes('ads');
}

// Core fetcher for the new UTM analytics view
async function fetchUTMAnalytics(startDate, endDate) {
  // We keep start/end as ISO strings (UTC) and use them directly in Supabase filters

  const { data: calls, error } = await supabase
    .from('calls')
    .select(`
      id,
      book_date,
      call_date,
      source_type,
      utm_source,
      utm_medium,
      utm_campaign,
      is_reschedule,
      lead_id
    `)
    .gte('call_date', startDate)
    .lte('call_date', endDate);

  if (error) {
    console.error('Error fetching UTM calls:', error);
    return { pieData: [], organicDaily: [] };
  }

  const allCalls = calls || [];

  // --- Reschedule deduplication (same logic style as generalStats / closerStats) ---
  const rescheduledLeadIds = new Set(
    allCalls.filter(c => c.is_reschedule === true).map(c => c.lead_id)
  );

  const dedupedCalls = allCalls.filter(call => {
    const keepReschedule =
      call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id);
    return keepReschedule;
  });

  // --- Pie: percentage of calls per utm_source (all calls in range, deduped) ---
  const sourceCounts = {};
  dedupedCalls.forEach(call => {
    const src = call.utm_source || 'Unknown';
    if (!sourceCounts[src]) {
      sourceCounts[src] = 0;
    }
    sourceCounts[src] += 1;
  });

  const totalCalls = Object.values(sourceCounts).reduce(
    (sum, v) => sum + v,
    0
  );

  const pieData = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      source,
      count,
      percentage: totalCalls > 0 ? (count / totalCalls) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // --- Line: organic leads per day (by book_date, non-ads only) ---
  const organicDailyMap = {};

  dedupedCalls.forEach(call => {
    if (!call.book_date) return;
    if (isAdsSource(call.source_type)) return;

    const d = new Date(call.book_date);
    // Normalize to UTC date string YYYY-MM-DD
    const dayKey = d.toISOString().slice(0, 10);

    if (!organicDailyMap[dayKey]) {
      organicDailyMap[dayKey] = 0;
    }
    organicDailyMap[dayKey] += 1;
  });

  const organicDaily = Object.entries(organicDailyMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { pieData, organicDaily };
}

// Build conic-gradient CSS string for pie chart
function buildPieGradient(pieData) {
  if (!pieData || pieData.length === 0) return 'conic-gradient(#e5e7eb 0 100%)';

  let current = 0;
  const segments = [];

  pieData.forEach((item, index) => {
    const color = CHART_COLORS[index % CHART_COLORS.length];
    const next = current + item.percentage;
    segments.push(`${color} ${current}% ${next}%`);
    current = next;
  });

  // In case of rounding issues, fill the rest with gray
  if (current < 100) {
    segments.push(`#e5e7eb ${current}% 100%`);
  }

  return `conic-gradient(${segments.join(', ')})`;
}

// Simple SVG line chart for organic daily leads
function OrganicLineChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No organic leads in the selected period.
      </div>
    );
  }

  const width = 400;
  const height = 200;
  const padding = 30;

  const maxY = Math.max(...data.map(d => d.count));
  const minY = 0;

  const xStep =
    data.length > 1
      ? (width - padding * 2) / (data.length - 1)
      : 0;

  const points = data.map((d, i) => {
    const x = padding + i * xStep;
    const y =
      height -
      padding -
      (maxY === minY
        ? 0
        : ((d.count - minY) / (maxY - minY)) * (height - padding * 2));
    return { x, y, ...d };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-64 bg-white rounded-lg border border-gray-200"
    >
      {/* Axes */}
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke="#e5e7eb"
        strokeWidth="1"
      />
      <line
        x1={padding}
        y1={padding}
        x2={padding}
        y2={height - padding}
        stroke="#e5e7eb"
        strokeWidth="1"
      />

      {/* Line */}
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        points={polylinePoints}
      />

      {/* Points */}
      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r={3}
          fill="#1d4ed8"
        />
      ))}

      {/* Y-axis label (max) */}
      <text
        x={padding - 6}
        y={padding + 4}
        textAnchor="end"
        fontSize="10"
        fill="#6b7280"
      >
        {maxY}
      </text>

      {/* X-axis labels (first & last date) */}
      <text
        x={padding}
        y={height - padding + 14}
        textAnchor="start"
        fontSize="10"
        fill="#6b7280"
      >
        {points[0].date}
      </text>
      {points.length > 1 && (
        <text
          x={width - padding}
          y={height - padding + 14}
          textAnchor="end"
          fontSize="10"
          fill="#6b7280"
        >
          {points[points.length - 1].date}
        </text>
      )}
    </svg>
  );
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
  const [loading, setLoading] = useState(false);

  const loadAnalytics = async (s, e) => {
    setLoading(true);
    const result = await fetchUTMAnalytics(s, e);
    setPieData(result.pieData);
    setOrganicDaily(result.organicDaily);
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

  const pieGradient = buildPieGradient(pieData);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            UTM Analytics (New)
          </h1>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Back
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date (UTC)
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
                End Date (UTC)
              </label>
              <input
                type="date"
                value={endDate.slice(0, 10)}
                onChange={e => handleDateChange('end', e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="text-xs text-gray-500">
              Showing data from{' '}
              <span className="font-mono">{startDate}</span> to{' '}
              <span className="font-mono">{endDate}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            Loading analytics...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie chart: percentage of calls per utm_source */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Calls by UTM Source (% of calls)
              </h2>
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex justify-center md:w-1/2">
                  <div
                    className="w-40 h-40 rounded-full"
                    style={{ backgroundImage: pieGradient }}
                  />
                </div>
                <div className="md:w-1/2">
                  {pieData.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      No calls in the selected period.
                    </div>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {pieData.map((item, index) => (
                        <li
                          key={item.source}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-sm"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[index % CHART_COLORS.length],
                              }}
                            />
                            <span className="text-gray-700">
                              {item.source}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500">
                              {item.count} calls
                            </span>
                            <span className="font-medium text-gray-900">
                              {item.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Line chart: organic leads per day */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Organic Leads per Day (by book_date)
              </h2>
              <OrganicLineChart data={organicDaily} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

