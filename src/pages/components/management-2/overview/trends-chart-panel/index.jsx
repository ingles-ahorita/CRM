import React, { useEffect, useMemo, useState } from "react";
import SegmentedTabs from "../../segmented-tabs";
import SectionInfoHint from "../section-info-hint";
import {
  TIME_RANGE_ITEMS,
  getRangeBounds,
  getEffectiveRangeBounds,
  toManagementSeriesDateParams,
} from "../overview-range-helpers";
import { BENCHMARKS, getShowUpColor, getSuccessColor, getConversionColor } from "../../../../../utils/performanceBenchmarks";
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
} from "recharts";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function shimmer(className = "") {
  return (
    <div
      className={cx("animate-pulse rounded-md bg-slate-200/70", className)}
    />
  );
}

const METRIC_OPTIONS = [
  { id: "showUpRate", label: "Show up rate (%)" },
  { id: "purchaseRate", label: "Success rate (%)" },
  { id: "conversionRate", label: "Conversion rate (%)" },
  { id: "bookings", label: "Bookings" },
  { id: "calls", label: "Show ups" },
];

const selectClass =
  "h-8 max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 pr-7 text-[11px] font-semibold text-slate-700 shadow-sm !outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

/**
 * Mirrors `/management` dashboard chart: same API, metrics, targets, split, tooltips, and styling.
 */
