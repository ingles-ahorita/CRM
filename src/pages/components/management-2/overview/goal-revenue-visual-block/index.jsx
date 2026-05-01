import React, { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { supabase } from "../../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../../utils/dateHelpers";

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

function Pill({ children, className = "" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SemiCircleGauge({
  percent,
  strokeColor,
  trackColor = "#e5e7eb",
  strokeWidth = 12,
  width = 200,
  labelMain,
  labelSub,
}) {
  const centerX = width / 2;
  const radius = width / 2 - strokeWidth / 2 - 10;
  const centerY = 100;
  const x1 = centerX - radius;
  const x2 = centerX + radius;
  const arcPath = `M ${x1} ${centerY} A ${radius} ${radius} 0 0 1 ${x2} ${centerY}`;
  const len = Math.PI * radius;
  const pct = Math.min(100, Math.max(0, percent));
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const from = animatedPct;
    const to = pct;
    const duration = 900;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setAnimatedPct(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pct]);

  const dash = (animatedPct / 100) * len;
  const svgH = centerY + strokeWidth / 2 + 4;

  return (
    <div className="relative shrink-0" style={{ width, height: 130 }}>
      <svg
        width={width}
        height={svgH}
        viewBox={`0 0 ${width} 108`}
        className="block overflow-visible"
        aria-hidden
      >
        <path
          d={arcPath}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={arcPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${len}`}
        />
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-[62%] flex w-[min(140px,90%)] -translate-x-1/2 -translate-y-[55%] flex-col items-center text-center">
        <div className="text-[36px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
          {labelMain}
        </div>
        <div className="mt-2 max-w-[120px] text-[13px] font-semibold leading-snug text-slate-500">
          {labelSub}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_MONTHLY_GOAL_USD = 55000;
const SUCCESS_STATES = ["paid", "successful", "success", "complete", "completed", "succeeded"];

function formatUsd(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function sumNetFromTransactions(rows) {
  let net = 0;
  for (const row of rows || []) {
    const amount = Number(row?.amount_in_cents || 0) / 100;
    const action = String(row?.action || "").toLowerCase();
    if (action === "charge") net += amount;
    if (action === "refund") net -= Math.abs(amount);
  }
  return net;
}

function shimmer(className = "") {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export default function GoalRevenueVisualBlock() {
  const trendGradId = useId().replace(/:/g, "");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [monthlyGoal, setMonthlyGoal] = useState(DEFAULT_MONTHLY_GOAL_USD);
  const [mtdRevenue, setMtdRevenue] = useState(0);
  const [trendPoints, setTrendPoints] = useState([
    { w: 0, v: 0 },
    { w: 1, v: 0 },
    { w: 2, v: 0 },
    { w: 3, v: 0 },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadBlockData() {
      setLoading(true);
      setErrorMsg("");

      try {
        const now = new Date();
        const mtdRange = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
        const mtdStartISO = mtdRange.startDate.toISOString();
        const mtdEndISO = now.toISOString();

        const oldestWeek = DateHelpers.getWeekBoundsForOffset(3).weekStart;
        const currentWeekEnd = DateHelpers.getWeekBoundsForOffset(0).weekEnd;

        const [mtdTxRes, weeklyTxRes] = await Promise.all([
          supabase
            .from("kajabi_transactions")
            .select("amount_in_cents, action, state, effective_date, payment_resolved_at")
            .or(
              `and(effective_date.gte.${mtdStartISO},effective_date.lte.${mtdEndISO}),and(payment_resolved_at.gte.${mtdStartISO},payment_resolved_at.lte.${mtdEndISO})`,
            ),
          supabase
            .from("kajabi_transactions")
            .select("action, amount_in_cents, created_at_kajabi")
            .not("created_at_kajabi", "is", null)
            .gte("created_at_kajabi", oldestWeek.toISOString())
            .lte("created_at_kajabi", currentWeekEnd.toISOString()),
        ]);

        if (mtdTxRes.error) throw mtdTxRes.error;
        if (weeklyTxRes.error) throw weeklyTxRes.error;

        const mtdNet = (mtdTxRes.data || []).reduce((sum, t) => {
          const resolvedInThisMonth = t.payment_resolved_at != null
            && t.payment_resolved_at >= mtdStartISO
            && t.payment_resolved_at <= mtdEndISO
            && (t.effective_date == null || t.effective_date < mtdStartISO || t.effective_date > mtdEndISO);
          const action = resolvedInThisMonth
            ? "charge"
            : (t.action ?? ((t.amount_in_cents || 0) >= 0 ? "charge" : "refund"));
          const isRefund = action === "refund" || Number(t.amount_in_cents || 0) < 0;
          const isDispute = action === "dispute";
          const isFailed = !resolvedInThisMonth
            && (isDispute || (t.state != null && !SUCCESS_STATES.includes(String(t.state).toLowerCase())));
          if (isFailed) return sum;
          if (isRefund) return sum - Math.abs(Number(t.amount_in_cents || 0)) / 100;
          return sum + Math.abs(Number(t.amount_in_cents || 0)) / 100;
        }, 0);

        const weekBounds = [3, 2, 1, 0].map((offset) => DateHelpers.getWeekBoundsForOffset(offset));
        const grouped = weekBounds.map((w, idx) => {
          const rows = (weeklyTxRes.data || []).filter((r) => {
            const ts = r?.created_at_kajabi ? new Date(r.created_at_kajabi).getTime() : 0;
            return ts >= w.weekStart.getTime() && ts <= w.weekEnd.getTime();
          });
          return { w: idx, v: sumNetFromTransactions(rows) };
        });

        if (cancelled) return;
        setMonthlyGoal(DEFAULT_MONTHLY_GOAL_USD);
        setMtdRevenue(mtdNet);
        setTrendPoints(grouped);
      } catch (err) {
        console.error("[GoalRevenueVisualBlock] load failed:", err);
        if (cancelled) return;
        setErrorMsg(err?.message || "Failed to load goal and revenue metrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBlockData();
    return () => {
      cancelled = true;
    };
  }, []);

  const progressPctRaw = monthlyGoal > 0 ? (mtdRevenue / monthlyGoal) * 100 : 0;
  const progressPct = Math.max(0, Math.min(100, Math.round(progressPctRaw)));

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const expectedTarget = useMemo(() => {
    if (!daysInMonth) return 0;
    return Math.round((monthlyGoal * dayOfMonth) / daysInMonth);
  }, [monthlyGoal, dayOfMonth, daysInMonth]);

  const nearPace = mtdRevenue >= expectedTarget * 0.95;
  const paceText = mtdRevenue >= expectedTarget ? "On pace" : nearPace ? "Slightly behind" : "Behind pace";
  const paceClass = mtdRevenue >= expectedTarget
    ? "bg-emerald-100 text-emerald-700 ring-emerald-200/80"
    : nearPace
      ? "bg-amber-100 text-amber-700 ring-amber-200/80"
      : "bg-rose-100 text-rose-700 ring-rose-200/80";

  const trendDelta = (trendPoints?.[3]?.v || 0) - (trendPoints?.[2]?.v || 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Goal &amp; revenue visual block</h2>
        </div>
      </div>

      {errorMsg ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
          {errorMsg}
        </div>
      ) : null}

      <div className="rounded-xl border-[2px] border-dashed border-slate-300 bg-slate-50/35 p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-2 pb-4">
              <div className="text-[14px] font-bold uppercase tracking-wide text-black">MONTHLY GOAL PROGRESS</div>
              <span className="shrink-0 rounded-md bg-[#ebecef] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#474e60] ring-1 ring-black/[0.04]">
                THIS MONTH
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-stretch">
              <div className="flex shrink-0 justify-center sm:justify-start">
                {loading ? (
                  shimmer("h-[130px] w-[200px] rounded-xl")
                ) : (
                  <SemiCircleGauge
                    percent={progressPct}
                    strokeColor="#22c55e"
                    labelMain={`${progressPct}%`}
                    labelSub={`of ${formatUsd(monthlyGoal)} goal`}
                  />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 pl-0 sm:pl-2">
                {loading ? (
                  <>
                    {shimmer("h-8 w-48")}
                    {shimmer("h-4 w-44")}
                    {shimmer("h-6 w-28 rounded-xl")}
                  </>
                ) : (
                  <>
                    <div className="text-[24px] font-bold tabular-nums leading-tight text-slate-900">
                      {formatUsd(mtdRevenue)} / {formatUsd(monthlyGoal)}
                    </div>
                    <div className="text-[12px] font-medium text-slate-500">
                      Day {dayOfMonth}/{daysInMonth} • target {formatUsd(expectedTarget)}
                    </div>
                    <div>
                      <span
                        className={cx(
                          "inline-flex w-[150px] rounded-xl px-3 py-0.5 text-[11px] font-bold ring-1",
                          paceClass,
                        )}
                      >
                        {paceText}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-2 pb-3">
              <div className="text-[14px] font-bold uppercase tracking-wide text-black">NET REVENUE TREND</div>
              <span className="shrink-0 rounded-md bg-[#ebecef] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#474e60] ring-1 ring-black/[0.04]">
                LAST 4 WKS
              </span>
            </div>

            <div className="min-h-[100px] flex-1">
              {loading ? (
                shimmer("h-[100px] w-full")
              ) : (
                <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                  <AreaChart
                    data={trendPoints}
                    margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient
                        id={trendGradId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#22c55e"
                          stopOpacity={0.22}
                        />
                        <stop
                          offset="100%"
                          stopColor="#22c55e"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="w" hide />
                    <YAxis hide domain={["dataMin - 800", "dataMax + 800"]} />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#16a34a"
                      strokeWidth={2.5}
                      fill={`url(#${trendGradId})`}
                      dot={false}
                      isAnimationActive
                      animationBegin={120}
                      animationDuration={900}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {loading ? (
              shimmer("mt-2 h-4 w-40")
            ) : (
              <div className="mt-2 text-[12px] font-medium text-slate-500">
                {trendDelta >= 0 ? "+" : "-"}{formatUsd(Math.abs(trendDelta))} vs prior week
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
