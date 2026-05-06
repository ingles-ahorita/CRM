import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "../../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../../utils/dateHelpers";

const TRACK = "#f3f4f6";

const FUNNEL_META = [
  {
    key: "noshow",
    label: "No-shows",
    color: "#8e9aaf",
    tooltip:
      "Confirmed calls that did not show up in this period (cancelled calls excluded). This is the top of the recovery funnel.",
  },
  {
    key: "contacted",
    label: "Contacted",
    color: "#3b82f6",
    tooltip:
      "No-shows marked as contacted (no_show_state = contacted), still within the same date window on the original call.",
  },
  {
    key: "rebooked",
    label: "Rebooked",
    color: "#8b5cf6",
    tooltip:
      "Calls flagged as recovered with a new booking date in this period (re-engaged no-shows).",
  },
  {
    key: "showed",
    label: "Showed up",
    color: "#f59e0b",
    tooltip:
      "Recovered calls where the lead attended (showed_up = true), by call date in this period.",
  },
  {
    key: "closed",
    label: "Closed",
    color: "#10b981",
    tooltip:
      "Sales (outcome yes) tied to a recovered call, counted by purchase date in this period.",
  },
];

/** Label column width matches left/right panels so bar tracks line up visually. */
const LABEL_COL =
  "shrink-0 pt-0.5 text-left text-[12px] font-semibold leading-snug text-[#374151] sm:w-[98px]";
const METRICS_COL =
  "flex w-[46px] shrink-0 flex-col items-end justify-center text-right sm:w-[52px]";
const BAR_H = "min-h-[20px]";
const BAR_INNER_PAD = "pr-2 sm:pr-2.5";

function shimmer(className = "") {
  return (
    <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />
  );
}

function FunnelBarsShimmer() {
  return (
    <div className="flex flex-col gap-[8px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2">
          {shimmer("h-4 w-20")}
          {shimmer("h-5 flex-1")}
          {shimmer("h-4 w-10")}
        </div>
      ))}
    </div>
  );
}

function CloserBarsShimmer() {
  return (
    <div className="flex flex-col gap-[8px]">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-2">
          {shimmer("h-4 w-24")}
          {shimmer("h-3 flex-1")}
          {shimmer("h-4 w-8")}
        </div>
      ))}
    </div>
  );
}

function getRangeBounds(rangeKey) {
  const now = new Date();
  if (rangeKey === "currentWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsUTC(now);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  }
  if (rangeKey === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  }
  if (rangeKey === "lastMonth") {
    const midLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const monthRange = DateHelpers.getMonthRangeInTimezone(midLastMonth, "UTC");
    return {
      start: monthRange.startDate.toISOString(),
      end: monthRange.endDate.toISOString(),
    };
  }
  const monthRange = DateHelpers.getMonthRangeInTimezone(now, "UTC");
  return {
    start: monthRange.startDate.toISOString(),
    end: monthRange.endDate.toISOString(),
  };
}

async function fetchAovData(start, end) {
  const pageSize = 1000;
  let offset = 0;
  const allRows = [];
  for (;;) {
    const { data, error } = await supabase
      .from("outcome_log")
      .select("closer_id, offers!offer_id(price), closers!closer_id(name)")
      .eq("outcome", "yes")
      .not("offer_id", "is", null)
      .gte("purchase_date", start)
      .lte("purchase_date", end)
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
    if (offset > 20000) break;
  }
  
  const byCloser = {};
  let totalPrice = 0, totalCount = 0;
  for (const row of allRows) {
    const price = Number(row.offers?.price ?? 0);
    const name = row.closers?.name ?? "Unknown";
    const id = row.closer_id ?? "unknown";
    if (!byCloser[id]) byCloser[id] = { name, total: 0, count: 0 };
    byCloser[id].total += price;
    byCloser[id].count += 1;
    totalPrice += price;
    totalCount += 1;
  }
  
  const closerList = Object.entries(byCloser)
    .map(([id, c]) => ({ id, name: c.name, aov: c.count > 0 ? c.total / c.count : 0, sales: c.count }))
    .sort((a, b) => b.aov - a.aov);
    
  return { 
    overall: totalCount > 0 ? totalPrice / totalCount : null, 
    byCloser: closerList 
  };
}

function FunnelBarRow({
  label,
  count,
  pctLabel,
  color,
  widthPct,
  animate,
  tooltip,
}) {
  return (
    <div className="flex items-stretch">
      <div className={LABEL_COL} title={tooltip}>
        {label}
      </div>
      <div
        className={`relative ${BAR_H} min-w-0 flex-1 cursor-help self-center`}
        title={`${tooltip}\n\nCount: ${count}`}
      >
        <div
          className="absolute inset-0 rounded-md"
          style={{ backgroundColor: TRACK }}
        />
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-md transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: animate ? `${widthPct}%` : "0%",
            backgroundColor: color,
            maxWidth: "100%",
          }}
        >
          <div
            className={`flex h-full min-w-0 items-center justify-end ${BAR_INNER_PAD} text-white`}
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.22)" }}
          >
            <span className="text-[12px] font-bold tabular-nums leading-none">
              {count}
            </span>
          </div>
        </div>
      </div>
      <div
        className={`${METRICS_COL} cursor-help self-center pt-0.5 text-[12px] font-bold tabular-nums leading-none text-[#374151]`}
        title={tooltip}
      >
        {pctLabel}
      </div>
    </div>
  );
}

