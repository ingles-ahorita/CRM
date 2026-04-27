import React, { useMemo, useState } from "react";
import CloserHistoricPerformanceShimmer from "../../../shimmers/closer-body/closer-historic-performance";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function shiftMonth(date, deltaMonths) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + deltaMonths);
  return d;
}

function monthLabelShort(date) {
  return date.toLocaleString(undefined, { month: "short" });
}

function getRangeMonths(rangeKey) {
  // "All time" needs a compact view here; show last 12 months.
  const count = rangeKey === "3mo" ? 3 : rangeKey === "6mo" ? 6 : 12;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(shiftMonth(base, -i));
  }
  return months;
}

function RangeTabs({ value, onChange }) {
  const options = useMemo(
    () => [
      { value: "3mo", label: "3 mo" },
      { value: "6mo", label: "6 mo" },
      { value: "all", label: "All time" },
    ],
    [],
  );

  return (
    <div className="inline-flex rounded-lg bg-slate-100/80 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cx(
              "px-2.5 py-1 text-[11px] font-semibold rounded-md transition !outline-none",
              active
                ? "bg-white text-indigo-600 shadow-[0_1px_2px_rgba(15,23,42,0.10)]"
                : "text-slate-500 hover:text-slate-700 bg-slate-100/80",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MiniBars({ bars, colors, labels, valueSuffix = "%" }) {
  const data = useMemo(() => {
    return (labels || []).map((m, idx) => ({
      month: m,
      // bars are normalized (0..1). convert to 0..100 for tooltip readability.
      value: Math.round(Math.max(0, Math.min(1, bars?.[idx] ?? 0)) * 100),
      fill: colors?.[idx],
    }));
  }, [bars, colors, labels]);

  return (
    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
      <div className="h-12">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
            <XAxis dataKey="month" hide />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
                    <div className="text-[11px] font-semibold text-slate-900">
                      {p.month}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {p.value}
                      {valueSuffix}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 6, 6]} maxBarSize={28}>
              {data.map((entry, idx) => (
                <Cell
                  key={`c-${idx}`}
                  fill={entry.fill || "#6366F1"}
                  stroke="rgba(15,23,42,0.08)"
                  strokeWidth={1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {labels?.length ? (
        <div className="mt-2 flex items-center gap-2">
          {labels.map((m, idx) => (
            <div
              key={`m-${idx}`}
              className="flex-1 min-w-0 text-center text-[10px] font-semibold text-slate-400"
            >
              {m}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricBlock({ label, value, valueClassName, children }) {
  return (
    <div className="flex flex-col">
      <div className="text-[11px] !text-black">{label}</div>
      <div className={cx("mt-1 text-2xl font-bold leading-none !text-black", valueClassName)}>
        {value}
      </div>
      {children}
    </div>
  );
}

export default function CloserHistoricPerformance({
  loading = false,
  defaultRange = "6mo",
  range: controlledRange,
  onRangeChange,
  avgClosingRate = "—",
  avgPifRate = "—",
  bestMonthValue = "—",
  bestMonthSubtext = "—",
  bestMonthHint = "",
  closingBars: controlledClosingBars,
  pifBars: controlledPifBars,
  labels: controlledLabels,
}) {
  const [range, setRange] = useState(defaultRange);
  const effectiveRange = controlledRange ?? range;

  const months = useMemo(() => getRangeMonths(effectiveRange), [effectiveRange]);
  const fallbackLabels = useMemo(() => months.map(monthLabelShort), [months]);
  const labels = controlledLabels?.length ? controlledLabels : fallbackLabels;

  const closingBars = useMemo(() => {
    if (controlledClosingBars?.length) return controlledClosingBars;
    const baseHeights = [0.55, 0.75, 0.6, 0.85, 0.4, 0.4, 0.55, 0.7, 0.5, 0.62, 0.48, 0.58];
    return labels.map((_, i) => baseHeights[i % baseHeights.length]);
  }, [controlledClosingBars, labels]);
  const closingColors = useMemo(() => {
    const cutoff = Math.ceil(labels.length * 0.65);
    // Recharts needs actual color values (not Tailwind class names)
    return labels.map((_, i) => (i < cutoff ? "#059669" : "#4F46E5")); // emerald-600 / indigo-600
  }, [labels]);

  const pifBars = useMemo(() => {
    if (controlledPifBars?.length) return controlledPifBars;
    const baseHeights = [0.55, 0.75, 0.6, 0.72, 0.4, 0.4, 0.62, 0.68, 0.52, 0.6, 0.44, 0.56];
    return labels.map((_, i) => baseHeights[i % baseHeights.length]);
  }, [controlledPifBars, labels]);
  const pifColors = useMemo(() => {
    const cutoff = Math.ceil(labels.length * 0.65);
    // Recharts needs actual color values (not Tailwind class names)
    return labels.map((_, i) => (i < cutoff ? "#F97316" : "#4F46E5")); // orange-500 / indigo-600
  }, [labels]);

  if (loading) return <CloserHistoricPerformanceShimmer />;

  return (
    <div className="w-full rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="text-[11px] font-bold tracking-wide text-slate-500">
          HISTORIC PERFORMANCE
        </div>
        <RangeTabs
          value={effectiveRange}
          onChange={(v) => {
            setRange(v);
            onRangeChange?.(v);
          }}
        />
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MetricBlock label="Avg Closing Rate" value={avgClosingRate} valueClassName="text-violet-600">
          <MiniBars bars={closingBars} colors={closingColors} labels={labels} />
        </MetricBlock>

        <MetricBlock label="Avg PIF Rate" value={avgPifRate} valueClassName="text-violet-600">
          <MiniBars bars={pifBars} colors={pifColors} labels={labels} />
        </MetricBlock>

        <div className="flex flex-col">
          <div className="text-[11px] text-slate-500">Best Month</div>
          <div className="mt-1 text-2xl font-bold leading-none !text-black">
            {bestMonthValue}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">{bestMonthSubtext}</div>
          {/* <div className="mt-3 text-[11px] font-semibold !text-black flex items-center gap-1">
            <span className="!text-black">↑</span>
            <span>{bestMonthHint || "You can beat this!"}</span>
            
          </div> */}
        </div>
      </div>
    </div>
  );
}

