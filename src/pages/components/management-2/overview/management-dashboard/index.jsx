import React, { useEffect, useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SegmentedTabs from "../../segmented-tabs";
import CommissionOverviewSnapshot from "../commission-overview-snapshot";
import OverviewOutcomePanel from "../overview-outcome-panel";
import SectionInfoHint from "../section-info-hint";
import {
  TIME_RANGE_ITEMS,
  startOfUTCDate,
  endOfUTCDate,
  getRangeBounds,
  normalizeCustomBounds,
} from "../overview-range-helpers";
import { useRevenueGoal } from "../../../../../hooks/useRevenueGoal";
import { supabase } from "../../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../../utils/dateHelpers";
import { PERFORMANCE_COLORS } from "../../../../../utils/performanceBenchmarks";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

const EMPTY_METRICS = {
  netRevenue: 0,
  netRevenueBars: [{ d: "1", v: 0, fill: PERFORMANCE_COLORS.BAD }],
};

function getPeriodDailyNetTarget(range, monthlyRevenueGoal, dayCount) {
  const days = Math.max(1, dayCount);
  if (range === "lastWeek") {
    const periodGoal = Math.round((7 / 30.4) * monthlyRevenueGoal);
    return periodGoal / 7;
  }
  if (range === "custom") {
    const periodGoal = Math.round((days / 30.4) * monthlyRevenueGoal);
    return periodGoal / days;
  }
  if (range === "lastMonth") {
    return monthlyRevenueGoal / days;
  }
  const now = new Date();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return monthlyRevenueGoal / daysInMonth;
}

function dailyNetRevenueBarColor(revenue, dailyTarget) {
  const r = Number(revenue);
  if (!Number.isFinite(r)) return PERFORMANCE_COLORS.BAD;
  const target = Number(dailyTarget);
  if (!Number.isFinite(target) || target <= 0) return PERFORMANCE_COLORS.BAD;
  if (r >= target) return PERFORMANCE_COLORS.GOOD;
  if (r >= target * 0.9) return PERFORMANCE_COLORS.OK;
  return PERFORMANCE_COLORS.BAD;
}

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

function cardShimmerLine(className = "") {
  return (
    <div
      className={cx("animate-pulse rounded-md bg-slate-200/70", className)}
    />
  );
}

const GOAL_CHART_BAR_HEIGHTS = [0.42, 0.68, 0.34, 0.58, 0.82, 0.38, 0.62, 0.5, 0.76, 0.3];

function MonthlyGoalMetricSkeleton({ barCount = 20 }) {
  const count = Math.max(1, barCount);
  return (
    <div className="flex flex-1 flex-col justify-center" aria-hidden>
      <div className="mb-2 flex min-h-8 items-start justify-between gap-2">
        {cardShimmerLine("h-3 w-36 max-w-[72%]")}
        <div className="h-7 w-7 shrink-0 animate-pulse rounded-md border border-slate-200/90 bg-slate-200/50" />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        {cardShimmerLine("h-8 w-28")}
        {cardShimmerLine("h-3 w-[4.5rem]")}
      </div>
      <div className="mt-4 h-2.5 w-full animate-pulse rounded-full bg-slate-200/70" />
      <div className="mt-3 flex h-[55px] w-full items-end gap-[3px]">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="min-w-[3px] flex-1 animate-pulse rounded-sm bg-slate-200/70"
            style={{
              height: `${Math.round(GOAL_CHART_BAR_HEIGHTS[i % GOAL_CHART_BAR_HEIGHTS.length] * 100)}%`,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {cardShimmerLine("h-3 w-[5.5rem]")}
        {cardShimmerLine("h-3 w-[8.5rem]")}
      </div>
    </div>
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
  const {
    monthlyRevenueGoal,
    saving: revenueGoalSaving,
    saveMonthlyRevenueGoal,
  } = useRevenueGoal();
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
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(monthlyRevenueGoal));
  const [goalError, setGoalError] = useState("");

  useEffect(() => {
    if (!goalModalOpen) setGoalDraft(String(monthlyRevenueGoal));
  }, [goalModalOpen, monthlyRevenueGoal]);

  async function handleSaveRevenueGoal() {
    const parsed = Number(goalDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setGoalError("Enter a positive dollar amount.");
      return;
    }

    setGoalError("");
    try {
      const saved = await saveMonthlyRevenueGoal(parsed);
      setGoalDraft(String(saved));
      setGoalModalOpen(false);
    } catch (err) {
      setGoalError(err?.message || "Failed to save revenue goal.");
    }
  }

  function openRevenueGoalModal() {
    setGoalDraft(String(monthlyRevenueGoal));
    setGoalError("");
    setGoalModalOpen(true);
  }

  function closeRevenueGoalModal() {
    setGoalDraft(String(monthlyRevenueGoal));
    setGoalError("");
    setGoalModalOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadManagementDashboard() {
      setLoading(true);
      setErrorMsg("");
      let { start, end } =
        range === "custom"
          ? normalizeCustomBounds(customStart, customEnd)
          : getRangeBounds(range);
      if (range === "mtd") {
        const todayEnd = endOfUTCDate(new Date());
        if (end.getTime() > todayEnd.getTime()) end = todayEnd;
      }
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      try {
        const [netTxRes] = await Promise.all([
          supabase
            .from("kajabi_transactions")
            .select("action, amount_in_cents, state, effective_date, payment_resolved_at, created_at_kajabi")
            .or(`and(created_at_kajabi.gte.${startISO},created_at_kajabi.lte.${endISO}),and(effective_date.gte.${startISO},effective_date.lte.${endISO}),and(payment_resolved_at.gte.${startISO},payment_resolved_at.lte.${endISO})`),
        ]);

        if (netTxRes.error) throw netTxRes.error;

        const netTxRows = Array.isArray(netTxRes.data) ? netTxRes.data : [];
        const dayKeys = listDaysISO(start, end);

        const daily = {};
        dayKeys.forEach((k) => {
          daily[k] = 0;
        });

        let netRevenue = 0;

        for (const row of netTxRows) {
          const amountCents = Math.abs(Number(row?.amount_in_cents || 0));
          const amount = amountCents / 100;
          const state = String(row?.state || "").toLowerCase();

          // Net revenue (legacy ManagementPage)
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
              if (daily[day] != null) daily[day] += netDelta;
            }
          }
        }

        const dailyTarget = getPeriodDailyNetTarget(
          range,
          monthlyRevenueGoal,
          dayKeys.length,
        );
        const netRevenueBars = dayKeys.map((day) => {
          const v = daily[day] || 0;
          return {
            d: day.slice(8, 10),
            isoDay: day,
            v,
            fill: dailyNetRevenueBarColor(v, dailyTarget),
          };
        });

        if (cancelled) return;
        setMetrics({
          netRevenue,
          netRevenueBars: netRevenueBars.length
            ? netRevenueBars
            : [{ d: "1", v: 0, fill: PERFORMANCE_COLORS.BAD }],
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
  }, [range, customStart, customEnd, monthlyRevenueGoal]);

  const goalSkeletonBarCount = useMemo(() => {
    let { start, end } =
      range === "custom"
        ? normalizeCustomBounds(customStart, customEnd)
        : getRangeBounds(range);
    if (range === "mtd") {
      const todayEnd = endOfUTCDate(new Date());
      if (end.getTime() > todayEnd.getTime()) end = todayEnd;
    }
    return listDaysISO(start, end).length;
  }, [range, customStart, customEnd]);

  return (
    <>
    <div className="border border-slate-200 rounded-2xl p-2 bg-white">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] py-1.5 px-2 sm:px-3 rounded-lg border border-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-[18px] font-bold tracking-wide text-black">
            Performance Overview
          </div>
          <SectionInfoHint text="Net revenue from Kajabi (charges minus refunds) for your dates, and progress toward the monthly goal." />
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
      <div className="grid gap-3">
        <MetricCard>
          {loading ? (
            <MonthlyGoalMetricSkeleton barCount={goalSkeletonBarCount} />
          ) : (() => {
            const now = new Date();
            const daysInMonth = new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
            ).getUTCDate();

            let label = "Monthly goal";
            let target = monthlyRevenueGoal;
            let currentDay = now.getUTCDate();
            let totalDays = daysInMonth;
            let expectedPct = currentDay / totalDays;

            if (range === "lastMonth") {
              label = "Last month goal";
              const lastMonthDate = new Date(
                now.getFullYear(),
                now.getMonth() - 1,
                1,
              );
              totalDays = new Date(
                Date.UTC(
                  lastMonthDate.getUTCFullYear(),
                  lastMonthDate.getUTCMonth() + 1,
                  0,
                ),
              ).getUTCDate();
              currentDay = totalDays;
              expectedPct = 1;
            } else if (range === "lastWeek") {
              label = "Weekly goal";
              target = Math.round((7 / 30.4) * monthlyRevenueGoal);
              totalDays = 7;
              currentDay = 7;
              expectedPct = 1;
            } else if (range === "custom") {
              label = "Custom goal";
              const { start, end } = normalizeCustomBounds(
                customStart,
                customEnd,
              );
              totalDays = Math.max(
                1,
                Math.ceil(
                  (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
                ),
              );
              currentDay = totalDays;
              target = Math.round((totalDays / 30.4) * monthlyRevenueGoal);
              expectedPct = 1;
            }

            const actualRevenue = metrics.netRevenue;
            const expectedTarget = target * expectedPct;
            const actualPct = Math.min((actualRevenue / target) * 100, 100);
            const todayLinePct = Math.min(expectedPct * 100, 100);

            let barColor = PERFORMANCE_COLORS.BAD;
            if (actualRevenue >= expectedTarget)
              barColor = PERFORMANCE_COLORS.GOOD;
            else if (actualRevenue >= expectedTarget * 0.9)
              barColor = PERFORMANCE_COLORS.OK;

            return (
              <div className="flex flex-1 flex-col justify-center">
                <div className="mb-2 flex min-h-8 items-start justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {label} · Net revenue
                  </div>
                  <div className="group relative shrink-0">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      aria-label="Edit monthly revenue goal"
                      onClick={openRevenueGoalModal}
                    >
                      <Pencil
                        size={14}
                        strokeWidth={2.5}
                        className="block shrink-0"
                        aria-hidden
                      />
                    </button>
                    <div className="pointer-events-none absolute right-0 top-8 z-30 w-52 rounded-md bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-white opacity-0 shadow-[0_10px_24px_rgba(2,6,23,0.3)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                      Update the global monthly revenue goal. Current filters
                      only prorate it for this card.
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[28px] font-bold tabular-nums leading-none"
                    style={{ color: barColor }}
                  >
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
                      boxShadow: `0 0 12px ${barColor}40`,
                    }}
                  />
                  {expectedPct < 1 ? (
                    <div
                      className="absolute top-0 z-10 h-full w-0.5 bg-slate-800"
                      style={{ left: `${todayLinePct}%` }}
                      title={`Target for this period: ${formatUsd(expectedTarget)}`}
                    />
                  ) : null}
                </div>

                <div className="mt-3 min-h-[55px] w-full">
                  <ResponsiveContainer width="100%" height="100%" minHeight={55}>
                    <BarChart
                      data={metrics.netRevenueBars}
                      margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
                    >
                      <XAxis dataKey="d" hide />
                      <YAxis hide domain={["auto", "auto"]} />
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
                          "Net revenue",
                        ]}
                      />
                      <Bar
                        dataKey="v"
                        radius={[3, 3, 0, 0]}
                        minPointSize={3}
                        isAnimationActive
                        animationBegin={120}
                        animationDuration={850}
                        animationEasing="ease-out"
                      >
                        {metrics.netRevenueBars.map((entry, index) => (
                          <Cell
                            key={`net-bar-${entry.isoDay || index}`}
                            fill={entry.fill}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-tight text-slate-500">
                  <span>{actualPct.toFixed(1)}% reached</span>
                  <span>
                    {range === "mtd"
                      ? `Day ${currentDay}/${totalDays}`
                      : `${totalDays} days`}{" "}
                    · target {formatUsd(expectedTarget)}
                  </span>
                </div>
              </div>
            );
          })()}
        </MetricCard>
      </div>
    </div>

    <OverviewOutcomePanel />

    <CommissionOverviewSnapshot />
    {goalModalOpen ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !revenueGoalSaving) {
            closeRevenueGoalModal();
          }
        }}
      >
        <div
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="monthly-revenue-goal-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Pencil size={15} strokeWidth={2.5} aria-hidden />
                </span>
                <h2
                  id="monthly-revenue-goal-title"
                  className="text-[15px] font-bold text-slate-950"
                >
                  Edit monthly revenue goal
                </h2>
              </div>
              <div className="mt-1 text-[12px] font-medium text-slate-500">
                Current saved goal: {formatUsd(monthlyRevenueGoal)}
              </div>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Close revenue goal editor"
              disabled={revenueGoalSaving}
              onClick={closeRevenueGoalModal}
            >
              <X size={16} strokeWidth={2.5} className="block shrink-0" aria-hidden />
            </button>
          </div>

          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveRevenueGoal();
            }}
          >
            <div>
              <label
                className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
                htmlFor="monthly-revenue-goal-modal"
              >
                Monthly goal
              </label>
              <div className="mt-1 flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-500 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <span>$</span>
                <input
                  id="monthly-revenue-goal-modal"
                  className="ml-2 w-full border-0 bg-transparent p-0 text-[15px] font-bold tabular-nums text-slate-950 outline-none"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={goalDraft}
                  disabled={revenueGoalSaving}
                  autoFocus
                  onChange={(event) => {
                    setGoalDraft(event.target.value);
                    if (goalError) setGoalError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      if (!revenueGoalSaving) closeRevenueGoalModal();
                    }
                  }}
                />
              </div>
              {goalError ? (
                <div className="mt-1 text-[11px] font-semibold text-red-600">
                  {goalError}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-medium leading-5 text-slate-700">
              Enter value to update the monthly revenue goal.
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={revenueGoalSaving}
                onClick={closeRevenueGoalModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 rounded-md border border-blue-600 bg-blue-600 px-3 text-[12px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={revenueGoalSaving}
              >
                {revenueGoalSaving ? "Saving..." : "Save goal"}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null}
    </>
  );
}