export default function TrendsChartPanel() {
  const customFallback = useMemo(() => getRangeBounds("custom"), []);
  const [chartSeries, setChartSeries] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState("showUpRate");
  const [chartSplitBySource, setChartSplitBySource] = useState(false);
  const [range, setRange] = useState("mtd");
  const [customStart, setCustomStart] = useState(() =>
    customFallback.start.toISOString().slice(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    customFallback.end.toISOString().slice(0, 10),
  );
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setChartLoading(true);
      setErrorMsg("");
      if (range === "custom" && customStart > customEnd) {
        if (!cancelled) {
          setChartSeries([]);
          setErrorMsg("Start date must be on or before end date.");
          setChartLoading(false);
        }
        return;
      }
      const { start, end } = getEffectiveRangeBounds(
        range,
        customStart,
        customEnd,
      );
      const { startDate, endDate } = toManagementSeriesDateParams(start, end);
      const url = `/api/management-series?${new URLSearchParams({
        startDate,
        endDate,
      }).toString()}`;
      try {
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.error || `API failed (${res.status})`);
        }
        setChartSeries(Array.isArray(data.series) ? data.series : []);
      } catch (e) {
        if (!cancelled) {
          setChartSeries([]);
          setErrorMsg(e?.message || "Failed to load trends");
        }
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range, customStart, customEnd]);

  const chartData = useMemo(
    () =>
      chartSeries.map((d) => {
        const bookings = d.bookings ?? 0;
        const purchased = d.totalPurchased ?? 0;
        const showed = d.totalShowedUp ?? 0;
        const purchaseRate =
          bookings > 0 ? clampPercent((purchased / bookings) * 100) : null;
        const conversionRateClosers =
          showed > 0 ? clampPercent((purchased / showed) * 100) : null;
        const value =
          chartMetric === "showUpRate"
            ? clampPercent(d.showUpRate)
            : chartMetric === "purchaseRate"
              ? purchaseRate
              : chartMetric === "conversionRate"
                ? conversionRateClosers
                : chartMetric === "bookings"
                  ? d.bookings
                  : (d.totalShowedUp ?? 0);
        const target =
          chartMetric === "showUpRate"
            ? BENCHMARKS.SHOW_UP
            : chartMetric === "purchaseRate"
              ? BENCHMARKS.SUCCESS
              : chartMetric === "conversionRate"
                ? BENCHMARKS.CONVERSION
                : null;
        const isPercentMetricWithTarget =
          target != null &&
          (chartMetric === "showUpRate" ||
            chartMetric === "purchaseRate" ||
            chartMetric === "conversionRate");
        const numValue = typeof value === "number" ? value : 0;
        const color =
          chartMetric === "showUpRate"
            ? getShowUpColor(numValue)
            : chartMetric === "purchaseRate"
              ? getSuccessColor(numValue)
              : chartMetric === "conversionRate"
                ? getConversionColor(numValue)
                : "#6366f1";
        return {
          ...d,
          label: d.date?.slice(5) ?? d.date,
          value,
          color,
          valueOrganic: clampPercent(d.showUpRateOrganic),
          valueAds: clampPercent(d.showUpRateAds),
        };
      }),
    [chartSeries, chartMetric],
  );

  const yDomain = useMemo(() => {
    if (chartMetric === "showUpRate" || chartMetric === "conversionRate")
      return [0, 100];
    if (chartMetric === "purchaseRate") return [0, 30];
    return [0, "auto"];
  }, [chartMetric]);

  return (
    <div className="border border-slate-200 rounded-2xl p-2 bg-white">
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-[18px] font-bold tracking-tight text-[#333333]">
            Trends chart panel
          </h2>
          <SectionInfoHint text="Day-by-day trend for one metric you choose—spot rises or dips over the selected period." />
        </div>
      </div>

      <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          <SegmentedTabs
            items={TIME_RANGE_ITEMS}
            activeId={range}
            onChange={setRange}
            size="xs"
            className="w-max border-slate-200/90 bg-slate-100/80"
            activeClassName="!bg-sky-100 !text-blue-700 !ring-sky-200/80"
          />
        </div>

        <label className="sr-only" htmlFor="trends-metric">
          Metric
        </label>
        <select
          id="trends-metric"
          className={cx(selectClass, "min-w-[10.5rem] flex-1 sm:max-w-[14rem]")}
          value={chartMetric}
          onChange={(e) => setChartMetric(e.target.value)}
        >
          {METRIC_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>

        {chartMetric === "showUpRate" ? (
          <>
            <label className="sr-only" htmlFor="trends-showup-split">
              Show-up breakdown
            </label>
            <select
              id="trends-showup-split"
              className={cx(selectClass, "min-w-[11rem] flex-1 sm:max-w-[15rem]")}
              value={chartSplitBySource ? "split" : "combined"}
              onChange={(e) =>
                setChartSplitBySource(e.target.value === "split")
              }
            >
              <option value="combined">Combined show-up rate</option>
              <option value="split">Split by organic / ads</option>
            </select>
          </>
        ) : null}
        </div>

        {range === "custom" ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
            <label className="sr-only" htmlFor="trends-custom-start">
              Custom range start
            </label>
            <input
              id="trends-custom-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none sm:flex-initial sm:min-w-[9.5rem]"
            />
            <span className="text-[10px] font-semibold text-slate-500">–</span>
            <label className="sr-only" htmlFor="trends-custom-end">
              Custom range end
            </label>
            <input
              id="trends-custom-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none sm:flex-initial sm:min-w-[9.5rem]"
            />
          </div>
        ) : null}
      </div>

      {errorMsg ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          {errorMsg}
        </div>
      ) : null}

      <div
        className="relative w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white"
        style={{ height: 200, minHeight: 180 }}
      >
        {chartLoading ? (
          <div className="flex h-full flex-col gap-3 p-4">
            {shimmer("h-4 w-3/4 max-w-md")}
            {shimmer("h-full w-full flex-1 rounded-lg")}
          </div>
        ) : !chartSeries.length ? (
          <div className="flex h-full items-center justify-center text-[13px] font-medium text-slate-400">
            No data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                vertical={false}
              />
              {chartMetric === "showUpRate" && (
                <ReferenceLine
                  y={BENCHMARKS.SHOW_UP}
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `Target ${BENCHMARKS.SHOW_UP}%`,
                    position: "right",
                    fill: "#22c55e",
                    fontSize: 11,
                  }}
                />
              )}
              {chartMetric === "purchaseRate" && (
                <ReferenceLine
                  y={BENCHMARKS.SUCCESS}
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `Target ${BENCHMARKS.SUCCESS}%`,
                    position: "right",
                    fill: "#22c55e",
                    fontSize: 11,
                  }}
                />
              )}
              {chartMetric === "conversionRate" && (
                <ReferenceLine
                  y={BENCHMARKS.CONVERSION}
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `Target ${BENCHMARKS.CONVERSION}%`,
                    position: "right",
                    fill: "#22c55e",
                    fontSize: 11,
                  }}
                />
              )}
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={
                  chartMetric === "showUpRate" ||
                  chartMetric === "purchaseRate" ||
                  chartMetric === "conversionRate"
                    ? (v) => `${v}%`
                    : (v) => v
                }
                domain={yDomain}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const raw = payload[0]?.payload;
                  const isBookings = chartMetric === "bookings";
                  const isShowUpSplit =
                    chartMetric === "showUpRate" && chartSplitBySource;
                  const isPurchaseRate = chartMetric === "purchaseRate";
                  const isConversionRate = chartMetric === "conversionRate";
                  const isShowUps = chartMetric === "calls";
                  const v =
                    chartMetric === "showUpRate"
                      ? raw?.showUpRate != null
                        ? `${Number(raw.showUpRate).toFixed(1)}%`
                        : "—"
                      : isPurchaseRate || isConversionRate
                        ? raw?.value != null
                          ? `${Number(raw.value).toFixed(1)}%`
                          : "—"
                        : isBookings
                          ? raw?.bookings
                          : isShowUps
                            ? (raw?.totalShowedUp ?? 0)
                            : raw?.calls;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] shadow-lg">
                      <div className="mb-1.5 text-slate-500">
                        {raw?.date ?? raw?.label}
                      </div>
                      {isBookings ? (
                        <>
                          <div className="flex flex-col gap-0.5 text-[13px]">
                            <div className="text-orange-500">
                              Organic: {raw?.bookingsOrganic ?? 0}
                            </div>
                            <div className="text-blue-500">
                              Ads: {raw?.bookingsAds ?? 0}
                            </div>
                            <div className="text-amber-500">
                              Rescheduled: {raw?.bookingsRescheduled ?? 0}
                            </div>
                          </div>
                          <div className="mt-1.5 border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                            Total: {v}
                          </div>
                        </>
                      ) : isShowUpSplit ? (
                        <>
                          <div className="text-orange-500">
                            Organic:{" "}
                            {raw?.valueOrganic != null
                              ? `${Number(raw.valueOrganic).toFixed(1)}%`
                              : "—"}
                          </div>
                          <div className="text-blue-500">
                            Ads:{" "}
                            {raw?.valueAds != null
                              ? `${Number(raw.valueAds).toFixed(1)}%`
                              : "—"}
                          </div>
                          <div className="mt-1 border-t border-slate-200 pt-1 font-semibold text-slate-900">
                            Total: {v}
                          </div>
                          <div className="mt-1 text-[12px] text-slate-500">
                            {raw?.totalShowedUp ?? 0} /{" "}
                            {raw?.totalConfirmed ?? 0} confirmed
                          </div>
                        </>
                      ) : isPurchaseRate ? (
                        <>
                          <div className="font-semibold text-slate-900">
                            {v}
                          </div>
                          <div className="mt-1 text-[12px] text-slate-500">
                            {raw?.totalPurchased ?? 0} / {raw?.bookings ?? 0}{" "}
                            booked
                          </div>
                        </>
                      ) : isConversionRate ? (
                        <>
                          <div className="font-semibold text-slate-900">
                            {v}
                          </div>
                          <div className="mt-1 text-[12px] text-slate-500">
                            {raw?.totalPurchased ?? 0} /{" "}
                            {raw?.totalShowedUp ?? 0} showed up
                          </div>
                        </>
                      ) : chartMetric === "showUpRate" ? (
                        <>
                          <div className="font-semibold text-slate-900">
                            {v}
                          </div>
                          <div className="mt-1 text-[12px] text-slate-500">
                            {raw?.totalShowedUp ?? 0} /{" "}
                            {raw?.totalConfirmed ?? 0} confirmed
                          </div>
                        </>
                      ) : isShowUps ? (
                        <>
                          <div className="font-semibold text-slate-900">
                            {v}
                          </div>
                          <div className="mt-1 text-[12px] text-slate-500">
                            {raw?.totalShowedUp ?? 0} /{" "}
                            {raw?.totalConfirmed ?? 0} confirmed
                          </div>
                        </>
                      ) : (
                        <div className="font-semibold text-slate-900">{v}</div>
                      )}
                    </div>
                  );
                }}
              />
              {chartMetric === "showUpRate" && chartSplitBySource ? (
                <>
                  <Line
                    type="linear"
                    dataKey="valueOrganic"
                    name="Organic"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ fill: "#f97316", r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    isAnimationActive
                  />
                  <Line
                    type="linear"
                    dataKey="valueAds"
                    name="Ads"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    isAnimationActive
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </>
              ) : chartMetric === "showUpRate" ||
                chartMetric === "purchaseRate" ||
                chartMetric === "conversionRate" ? (
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (payload?.value == null) return null;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={payload?.color || "#6366f1"}
                      />
                    );
                  }}
                  activeDot={(props) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={payload?.color || "#818cf8"}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }}
                  connectNulls={false}
                  isAnimationActive
                />
              ) : (
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ fill: "#6366f1", strokeWidth: 0, r: 4 }}
                  activeDot={{
                    r: 6,
                    fill: "#818cf8",
                    stroke: "#fff",
                    strokeWidth: 2,
                  }}
                  connectNulls={false}
                  isAnimationActive
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
