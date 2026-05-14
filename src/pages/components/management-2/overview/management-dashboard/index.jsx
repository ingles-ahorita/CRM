import React, { useEffect, useId, useMemo, useState } from "react";
import { PERFORMANCE_COLORS } from "../../../../../utils/performanceBenchmarks";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SegmentedTabs from "../../segmented-tabs";
import { useRevenueGoal } from "../../../../../hooks/useRevenueGoal";
import { supabase } from "../../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../../utils/dateHelpers";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

const TIME_RANGE_ITEMS = [
  { id: "mtd", label: "MTD", title: "This month (MTD)" },
  { id: "lastMonth", label: "Last mo", title: "Last month" },
  { id: "last7", label: "7 days", title: "Last 7 days" },
  { id: "lastWeek", label: "Last wk", title: "Last week" },
  { id: "custom", label: "Custom", title: "Custom date range" },
];

const EMPTY_METRICS = {
  netRevenue: 0,
  mtdNetRevenue: 0,
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

const SUCCESS_STATES = [
  "paid",
  "successful",
  "success",
  "complete",
  "completed",
  "succeeded",
];

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
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUTCDate(d) {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
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
    const prevMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15),
    );
    const monthRange = DateHelpers.getMonthRangeInTimezone(
      prevMonthDate,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    return { start: monthRange.startDate, end: monthRange.endDate };
  }
  if (range === "custom") {
    const end = endOfUTCDate(now);
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: startOfUTCDate(start), end };
  }
  const currentRange = DateHelpers.getMonthRangeInTimezone(
    now,
    DateHelpers.DEFAULT_TIMEZONE,
  );
  return { start: currentRange.startDate, end: currentRange.endDate };
}

