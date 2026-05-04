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
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
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
  if (rangeKey === "this_week") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsUTC(now);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  }
  if (rangeKey === "last_week") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  }
  const monthRange = DateHelpers.getMonthRangeInTimezone(now, "UTC");
  return {
    start: monthRange.startDate.toISOString(),
    end: monthRange.endDate.toISOString(),
  };
}

async function fetchClosedFromRecoveryCounts(start, end) {
  const pageSize = 1000;
  let offset = 0;
  const counts = {};
  for (;;) {
    const { data, error } = await supabase
      .from("outcome_log")
      .select("closer_id, calls!inner!call_id(closer_id, recovered)")
      .eq("outcome", "yes")
      .eq("calls.recovered", true)
      .gte("purchase_date", start)
      .lte("purchase_date", end)
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const r of data) {
      const cid = r.closer_id ?? r.calls?.closer_id;
      if (cid == null) continue;
      const k = String(cid);
      counts[k] = (counts[k] || 0) + 1;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
    if (offset > 20000) break;
  }
  return counts;
}

function FunnelBarRow({ label, count, pctLabel, color, widthPct, animate, tooltip }) {
  return (
    <div className="flex items-stretch">
      <div className={LABEL_COL} title={tooltip}>
        {label}
      </div>
      <div
        className={`relative ${BAR_H} min-w-0 flex-1 cursor-help self-center`}
        title={`${tooltip}\n\nCount: ${count}`}
      >
        <div className="absolute inset-0 rounded-md" style={{ backgroundColor: TRACK }} />
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
            <span className="text-[12px] font-bold tabular-nums leading-none">{count}</span>
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

function CloserRow({ name, count, maxCount, animate, tooltip }) {
  const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const hasSale = count > 0;

  return (
    <div className="flex items-stretch">
      <div className={LABEL_COL} title={tooltip}>
        {name}
      </div>
      <div
        className="relative h-[12px] min-w-0 flex-1 cursor-help self-center"
        title={tooltip ? `${tooltip}\nClosed: ${count}` : undefined}
      >
        <div className="absolute inset-0 rounded-md" style={{ backgroundColor: TRACK }} />
        {hasSale ? (
          <div
            className="absolute inset-y-0 left-0 overflow-hidden rounded-md bg-[#10b981] transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: animate ? `${widthPct}%` : "0%", maxWidth: "100%" }}
          />
        ) : null}
      </div>
      <div className={`${METRICS_COL} self-center pt-0.5 text-[#374151]`} title={tooltip}>
        {hasSale ? (
          <>
            <span className="text-[12px] font-bold tabular-nums leading-none">{count}</span>
            <span className="mt-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-black">
              closed
            </span>
          </>
        ) : (
          <span className="text-[12px] font-bold tabular-nums leading-none text-[#6b7280]">0</span>
        )}
      </div>
    </div>
  );
}

export default function RecoveredLeadsFunnel() {
  const [range, setRange] = useState("last_week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [animateBars, setAnimateBars] = useState(false);
  const [dataTick, setDataTick] = useState(0);

  const [funnelCounts, setFunnelCounts] = useState({
    noshow: 0,
    contacted: 0,
    rebooked: 0,
    showed: 0,
    closed: 0,
  });
  const [closerRows, setCloserRows] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { start, end } = getRangeBounds(range);

        const [
          noShowsRes,
          contactedRes,
          rebookedRes,
          showUpsRes,
          closedByCloser,
          closersRes,
        ] = await Promise.all([
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("confirmed", true)
            .eq("showed_up", false)
            .neq("cancelled", true)
            .gte("call_date", start)
            .lte("call_date", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("no_show_state", "contacted")
            .eq("confirmed", true)
            .eq("showed_up", false)
            .neq("cancelled", true)
            .gte("call_date", start)
            .lte("call_date", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("recovered", true)
            .neq("cancelled", true)
            .gte("book_date", start)
            .lte("book_date", end),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("recovered", true)
            .eq("showed_up", true)
            .neq("cancelled", true)
            .gte("call_date", start)
            .lte("call_date", end),
          fetchClosedFromRecoveryCounts(start, end),
          supabase
            .from("closers")
            .select("id, name")
            .eq("active", true)
            .order("name", { ascending: true }),
        ]);

        if (cancelled) return;

        const closedTotal = Object.values(closedByCloser).reduce((a, n) => a + n, 0);

        setFunnelCounts({
          noshow: noShowsRes.count ?? 0,
          contacted: contactedRes.count ?? 0,
          rebooked: rebookedRes.count ?? 0,
          showed: showUpsRes.count ?? 0,
          closed: closedTotal,
        });

        const closersData = closersRes.error ? [] : closersRes.data || [];
        let rows = closersData.map((c) => ({
          id: c.id,
          name: c.name?.trim() || `Closer ${c.id}`,
          count: closedByCloser[String(c.id)] ?? 0,
        }));

        if (!rows.length) {
          rows = Object.entries(closedByCloser).map(([id, count]) => ({
            id,
            name: `Closer ${id}`,
            count,
          }));
          rows.sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
        } else {
          rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        }

        setCloserRows(rows);
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
          setCloserRows([]);
          setDataTick((t) => t + 1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  useEffect(() => {
    if (loading) return;
    setAnimateBars(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimateBars(true));
    });
    return () => cancelAnimationFrame(id);
  }, [loading, dataTick]);

  const base = funnelCounts.noshow;
  const funnelSteps = useMemo(
    () =>
      FUNNEL_META.map((m) => ({
        ...m,
        count: funnelCounts[m.key] ?? 0,
      })),
    [funnelCounts],
  );

  const closerMax = Math.max(...closerRows.map((c) => c.count), 1);

  const closerTooltip =
    "Purchases in this period where the linked call is marked recovered (team-wide).";

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-6 pt-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
      <div className="mb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-xl font-bold leading-tight tracking-tight text-neutral-900">
            Recovered leads funnel
          </h2>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="min-w-0 rounded-xl border bg-white p-4">
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
                  <option value="last_week">LAST WEEK</option>
                  <option value="this_week">THIS WEEK</option>
                  <option value="mtd">MTD</option>
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
                  const pct = base > 0 ? Math.round((step.count / base) * 100) : 0;
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

          <section className="min-w-0 rounded-xl border bg-white p-4">
            <h3 className="mb-5 text-[14px] font-bold uppercase tracking-[0.12em] text-black">
              Closed-from-recovery by closer
            </h3>
            {loading ? (
              <CloserBarsShimmer />
            ) : (
              <div className="flex flex-col gap-[8px]">
                {closerRows.length === 0 ? (
                  <p className="text-center text-[13px] text-slate-500">
                    No closed-from-recovery sales in this period.
                  </p>
                ) : (
                  closerRows.map((c) => (
                    <CloserRow
                      key={String(c.id)}
                      name={c.name}
                      count={c.count}
                      maxCount={closerMax}
                      animate={animateBars}
                      tooltip={closerTooltip}
                    />
                  ))
                )}
              </div>
            )}
            <p className="mt-4 text-[11px] font-normal leading-relaxed tracking-tight text-[#9ca3af]">
              Recovered = no-shows that converted to a closed deal.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