function CloserRow({ index, name, aov, sales, maxAov, animate, tooltip }) {
  const widthPct = maxAov > 0 ? (aov / maxAov) * 100 : 0;
  const hasSale = sales > 0;
  const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;

  return (
    <div className="flex items-stretch">
      <div className={LABEL_COL} title={tooltip}>
        {medal ? <span className="mr-1">{medal}</span> : null}{name}
      </div>
      <div
        className="relative h-[12px] min-w-0 flex-1 cursor-help self-center"
        title={tooltip ? `${tooltip}\nAOV: $${Math.round(aov)}` : undefined}
      >
        <div
          className="absolute inset-0 rounded-md"
          style={{ backgroundColor: TRACK }}
        />
        {hasSale ? (
          <div
            className="absolute inset-y-0 left-0 overflow-hidden rounded-md bg-[#10b981] transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: animate ? `${widthPct}%` : "0%", maxWidth: "100%" }}
          />
        ) : null}
      </div>
      <div
        className={`${METRICS_COL} self-center pt-0.5 text-[#374151]`}
        title={tooltip}
      >
        {hasSale ? (
          <>
            <span className="text-[12px] font-bold tabular-nums leading-none">
              ${Math.round(aov).toLocaleString('en-US')}
            </span>
            <span className="mt-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-slate-500">
              {sales} sale{sales !== 1 ? 's' : ''}
            </span>
          </>
        ) : (
          <span className="text-[12px] font-bold tabular-nums leading-none text-[#6b7280]">
            $0
          </span>
        )}
      </div>
    </div>
  );
}

