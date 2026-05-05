import React, { useEffect, useMemo, useState } from "react";
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

function shimmer(className = "") {
  return (
    <div
      className={cx("animate-pulse rounded-md bg-slate-200/70", className)}
    />
  );
}

/**
 * Mirrors `/management` dashboard chart: same API, metrics, targets, split, tooltips, and styling.
 */
export default function TrendsChartPanel() {
  const [chartSeries, setChartSeries] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState("showUpRate");
  const [chartSplitBySource, setChartSplitBySource] = useState(false);
  const [chartDays, setChartDays] = useState(90);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setChartLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/management-series?days=${chartDays}`);
        if (!res.ok) throw new Error(`API failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
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
  }, [chartDays]);

  const chartData = useMemo(
    () =>
      chartSeries.map((d) => {
        const bookings = d.bookings ?? 0;
        const purchased = d.totalPurchased ?? 0;
        const showed = d.totalShowedUp ?? 0;
        const purchaseRate = bookings > 0 ? (purchased / bookings) * 100 : 0;
        const conversionRateClosers =
          showed > 0 ? (purchased / showed) * 100 : 0;
        const value =
          chartMetric === "showUpRate"
            ? (d.showUpRate ?? 0)
            : chartMetric === "purchaseRate"
              ? purchaseRate
              : chartMetric === "conversionRate"
                ? conversionRateClosers
                : chartMetric === "bookings"
                  ? d.bookings
                  : (d.totalShowedUp ?? 0);
        const target =
          chartMetric === "showUpRate"
            ? 55
            : chartMetric === "purchaseRate"
              ? 10
              : chartMetric === "conversionRate"
                ? 30
                : null;
        const isPercentMetricWithTarget =
          target != null &&
          (chartMetric === "showUpRate" ||
            chartMetric === "purchaseRate" ||
            chartMetric === "conversionRate");
        const numValue = typeof value === "number" ? value : 0;
        const belowTarget = isPercentMetricWithTarget && numValue < target;
        return {
          ...d,
          label: d.date?.slice(5) ?? d.date,
          value,
          belowTarget,
          valueOrganic:
            typeof d.showUpRateOrganic === "number" ? d.showUpRateOrganic : 0,
          valueAds: typeof d.showUpRateAds === "number" ? d.showUpRateAds : 0,
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

  const PERIOD_OPTIONS = [
    { id: 7, label: "Last 7 days" },
    { id: 14, label: "Last 14 days" },
    { id: 30, label: "Last 30 days" },
    { id: 90, label: "Last 90 days" },
  ];

  const METRIC_OPTIONS = [
    { id: "showUpRate", label: "Show up rate (%)" },
    { id: "purchaseRate", label: "Success rate (%)" },
    { id: "conversionRate", label: "Conversion rate (%)" },
    { id: "bookings", label: "Bookings" },
    { id: "calls", label: "Show ups" },
  ];

  return (
    <div className="border border-slate-200 rounded-2xl p-2 bg-white">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[18px] font-bold tracking-tight text-[#333333]">
            Trends chart panel
          </h2>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2">
          <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/60 p-1">
            {METRIC_OPTIONS.map((opt) => {
              const active = chartMetric === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChartMetric(opt.id)}
                  className={cx(
                    "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-inset transition !outline-none",
                    active
                      ? "bg-sky-100 text-blue-700 ring-sky-200"
                      : "bg-white text-slate-500 ring-slate-200/90 hover:bg-slate-50",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <div className={`flex items-center ${chartMetric === "showUpRate" ? "justify-between" : "justify-end"} gap-2 w-full`}>
            {chartMetric === "showUpRate" && (
              <button
                type="button"
                onClick={() => setChartSplitBySource((v) => !v)}
                className={cx(
                  "h-9 shrink-0 rounded-md border px-3 text-[12px] font-medium transition-colors",
                  chartSplitBySource
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-slate-200 bg-[#f9fafb] text-slate-700 hover:bg-slate-100",
                )}
              >
                Split by organic/ads
              </button>
            )}
            <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/60 p-1">
              {PERIOD_OPTIONS.map((opt) => {
                const active = Number(chartDays) === Number(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setChartDays(opt.id)}
                    className={cx(
                      "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-inset transition !outline-none",
                      active
                        ? "bg-sky-100 text-blue-700 ring-sky-200"
                        : "bg-white text-slate-500 ring-slate-200/90 hover:bg-slate-50",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {errorMsg ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          {errorMsg}
        </div>
      ) : null}

      <div
        className="relative w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white"
        style={{ height: 280, minHeight: 260 }}
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
                  y={55}
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: "Target 55%",
                    position: "right",
                    fill: "#22c55e",
                    fontSize: 11,
                  }}
                />
              )}
              {chartMetric === "purchaseRate" && (
                <ReferenceLine
                  y={10}
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: "Target 10%",
                    position: "right",
                    fill: "#22c55e",
                    fontSize: 11,
                  }}
                />
              )}
              {chartMetric === "conversionRate" && (
                <ReferenceLine
                  y={30}
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: "Target 30%",
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
                    const fill = payload?.belowTarget ? "#ef4444" : "#6366f1";
                    return <circle cx={cx} cy={cy} r={4} fill={fill} />;
                  }}
                  activeDot={(props) => {
                    const { cx, cy, payload } = props;
                    const fill = payload?.belowTarget ? "#ef4444" : "#818cf8";
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={fill}
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
