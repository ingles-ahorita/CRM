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
      <div className="text-[11px] text-slate-700">{label}</div>
      <div
        className={cx(
          "mt-1 text-2xl font-bold leading-none",
          valueClassName || "text-slate-900",
        )}
      >
        {value}
      </div>
      {children}
    </div>
  );
}

function parsePercent(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s.replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function pifRateClassFromPercent(pct) {
  if (!Number.isFinite(pct)) return "text-violet-600";
  if (pct < 20) return "text-rose-600";
  if (pct < 25) return "text-amber-600";
  if (pct < 30) return "text-emerald-600";
  return "text-emerald-700";
}

function pifRateFillFromPercent(pct) {
  // Tailwind equivalents:
  // rose-600 #E11D48, amber-600 #D97706, emerald-600 #059669, emerald-700 #047857
  if (!Number.isFinite(pct)) return "#4F46E5"; // indigo-600 fallback
  if (pct < 20) return "#E11D48";
  if (pct < 25) return "#D97706";
  if (pct < 30) return "#059669";
  return "#047857";
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
    // Recharts needs actual color values (not Tailwind class names)
    // Color each bar based on the PIF % thresholds:
    // <20 bad (red), 20-25 ok (yellow), 25-30 good (green), 30+ amazing (dark green)
    return (pifBars || []).map((b) => {
      const pct = Math.round(Math.max(0, Math.min(1, Number(b) || 0)) * 1000) / 10;
      return pifRateFillFromPercent(pct);
    });
  }, [pifBars]);

  if (loading) return <CloserHistoricPerformanceShimmer />;

  const avgPifPct = parsePercent(avgPifRate);

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
        <MetricBlock label="Avg Closing Rate" value={avgClosingRate} valueClassName="text-black">
          <MiniBars bars={closingBars} colors={closingColors} labels={labels} />
        </MetricBlock>

        <MetricBlock
          label="Avg PIF Rate"
          value={avgPifRate}
          valueClassName={pifRateClassFromPercent(avgPifPct)}
        >
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

