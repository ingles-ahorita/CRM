import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  LT_TREND_KEYS,
  buildLtTrend,
  buildInsights,
} from './potentialLeadSegments.js';
import { LT_STATUS } from '../../../../../lib/potentialLeadLtStatus.js';

// LT1 is hidden completely on this page, so it gets no chart series / toggle.
const TREND_KEYS = LT_TREND_KEYS.filter((k) => k.key !== 'lt1');

// In-card filter for the Converted KPI — split the LT4/LT5 "booked" bucket.
const CONVERTED_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'lt4', label: 'LT4' },
  { key: 'lt5', label: 'LT5' },
];

function shimmer(className = '') {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

function KpiCard({ label, value, sub, tooltip, valueClass = 'text-slate-900', children }) {
  return (
    <div className="relative flex flex-col justify-center rounded-lg border border-slate-200 bg-white px-3 py-2">
      {tooltip && (
        <div className="group absolute right-2.5 top-2.5">
          <Info size={13} className="cursor-help text-slate-400 transition hover:text-slate-600" />
          <div className="pointer-events-none absolute right-0 top-5 z-30 w-56 origin-top-right scale-95 rounded-lg border border-slate-200 bg-white p-2 text-[10px] leading-normal text-slate-600 shadow-md transition-all duration-150 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
            {tooltip}
          </div>
        </div>
      )}
      <div className={`text-[20px] font-bold leading-none ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[12px] font-medium text-slate-700">{label}</div>
      <div className="text-[11px] leading-tight text-slate-400">{sub}</div>
      {children}
    </div>
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const label = payload[0]?.payload?.label ?? '';
  const items = payload.filter((p) => Number(p.value) > 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg">
      <div className="mb-1.5 font-semibold text-slate-900">{label}</div>
      {items.length === 0 ? (
        <div className="text-slate-400">No leads</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((p) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-3 text-slate-700">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
              <span className="font-semibold tabular-nums">{p.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PotentialLeadsInsightsShimmer() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            {shimmer('mb-1.5 h-5 w-12')}
            {shimmer('mb-1 h-3 w-20')}
            {shimmer('h-2.5 w-14')}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100" />
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {shimmer('h-3 w-48')}
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`trend-chip-${i}`} className="h-6 w-12 animate-pulse rounded-lg bg-slate-200/70" />
            ))}
          </div>
        </div>
        {shimmer('h-[150px] w-full rounded-lg')}
      </div>
    </div>
  );
}

export default function PotentialLeadsInsights({ rows, convertedRows, ltForRow, isUnassigned, loading, dateBounds }) {
  const unassignedFn = useMemo(
    () => isUnassigned || ((r) => !r.assigned_setter_id),
    [isUnassigned],
  );
  const insights = useMemo(() => buildInsights(rows, ltForRow), [rows, ltForRow]);
  const trend = useMemo(
    () => buildLtTrend(rows, ltForRow, dateBounds?.start, dateBounds?.end, unassignedFn),
    [rows, ltForRow, dateBounds, unassignedFn],
  );
  const unassignedCount = useMemo(
    () => (rows || []).filter(unassignedFn).length,
    [rows, unassignedFn],
  );
  const received = rows?.length ?? 0;
  // Split the booked (LT4/LT5) bucket so the Converted card can filter by stage.
  // Sourced from convertedRows (booked leads live outside the Potential/Qualified
  // set that feeds `rows`); fall back to `rows` if the prop is absent.
  const convertedCounts = useMemo(() => {
    let lt4 = 0;
    let lt5 = 0;
    (convertedRows || rows || []).forEach((r) => {
      const lt = ltForRow(r);
      if (lt === LT_STATUS.LT4) lt4 += 1;
      else if (lt === LT_STATUS.LT5) lt5 += 1;
    });
    return { lt4, lt5, all: lt4 + lt5 };
  }, [convertedRows, rows, ltForRow]);
  const [convertedFilter, setConvertedFilter] = useState('all');
  const convertedValue = convertedCounts[convertedFilter] ?? convertedCounts.all;
  const convertedRate = received > 0 ? Math.round((convertedValue / received) * 100) : 0;
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set());

  const visibleTrendKeys = TREND_KEYS.filter((k) => !hiddenKeys.has(k.key));
  const allVisible = hiddenKeys.size === 0;
  const tickStep = Math.max(1, Math.ceil(trend.series.length / 7));

  const toggleTrendKey = (key) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const showAllTrend = () => setHiddenKeys(new Set());

  if (loading) {
    return <PotentialLeadsInsightsShimmer />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI cards — full width on top */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Received"
          value={rows?.length ?? 0}
          sub="leads in scope"
          tooltip="Total number of leads received within the selected date range and filtered scope."
        />
        <KpiCard
          label="Converted"
          value={convertedValue}
          sub={`${convertedRate}% of received`}
          valueClass="text-emerald-600"
          tooltip={`Potential leads that became leads — i.e. booked a call (pipeline stage LT4 'Call booked' or LT5 'Booked & confirmed'). Filter by stage below. LT4: ${convertedCounts.lt4} · LT5: ${convertedCounts.lt5}. Rate = Converted ÷ Received within the current scope.`}
        >
          <div className="mt-1.5 flex gap-1">
            {CONVERTED_FILTERS.map((f) => {
              const active = convertedFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setConvertedFilter(f.key)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset transition ${
                    active
                      ? 'bg-emerald-600 text-white ring-emerald-600'
                      : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </KpiCard>
        <KpiCard
          label="Uncontacted"
          value={insights.uncontacted}
          sub="unworked backlog"
          valueClass="text-red-600"
          tooltip="Leads that have not been contacted yet and are not booked. These are in the active backlog (pipeline stages LT1-LT3 or other) waiting to be worked."
        />
        <KpiCard
          label="Contacted"
          value={insights.counts.contacted}
          sub="follow-ups pending"
          valueClass="text-indigo-600"
          tooltip="Leads that have at least one logged contact attempt but are not booked yet. This indicates ongoing follow-ups."
        />
        <KpiCard
          label="Contact rate"
          value={`${insights.contactRate}%`}
          sub="of received"
          valueClass="text-teal-600"
          tooltip="Percentage of received leads that have been contacted (booked calls excluded). Calculated as: Contacted ÷ Total Received."
        />
        <KpiCard
          label="Unassigned"
          value={unassignedCount}
          sub="needs a setter"
          valueClass="text-amber-600"
          tooltip="Leads in scope with no setter assigned yet. Assign a setter so they get worked."
        />
      </div>

      <div className="border-t border-slate-100" />

      {/* Distribution chart — full width */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="text-[12px] font-medium text-slate-500">Distribution by stage</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={showAllTrend}
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset transition ${
                allVisible
                  ? 'bg-slate-800 text-white ring-slate-800'
                  : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            {TREND_KEYS.map((k) => {
              const active = !hiddenKeys.has(k.key);
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => toggleTrendKey(k.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset transition ${
                    active
                      ? 'bg-white text-slate-700 ring-slate-200'
                      : 'bg-white text-slate-400 line-through opacity-60 ring-slate-200'
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: active ? k.color : '#cbd5e1' }}
                  />
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="h-[150px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend.series} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
                tickFormatter={(val, i) => {
                  if (i !== 0 && i !== trend.series.length - 1 && i % tickStep !== 0) return '';
                  return new Date(`${val}T00:00:00.000Z`).toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    timeZone: 'UTC',
                  });
                }}
                tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }}
                height={22}
              />
              <YAxis
                allowDecimals={false}
                width={28}
                domain={[0, 'dataMax + 1']}
                tick={{ fill: '#94A3B8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
              {visibleTrendKeys.map((k) => (
                <Line
                  key={k.key}
                  type="monotone"
                  dataKey={k.key}
                  name={k.label}
                  stroke={k.color}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 1, stroke: '#fff', fill: k.color }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: k.color }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