export default function RecoveredLeadsFunnel({ stackPanels = false }) {
  const [range, setRange] = useState("lastWeek");
  const [aovRange, setAovRange] = useState("currentMonth");
  const [loading, setLoading] = useState(true);
  const [aovLoading, setAovLoading] = useState(true);
  const [error, setError] = useState(null);
  const [animateBars, setAnimateBars] = useState(false);
  const [dataTick, setDataTick] = useState(0);
  const [aovTick, setAovTick] = useState(0);

  const [funnelCounts, setFunnelCounts] = useState({
    noshow: 0,
    contacted: 0,
    rebooked: 0,
    showed: 0,
    closed: 0,
  });
  const [aovData, setAovData] = useState({ overall: null, byCloser: [] });

  useEffect(() => {
    let cancelled = false;

    async function loadFunnel() {
      setLoading(true);
      setError(null);
      try {
        const { start, end } = getRangeBounds(range);

        const [
          noShowsRes,
          contactedRes,
          rebookedRes,
          showUpsRes,
          closedRes,
        ] = await Promise.all([
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("showed_up", false)
            .gte("call_date", start)
            .lte("call_date", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("no_show_state", "contacted")
            .gte("call_date", start)
            .lte("call_date", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("recovered", true)
            .gte("book_date", start)
            .lte("book_date", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("recovered", true)
            .eq("showed_up", true)
            .gte("call_date", start)
            .lte("call_date", end),
          supabase
            .from("outcome_log")
            .select("id, calls!inner!call_id(id)", { count: "exact", head: true })
            .eq("outcome", "yes")
            .eq("calls.recovered", true)
            .not("purchase_date", "is", null)
            .gte("purchase_date", start)
            .lte("purchase_date", end),
        ]);

        if (cancelled) return;

        setFunnelCounts({
          noshow: noShowsRes.count ?? 0,
          contacted: contactedRes.count ?? 0,
          rebooked: rebookedRes.count ?? 0,
          showed: showUpsRes.count ?? 0,
          closed: closedRes.count ?? 0,
        });

        setDataTick((t) => t + 1);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load recovery funnel");
          setFunnelCounts({
            noshow: 0,
            contacted: 0,
            rebooked: 0,
            showed: 0,
            closed: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFunnel();
    return () => { cancelled = true; };
  }, [range]);

  useEffect(() => {
    let cancelled = false;

    async function loadAov() {
      setAovLoading(true);
      try {
        const { start, end } = getRangeBounds(aovRange);
        const aovRes = await fetchAovData(start, end);
        if (cancelled) return;
        setAovData(aovRes);
        setAovTick((t) => t + 1);
      } catch (e) {
        if (!cancelled) {
          setAovData({ overall: null, byCloser: [] });
        }
      } finally {
        if (!cancelled) setAovLoading(false);
      }
    }

    loadAov();
    return () => { cancelled = true; };
  }, [aovRange]);

  useEffect(() => {
    if (loading && aovLoading) return;
    setAnimateBars(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimateBars(true));
    });
    return () => cancelAnimationFrame(id);
  }, [loading, aovLoading, dataTick, aovTick]);

  const base = funnelCounts.noshow;
  const funnelSteps = useMemo(
    () =>
      FUNNEL_META.map((m) => ({
        ...m,
        count: funnelCounts[m.key] ?? 0,
      })),
    [funnelCounts],
  );


  return (
    <div className="w-full min-w-0 border border-slate-200 rounded-2xl bg-white p-3">
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-[18px] font-bold tracking-tight text-[#374151]">
            Recovered leads funnel
          </h2>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {error}
        </div>
      ) : null}

      <div
        className={
          stackPanels
            ? "grid grid-cols-1 gap-2"
            : "grid grid-cols-1 gap-2 lg:grid-cols-2"
        }
      >
        <section className="min-w-0 rounded-xl border bg-white p-3">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-[14px] font-bold uppercase tracking-[0.14em] text-[#374151]">
              Recovery funnel
            </h3>
            <div className="relative shrink-0">
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                aria-label="Funnel period"
                aria-busy={loading}
                className="h-7 cursor-pointer appearance-none rounded-full border border-slate-200/90 bg-[#f3f4f6] py-1 pl-3 pr-7 text-[10px] font-bold uppercase tracking-wide text-[#4b5563] !outline-none transition-colors hover:bg-[#eceff2]"
              >
                <option value="lastWeek">Last week</option>
                <option value="currentWeek">This week</option>
                <option value="lastMonth">Last month</option>
                <option value="currentMonth">This month</option>
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
            </div>
          </div>
          {loading ? (
            <FunnelBarsShimmer />
          ) : (
            <div className="flex flex-col gap-[8px]">
              {funnelSteps.map((step) => {
                const pct =
                  base > 0 ? Math.round((step.count / base) * 100) : 0;
                const widthPct = base > 0 ? (step.count / base) * 100 : 0;
                return (
                  <FunnelBarRow
                    key={step.key}
                    label={step.label}
                    count={step.count}
                    pctLabel={`${pct}%`}
                    color={step.color}
                    widthPct={widthPct}
                    animate={animateBars}
                    tooltip={step.tooltip}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-xl border bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-[14px] font-bold uppercase tracking-[0.12em] text-black">
              AOV by closer
            </h3>
            <div className="relative shrink-0">
              <select
                value={aovRange}
                onChange={(e) => setAovRange(e.target.value)}
                aria-label="AOV period"
                aria-busy={aovLoading}
                className="h-7 cursor-pointer appearance-none rounded-full border border-slate-200/90 bg-[#f3f4f6] py-1 pl-3 pr-7 text-[10px] font-bold uppercase tracking-wide text-[#4b5563] !outline-none transition-colors hover:bg-[#eceff2]"
              >
                <option value="lastWeek">Last week</option>
                <option value="currentWeek">This week</option>
                <option value="lastMonth">Last month</option>
                <option value="currentMonth">This month</option>
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
            </div>
          </div>
          {!aovLoading && aovData.overall != null && (
            <div className="mb-4 text-[12px] font-semibold text-slate-500">
              Overall: <span className="text-[15px] font-bold text-slate-900">${Math.round(aovData.overall).toLocaleString('en-US')}</span>
            </div>
          )}
          {aovLoading ? (
            <CloserBarsShimmer />
          ) : (
            <div className="flex flex-col gap-[8px]">
              {aovData.byCloser.length === 0 ? (
                <p className="text-center text-[13px] text-slate-500">
                  No sales with offers in this period.
                </p>
              ) : (
                aovData.byCloser.map((c, idx) => (
                  <CloserRow
                    key={String(c.id)}
                    index={idx}
                    name={c.name}
                    aov={c.aov}
                    sales={c.sales}
                    maxAov={Math.max(...aovData.byCloser.map(x => x.aov), 1)}
                    animate={animateBars}
                    tooltip="Average Order Value"
                  />
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