function normalizeCustomBounds(startDateText, endDateText) {
  const fallback = getRangeBounds("custom");
  if (!startDateText || !endDateText) return fallback;
  const start = new Date(`${startDateText}T00:00:00.000Z`);
  const end = new Date(`${endDateText}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return fallback;
  if (start > end) return fallback;
  return { start, end };
}

function cardShimmerLine(className = "") {
  return (
    <div
      className={cx("animate-pulse rounded-md bg-slate-200/70", className)}
    />
  );
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
  const { monthlyRevenueGoal } = useRevenueGoal();
  const netGradientId = useId().replace(/:/g, "");
  const commissionChartId = useId().replace(/:/g, "");
  const [range, setRange] = useState("mtd");
  const customFallback = useMemo(() => getRangeBounds("custom"), []);
  const [customStart, setCustomStart] = useState(
    customFallback.start.toISOString().slice(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(
    customFallback.end.toISOString().slice(0, 10),
  );
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

      const now = new Date();
      const mtdRange = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
      const mtdStartISO = mtdRange.startDate.toISOString();
      const mtdEndISO = now.toISOString();

      try {
        const [
          netTxRes,
          salesRes,
          showUpsRes,
          activeCloserShiftsRes,
          activeSetterShiftsRes,
        ] = await Promise.all([
          supabase
            .from("kajabi_transactions")
            .select("action, amount_in_cents, state, effective_date, payment_resolved_at, created_at_kajabi")
            .or(`and(created_at_kajabi.gte.${startISO},created_at_kajabi.lte.${endISO}),and(effective_date.gte.${startISO},effective_date.lte.${endISO}),and(payment_resolved_at.gte.${startISO},payment_resolved_at.lte.${endISO})`),
          supabase
            .from("outcome_log")
            .select(
              "commission, outcome, purchase_date, closers(name), calls!inner!call_id(setter_id)",
            )
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
            .select("closer_id, start_time, closers(name, avatar_url)")
            .eq("status", "open")
            .order("start_time", { ascending: false }),
          supabase
            .from("setter_shifts")
            .select("setter_id")
            .eq("status", "open"),
        ]);

        if (netTxRes.error) throw netTxRes.error;
        if (salesRes.error) throw salesRes.error;
        if (showUpsRes.error) throw showUpsRes.error;
        if (activeCloserShiftsRes.error) throw activeCloserShiftsRes.error;
        if (activeSetterShiftsRes.error) throw activeSetterShiftsRes.error;

        const netTxRows = Array.isArray(netTxRes.data) ? netTxRes.data : [];
        const salesRows = Array.isArray(salesRes.data) ? salesRes.data : [];
        const dayKeys = listDaysISO(start, end);

        const daily = {};
        dayKeys.forEach((k) => {
          daily[k] = { gross: 0, net: 0 };
        });

        let netRevenue = 0;
        let grossRevenue = 0;

        // Exact match logic from legacy ManagementPage
        for (const row of netTxRows) {
          const amountCents = Math.abs(Number(row?.amount_in_cents || 0));
          const amount = amountCents / 100;
          const state = String(row?.state || "").toLowerCase();
          
          // 1. Gross Revenue logic (matching legacy ManagementPage lines 123-146)
          const inGrossRange = row.created_at_kajabi >= startISO && row.created_at_kajabi <= endISO;
          if (inGrossRange) {
            const action = row.action ?? (row.amount_in_cents >= 0 ? 'charge' : 'refund');
            const isRefund = action === 'refund' || row.amount_in_cents < 0;
            const isDispute = action === 'dispute';
            const isFailed = isDispute || (row.state != null && !SUCCESS_STATES.includes(state));
            
            if (!isRefund && !isFailed) {
              grossRevenue += amount;
              const day = String(row.created_at_kajabi || "").slice(0, 10);
              if (daily[day]) daily[day].gross += amount;
            }
          }

          // 2. Net Revenue logic (matching legacy ManagementPage lines 148-177)
          const resolvedInRange = row?.payment_resolved_at != null
            && row.payment_resolved_at >= startISO
            && row.payment_resolved_at <= endISO
            && (row.effective_date == null || row.effective_date < startISO || row.effective_date > endISO);
          
          const inNetRange = (row.effective_date >= startISO && row.effective_date <= endISO) || resolvedInRange;
          
          if (inNetRange) {
            const action = resolvedInRange ? 'charge' : (row?.action ?? (row.amount_in_cents >= 0 ? "charge" : "refund"));
            const isRefund = action === "refund" || row.amount_in_cents < 0;
            const isDispute = action === "dispute";
            const isFailed = !resolvedInRange && (isDispute || (row.state != null && !SUCCESS_STATES.includes(state)));
            
            if (!isFailed) {
              const netDelta = isRefund ? -amount : amount;
              netRevenue += netDelta;
              
              let targetDateStr = resolvedInRange ? row.payment_resolved_at : (row.effective_date || row.created_at_kajabi);
              const day = String(targetDateStr || "").slice(0, 10);
              if (daily[day]) daily[day].net += netDelta;
            }
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

        const yesSalesRows = salesRows.filter(
          (r) => String(r?.outcome || "").toLowerCase() === "yes",
        );
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
            avatarUrl: row?.closers?.avatar_url || null,
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
          name: c.name || "?",
          initial:
            String(c?.name || "?")
              .trim()
              .charAt(0)
              .toUpperCase() || "?",
          avatarUrl: c?.avatarUrl || null,
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
          netRevenueSeries: netRevenueSeries.length
            ? netRevenueSeries
            : [{ i: 0, v: 0 }],
          grossRevenueBars: grossRevenueBars.length
            ? grossRevenueBars
            : [{ d: "1", v: 0 }],
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

  const commissionSplitPie = useMemo(() => {
    const gid = commissionChartId;
    const closers = Math.max(0, Number(metrics.closerCommission || 0));
    const setters = Math.max(0, Number(metrics.setterCommission || 0));
    const rows = [];
    if (closers > 0) {
      rows.push({
        name: "Closers",
        value: closers,
        fill: `url(#${gid}-closer)`,
        legendColor: "#0d9488",
      });
    }
    if (setters > 0) {
      rows.push({
        name: "Setters",
        value: setters,
        fill: `url(#${gid}-setter)`,
        legendColor: "#4f46e5",
      });
    }
    return rows;
  }, [metrics.closerCommission, metrics.setterCommission, commissionChartId]);

  const commissionPieTotal = useMemo(() => {
    return commissionSplitPie.reduce((s, d) => s + d.value, 0);
  }, [commissionSplitPie]);

  return (
    <div className="border border-slate-200 rounded-2xl p-2 bg-white">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] py-1.5 px-2 sm:px-3 rounded-lg border border-slate-200">
        <div className="shrink-0 text-[18px] font-bold tracking-wide text-black">
          Performance Overview
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
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
          {range === "custom" ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 bg-white sm:flex-nowrap">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
              />
              <span className="text-[10px] font-semibold text-slate-500">
                –
              </span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
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
      <div className="grid gap-3 ">
        <MetricCard>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Gross revenue {rangeLabel(range)}
          </div>
          {loading ? (
            cardShimmerLine("mt-2 h-9 w-36")
          ) : (
            <div className="mt-2 text-[28px] font-bold tabular-nums leading-none text-emerald-600">
              {formatUsd(metrics.grossRevenue)}
            </div>
          )}
          <div className="mt-3 flex-1 min-h-[55px] w-full">
            {loading ? (
              cardShimmerLine("h-full w-full min-h-[55px]")
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={55}>
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
                      return new Date(`${raw}T00:00:00Z`).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        },
                      );
                    }}
                    formatter={(value) => [
                      formatUsd(Number(value) || 0),
                      "Gross revenue",
                    ]}
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
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-1 text-[10px] font-medium text-slate-400">
            Kajabi transactions
          </div>
        </MetricCard>

        <MetricCard>
          {loading ? (
            <div className="space-y-3">
              {cardShimmerLine("h-3 w-40")}
              {cardShimmerLine("h-8 w-32")}
              {cardShimmerLine("h-5 w-full rounded-full")}
              {cardShimmerLine("h-3 w-40")}
            </div>
          ) : (() => {
            const now = new Date();
            const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
            
            let label = "Monthly goal";
            let target = monthlyRevenueGoal;
            let currentDay = now.getUTCDate();
            let totalDays = daysInMonth;
            let expectedPct = currentDay / totalDays;

            if (range === "lastMonth") {
              label = "Last month goal";
              const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              totalDays = new Date(Date.UTC(lastMonthDate.getUTCFullYear(), lastMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
              currentDay = totalDays;
              expectedPct = 1;
            } else if (range === "last7" || range === "lastWeek") {
              label = range === "last7" ? "7 days goal" : "Weekly goal";
              target = Math.round((7 / 30.4) * monthlyRevenueGoal);
              totalDays = 7;
              currentDay = 7;
              expectedPct = 1;
            } else if (range === "custom") {
              label = "Custom goal";
              const { start, end } = normalizeCustomBounds(customStart, customEnd);
              totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
              currentDay = totalDays;
              target = Math.round((totalDays / 30.4) * monthlyRevenueGoal);
              expectedPct = 1;
            }

            const actualRevenue = metrics.netRevenue;
            const expectedTarget = target * expectedPct;
            const actualPct = Math.min((actualRevenue / target) * 100, 100);
            const todayLinePct = Math.min(expectedPct * 100, 100);
            
            let barColor = PERFORMANCE_COLORS.BAD;
            if (actualRevenue >= expectedTarget) barColor = PERFORMANCE_COLORS.GOOD;
            else if (actualRevenue >= expectedTarget * 0.9) barColor = PERFORMANCE_COLORS.OK;

            return (
              <div className="flex flex-col justify-center flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  {label} · Net revenue
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: barColor }}>
                    {formatUsd(actualRevenue)}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    of {formatUsd(target)}
                  </span>
                </div>

                <div className="relative mt-4 h-2.5 w-full rounded-full bg-slate-100">
                  <div 
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out"
                    style={{ 
                      width: `${Math.max(2, actualPct)}%`, 
                      backgroundColor: barColor,
                      boxShadow: `0 0 12px ${barColor}40`
                    }}
                  />
                  {expectedPct < 1 && (
                    <div 
                      className="absolute top-0 h-full w-0.5 bg-slate-800 z-10"
                      style={{ left: `${todayLinePct}%` }}
                      title={`Target for this period: ${formatUsd(expectedTarget)}`}
                    />
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] font-bold tracking-tight text-slate-500 uppercase">
                  <span>{actualPct.toFixed(1)}% reached</span>
                  <span>{range === "mtd" ? `Day ${currentDay}/${totalDays}` : `${totalDays} days`} · target {formatUsd(expectedTarget)}</span>
                </div>
              </div>
            );
          })()}
        </MetricCard>

        <MetricCard className="!min-h-[120px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total sales {rangeLabel(range)}
          </div>
          {loading ? (
            cardShimmerLine("mt-2 h-9 w-20")
          ) : (
            <div className="mt-2 text-[28px] font-bold tabular-nums leading-none text-slate-900">
              {metrics.totalSales}
            </div>
          )}
          {loading ? (
            cardShimmerLine("mt-auto h-4 w-full")
          ) : (
            <div className="mt-auto pt-1 text-[11px] font-medium leading-relaxed text-slate-500">
              {metrics.salesBreakdown || "No sales in selected range"}
            </div>
          )}
        </MetricCard>

        <MetricCard>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total commission {rangeLabel(range)}
          </div>
          {loading ? (
            cardShimmerLine("mt-4 h-9 w-36")
          ) : (
            <div className="mt-4 text-[28px] font-bold tabular-nums leading-none text-slate-900">
              {formatUsd(metrics.totalCommission)}
            </div>
          )}
          <div className="mt-3 flex-1 flex flex-col justify-center min-h-[96px]">
            {loading ? (
              cardShimmerLine("h-[96px] w-full rounded-xl")
            ) : commissionSplitPie.length === 0 ? (
              <div className="flex h-[96px] items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50 to-slate-50/30 text-[11px] font-medium text-slate-400">
                No commission in selected range
              </div>
            ) : (
              <div className="flex min-h-[96px] items-center gap-1 rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/40 to-slate-50/70 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)]">
                <div
                  className="relative flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100/90 to-slate-50 p-[3px] shadow-[0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-white/80"
                  aria-hidden
                >
                  <div className="h-full w-full overflow-hidden rounded-full bg-white shadow-[inset_0_1px_3px_rgba(15,23,42,0.06)]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart
                        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id={`${commissionChartId}-closer`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#2dd4bf" />
                            <stop offset="100%" stopColor="#0f766e" />
                          </linearGradient>
                          <linearGradient
                            id={`${commissionChartId}-setter`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#a5b4fc" />
                            <stop offset="100%" stopColor="#4338ca" />
                          </linearGradient>
                        </defs>
                        <Pie
                          data={commissionSplitPie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="58%"
                          outerRadius="92%"
                          paddingAngle={commissionSplitPie.length > 1 ? 2.5 : 0}
                          cornerRadius={5}
                          stroke="#fff"
                          strokeWidth={2}
                          isAnimationActive
                          animationBegin={80}
                          animationDuration={640}
                          animationEasing="ease-out"
                        >
                          {commissionSplitPie.map((entry, i) => (
                            <Cell
                              key={`${entry.name}-${i}`}
                              fill={entry.fill}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 py-0.5">
                  {commissionSplitPie.map((row) => {
                    const pct =
                      commissionPieTotal > 0
                        ? Math.round((row.value / commissionPieTotal) * 1000) /
                          10
                        : 0;
                    return (
                      <div
                        key={row.name}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ring-2 ring-white"
                          style={{
                            background: `linear-gradient(135deg, ${row.legendColor}, ${row.legendColor}dd)`,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35)`,
                          }}
                          title={row.name}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                              {row.name}
                            </span>
                            <span className="text-[10px] font-bold tabular-nums text-slate-900">
                              {formatUsd(row.value)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[9px] font-semibold tabular-nums text-slate-500">
                            {pct}% of payout
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* {loading ? cardShimmerLine("mt-auto h-4 w-full") : (
              <div className="mt-auto pt-2 text-[10px] font-medium leading-relaxed text-slate-500">
                <span className="text-slate-400">Breakdown · </span>
                Closers {formatUsd(metrics.closerCommission)}
                <span className="mx-1.5 text-slate-300">+</span>
                Setters {formatUsd(metrics.setterCommission)}
              </div>
            )} */}
        </MetricCard>

        <MetricCard className="!min-h-[100px]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Team on shift
            </div>

            <div className="flex items-center flex-col gap-1.5 pr-2">
              {/* <div className="mb-1 text-[10px] font-medium text-slate-500">
                Currently in open shifts
              </div> */}
              <div className="mt-auto flex flex-1 items-end gap-1.5">
                {(loading ? [] : metrics.avatars).map((a) => (
                  <div key={a.key} className="group relative h-6 w-6 shrink-0">
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 rounded-md bg-slate-950 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-white opacity-0 shadow-[0_8px_20px_rgba(2,6,23,0.35)] transition-opacity duration-150 group-hover:opacity-100">
                      {a.name || "Closer"}
                    </div>
                    <div className="absolute inset-0 flex h-8 w-8 items-center justify-center rounded-full bg-slate-500 text-[12px] font-bold text-white shadow-sm ring-2 ring-white">
                      {a.initial}
                    </div>
                    {a.avatarUrl ? (
                      <img
                        src={a.avatarUrl}
                        alt={a.name || "Closer"}
                        className="absolute inset-0 h-8 w-8 rounded-full object-cover shadow-sm ring-2 ring-white"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                  </div>
                ))}
                {!loading && metrics.avatars.length === 0 ? (
                  <div className="text-[11px] font-medium text-slate-400">
                    No closers on shift
                  </div>
                ) : null}
                {loading ? (
                  <>
                    {cardShimmerLine("h-8 w-8 rounded-full")}
                    {cardShimmerLine("h-8 w-8 rounded-full")}
                    {cardShimmerLine("h-8 w-8 rounded-full")}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          {loading ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {cardShimmerLine("h-[52px] w-full rounded-lg")}
              {cardShimmerLine("h-[52px] w-full rounded-lg")}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 mb-2">
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
        </MetricCard>
      </div>
    </div>
  );
}
