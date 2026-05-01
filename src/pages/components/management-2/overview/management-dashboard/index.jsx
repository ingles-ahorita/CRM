import React, { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SegmentedTabs from "../../segmented-tabs";
import { supabase } from "../../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../../utils/dateHelpers";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

const TIME_RANGE_ITEMS = [
  { id: "mtd", label: "This month (MTD)" },
  { id: "lastMonth", label: "Last month" },
  { id: "last7", label: "Last 7 days" },
  { id: "lastWeek", label: "Last week" },
  { id: "custom", label: "Custom" },
];

const AVATAR_COLOR_CLASSES = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-pink-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-cyan-500",
];

const EMPTY_METRICS = {
  netRevenue: 0,
  grossRevenue: 0,
  totalSales: 0,
  closerCommission: 0,
  setterCommission: 0,
  totalCommission: 0,
  activeClosers: 0,
  activeSetters: 0,
  salesBreakdown: "",
  netRevenueSeries: [{ i: 0, v: 0 }],
  grossRevenueBars: [{ d: "1", v: 0 }],
  avatars: [],
};

function formatUsd(value) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(safe);
}

function rangeLabel(range) {
  if (range === "lastMonth") return "last month";
  if (range === "last7") return "last 7 days";
  if (range === "lastWeek") return "last week";
  if (range === "custom") return "custom";
  return "mtd";
}

function startOfUTCDate(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUTCDate(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function listDaysISO(start, end) {
  const days = [];
  let cursor = startOfUTCDate(start);
  const endDate = startOfUTCDate(end);
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function getRangeBounds(range) {
  const now = new Date();
  if (range === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart, end: weekEnd };
  }
  if (range === "last7") {
    const end = endOfUTCDate(now);
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: startOfUTCDate(start), end };
  }
  if (range === "lastMonth") {
    const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const monthRange = DateHelpers.getMonthRangeInTimezone(prevMonthDate, DateHelpers.DEFAULT_TIMEZONE);
    return { start: monthRange.startDate, end: monthRange.endDate };
  }
  if (range === "custom") {
    const end = endOfUTCDate(now);
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: startOfUTCDate(start), end };
  }
  const currentRange = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
  return { start: currentRange.startDate, end: currentRange.endDate };
}

function normalizeCustomBounds(startDateText, endDateText) {
  const fallback = getRangeBounds("custom");
  if (!startDateText || !endDateText) return fallback;
  const start = new Date(`${startDateText}T00:00:00.000Z`);
  const end = new Date(`${endDateText}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fallback;
  if (start > end) return fallback;
  return { start, end };
}

function cardShimmerLine(className = "") {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

function MetricCard({ className = "", children }) {
  return (
    <div
      className={cx(
        "flex min-h-[150px] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default function ManagementDashboard() {
  const netGradientId = useId().replace(/:/g, "");
  const [range, setRange] = useState("mtd");
  const customFallback = useMemo(() => getRangeBounds("custom"), []);
  const [customStart, setCustomStart] = useState(customFallback.start.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(customFallback.end.toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [metrics, setMetrics] = useState(EMPTY_METRICS);

  useEffect(() => {
    let cancelled = false;
    async function loadManagementDashboard() {
      setLoading(true);
      setErrorMsg("");
      const { start, end } =
        range === "custom"
          ? normalizeCustomBounds(customStart, customEnd)
          : getRangeBounds(range);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      try {
        const [
          txRes,
          salesRes,
          showUpsRes,
          activeCloserShiftsRes,
          activeSetterShiftsRes,
        ] = await Promise.all([
          supabase
            .from("kajabi_transactions")
            .select("action, amount_in_cents, created_at_kajabi")
            .not("created_at_kajabi", "is", null)
            .gte("created_at_kajabi", startISO)
            .lte("created_at_kajabi", endISO),
          supabase
            .from("outcome_log")
            .select("commission, outcome, purchase_date, closers(name), calls!inner!call_id(setter_id)")
            .not("purchase_date", "is", null)
            .gte("purchase_date", startISO)
            .lte("purchase_date", endISO),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("showed_up", true)
            .not("setter_id", "is", null)
            .not("call_date", "is", null)
            .gte("call_date", startISO)
            .lte("call_date", endISO),
          supabase
            .from("closer_shifts")
            .select("closer_id, start_time, closers(name)")
            .eq("status", "open")
            .order("start_time", { ascending: false }),
          supabase
            .from("setter_shifts")
            .select("setter_id")
            .eq("status", "open"),
        ]);

        if (txRes.error) throw txRes.error;
        if (salesRes.error) throw salesRes.error;
        if (showUpsRes.error) throw showUpsRes.error;
        if (activeCloserShiftsRes.error) throw activeCloserShiftsRes.error;
        if (activeSetterShiftsRes.error) throw activeSetterShiftsRes.error;

        const txRows = Array.isArray(txRes.data) ? txRes.data : [];
        const salesRows = Array.isArray(salesRes.data) ? salesRes.data : [];
        const dayKeys = listDaysISO(start, end);

        const daily = {};
        dayKeys.forEach((k) => {
          daily[k] = { gross: 0, net: 0 };
        });

        let netRevenue = 0;
        let grossRevenue = 0;
        for (const row of txRows) {
          const day = String(row?.created_at_kajabi || "").slice(0, 10);
          if (!daily[day]) continue;
          const amount = Number(row?.amount_in_cents || 0) / 100;
          const action = String(row?.action || "").toLowerCase();
          if (action === "charge") {
            daily[day].gross += amount;
            daily[day].net += amount;
            grossRevenue += amount;
            netRevenue += amount;
          } else if (action === "refund") {
            daily[day].net -= Math.abs(amount);
            netRevenue -= Math.abs(amount);
          }
        }

        let rollingNet = 0;
        const netRevenueSeries = dayKeys.map((day, idx) => {
          rollingNet += daily[day]?.net || 0;
          return { i: idx, isoDay: day, v: rollingNet };
        });
        const barsSourceDays =
          range === "last7" || range === "lastWeek"
            ? dayKeys.length > 7
              ? dayKeys.slice(-7)
              : dayKeys
            : dayKeys;
        const grossRevenueBars = barsSourceDays.map((day) => ({
          d: day.slice(8, 10),
          isoDay: day,
          v: daily[day]?.gross || 0,
        }));

        const yesSalesRows = salesRows.filter((r) => String(r?.outcome || "").toLowerCase() === "yes");
        const totalSales = yesSalesRows.length;
        const closerSalesMap = {};
        for (const row of yesSalesRows) {
          const n = row?.closers?.name || "—";
          closerSalesMap[n] = (closerSalesMap[n] || 0) + 1;
        }
        const salesBreakdown = Object.entries(closerSalesMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, count]) => `${count} ${name}`)
          .join(" • ");

        const closerCommission = salesRows.reduce(
          (sum, row) => sum + (Number(row?.commission) || 0),
          0,
        );
        const setterPurchases = yesSalesRows.reduce((sum, row) => {
          return row?.calls?.setter_id ? sum + 1 : sum;
        }, 0);
        const setterShowUps = Number(showUpsRes.count || 0);
        const setterCommission = setterShowUps * 4 + setterPurchases * 25;
        const totalCommission = closerCommission + setterCommission;

        const activeCloserRows = Array.isArray(activeCloserShiftsRes.data)
          ? activeCloserShiftsRes.data
          : [];
        const activeSetterRows = Array.isArray(activeSetterShiftsRes.data)
          ? activeSetterShiftsRes.data
          : [];

        const uniqueActiveClosers = [];
        const closerSeen = new Set();
        for (const row of activeCloserRows) {
          const closerId = String(row?.closer_id || "");
          if (!closerId || closerSeen.has(closerId)) continue;
          closerSeen.add(closerId);
          uniqueActiveClosers.push({
            id: closerId,
            name: row?.closers?.name || "?",
          });
        }

        const setterSeen = new Set();
        for (const row of activeSetterRows) {
          const setterId = String(row?.setter_id || "");
          if (!setterId) continue;
          setterSeen.add(setterId);
        }

        const activeClosers = uniqueActiveClosers.length;
        const activeSetters = setterSeen.size;
        const avatars = uniqueActiveClosers.slice(0, 6).map((c, idx) => ({
          key: c.id || c.name || String(idx),
          initial: String(c?.name || "?").trim().charAt(0).toUpperCase() || "?",
          className: AVATAR_COLOR_CLASSES[idx % AVATAR_COLOR_CLASSES.length],
        }));

        if (cancelled) return;
        setMetrics({
          netRevenue,
          grossRevenue,
          totalSales,
          closerCommission,
          setterCommission,
          totalCommission,
          activeClosers,
          activeSetters,
          salesBreakdown,
          netRevenueSeries: netRevenueSeries.length ? netRevenueSeries : [{ i: 0, v: 0 }],
          grossRevenueBars: grossRevenueBars.length ? grossRevenueBars : [{ d: "1", v: 0 }],
          avatars,
        });
      } catch (err) {
        console.error("[ManagementDashboard] Failed to load:", err);
        if (cancelled) return;
        setMetrics(EMPTY_METRICS);
        setErrorMsg(err?.message || "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadManagementDashboard();
    return () => {
      cancelled = true;
    };
  }, [range, customStart, customEnd]);

  const commissionedPct = useMemo(() => {
    const total = Number(metrics.totalCommission || 0);
    const closers = Number(metrics.closerCommission || 0);
    if (!total) return 0;
    return Math.round((closers / total) * 1000) / 10;
  }, [metrics.closerCommission, metrics.totalCommission]);

  return (
    <div className="border border-slate-200 rounded-2xl p-4 bg-white">
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 shadow-sm">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] py-2 px-4 rounded-lg  border border-slate-200">
          <div className="text-[20px] font-bold tracking-wide text-black">
            Performance Overview
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <SegmentedTabs
              items={TIME_RANGE_ITEMS}
              activeId={range}
              onChange={setRange}
              size="sm"
              className="max-w-full flex-wrap justify-center border-slate-200/90 bg-slate-100/80 p-1"
              activeClassName="!bg-sky-100 !text-blue-700"
            />
            {range === "custom" ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 px-2 text-[12px] font-medium text-slate-700 !outline-none"
                />
                <span className="text-[12px] font-semibold text-slate-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 px-2 text-[12px] font-medium text-slate-700 !outline-none"
                />
              </div>
            ) : null}
          </div>
        </div>
        {errorMsg ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
            Dashboard data load warning: {errorMsg}
          </div>
        ) : null}

        {/* Metric cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Net revenue {rangeLabel(range)}
            </div>
            {loading ? cardShimmerLine("mt-2 h-9 w-36") : (
              <div className="mt-2 text-[28px] font-bold tabular-nums leading-none text-slate-900">
                {formatUsd(metrics.netRevenue)}
              </div>
            )}
            <div className="mt-2 flex-1 min-h-[55px] w-full [-webkit-tap-highlight-color:transparent]">
              {loading ? cardShimmerLine("h-full w-full min-h-[55px]") : <ResponsiveContainer width="100%" height="100%" minHeight={55}>
                <AreaChart
                  data={metrics.netRevenueSeries}
                  margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id={netGradientId}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#22c55e"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor="#22c55e"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis hide />
                  <Tooltip
                    cursor={false}
                    offset={8}
                    wrapperStyle={{ pointerEvents: "none" }}
                    contentStyle={{
                      borderRadius: 6,
                      border: "1px solid #dcfce7",
                      boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
                      fontSize: 11,
                      padding: "6px 8px",
                    }}
                    labelFormatter={(_, payload) => {
                      const raw = payload?.[0]?.payload?.isoDay;
                      if (!raw) return "";
                      return new Date(`${raw}T00:00:00Z`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                    formatter={(value) => [formatUsd(Number(value) || 0), "Net revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#16a34a"
                    strokeWidth={2}
                    fill={`url(#${netGradientId})`}
                    dot={false}
                    isAnimationActive
                    animationBegin={100}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>}
            </div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">
              Kajabi charges - refunds
            </div>
          </MetricCard>

          <MetricCard>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Gross revenue {rangeLabel(range)}
            </div>
            {loading ? cardShimmerLine("mt-2 h-9 w-36") : (
              <div className="mt-2 text-[28px] font-bold tabular-nums leading-none text-emerald-600">
                {formatUsd(metrics.grossRevenue)}
              </div>
            )}
            <div className="mt-3 flex-1 min-h-[55px] w-full">
              {loading ? cardShimmerLine("h-full w-full min-h-[55px]") : <ResponsiveContainer width="100%" height="100%" minHeight={55}>
                <BarChart
                  data={metrics.grossRevenueBars}
                  margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="d" hide />
                  <YAxis hide domain={[0, "dataMax + 200"]} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
                      fontSize: 12,
                    }}
                    labelFormatter={(_, payload) => {
                      const raw = payload?.[0]?.payload?.isoDay;
                      if (!raw) return "";
                      return new Date(`${raw}T00:00:00Z`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                    formatter={(value) => [formatUsd(Number(value) || 0), "Gross revenue"]}
                  />
                  <Bar
                    dataKey="v"
                    fill="#3b82f6"
                    radius={[3, 3, 0, 0]}
                    minPointSize={3}
                    isAnimationActive
                    animationBegin={120}
                    animationDuration={850}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>}
            </div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">
              Kajabi transactions
            </div>
          </MetricCard>

          <MetricCard>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total sales {rangeLabel(range)}
            </div>
            {loading ? cardShimmerLine("mt-2 h-9 w-20") : (
              <div className="mt-2 text-[28px] font-bold tabular-nums leading-none text-slate-900">
                {metrics.totalSales}
              </div>
            )}
            {loading ? cardShimmerLine("mt-auto h-4 w-full") : (
              <div className="mt-auto pt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                {metrics.salesBreakdown || "No sales in selected range"}
              </div>
            )}
          </MetricCard>

          <MetricCard>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total commission {rangeLabel(range)}
            </div>
            {loading ? cardShimmerLine("mt-4 h-9 w-36") : (
              <div className="mt-4 text-[28px] font-bold tabular-nums leading-none text-slate-900">
                {formatUsd(metrics.totalCommission)}
              </div>
            )}
            <div className="mt-8 flex-1 flex flex-col justify-center">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 animate-pulse">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${commissionedPct}%` }}
                />
              </div>
            </div>
            {loading ? cardShimmerLine("mt-auto h-4 w-full") : (
              <div className="mt-auto pt-2 text-[11px] font-medium text-slate-500">
                Closers {formatUsd(metrics.closerCommission)} + Setters {formatUsd(metrics.setterCommission)}
              </div>
            )}
          </MetricCard>

          <MetricCard>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Team on shift
            </div>
            {loading ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {cardShimmerLine("h-[52px] w-full rounded-lg")}
                {cardShimmerLine("h-[52px] w-full rounded-lg")}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Closers
                  </div>
                  <div className="mt-1 text-[24px] font-bold tabular-nums leading-none text-slate-900">
                    {metrics.activeClosers}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Setters
                  </div>
                  <div className="mt-1 text-[24px] font-bold tabular-nums leading-none text-slate-900">
                    {metrics.activeSetters}
                  </div>
                </div>
              </div>
            )}
            <div className="mt-2 text-[10px] font-medium text-slate-500">
              Currently in open shifts
            </div>
            <div className="mt-auto flex flex-1 items-end gap-1.5">
              {(loading ? [] : metrics.avatars).map((a) => (
                <div
                  key={a.key}
                  className={cx(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white shadow-sm ring-2 ring-white",
                    a.className,
                  )}
                >
                  {a.initial}
                </div>
              ))}
              {!loading && metrics.avatars.length === 0 ? (
                <div className="text-[11px] font-medium text-slate-400">No closers on shift</div>
              ) : null}
              {loading ? (
                <>
                  {cardShimmerLine("h-8 w-8 rounded-full")}
                  {cardShimmerLine("h-8 w-8 rounded-full")}
                  {cardShimmerLine("h-8 w-8 rounded-full")}
                </>
              ) : null}
            </div>
          </MetricCard>
        </div>
      </div>
    </div>
  );
}
