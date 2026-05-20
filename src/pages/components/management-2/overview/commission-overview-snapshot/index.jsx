import React, { useEffect, useMemo, useState } from "react";
import SegmentedTabs from "../../segmented-tabs";
import SectionInfoHint from "../section-info-hint";
import { supabase } from "../../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../../utils/dateHelpers";
import { getCloserCommissionBreakdown } from "../../../../../lib/closerCommission";
import { getAllSettersMonthlyCommission } from "../../../../../lib/setterCommission";
import {
  TIME_RANGE_ITEMS,
  getRangeBounds,
  normalizeCustomBounds,
} from "../overview-range-helpers";

const SETTERS_COLOR = "#F59E0B";

const CLOSER_PALETTE = [
  "#2563EB",
  "#16A34A",
  "#DB2777",
  "#7C3AED",
  "#0EA5E9",
  "#EA580C",
  "#059669",
  "#BE185D",
];

function formatUsd(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function formatUsdFull(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function shimmer(className = "") {
  return (
    <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />
  );
}

function CommissionSnapshotShimmer() {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        {shimmer("h-3 w-36")}
        {shimmer("h-6 w-24 rounded-full")}
      </div>
      {shimmer("h-9 w-full rounded-lg")}
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            {shimmer("h-2.5 w-2.5 rounded-[3px]")}
            {shimmer("h-3.5 w-24")}
          </div>
        ))}
      </div>
    </>
  );
}

function closerTooltip(name, b) {
  const lines = [
    `${name} — ${formatUsdFull(b.total)}`,
    `Base ${formatUsdFull(b.base)} · Payoff Δ ${formatUsdFull(b.payoffIncrements)} · 2nd inst. ${formatUsdFull(b.secondInstallments)}`,
    `Refunds (same month) ${formatUsdFull(b.sameMonthRefunds)} · Refunds (prev.) ${formatUsdFull(b.refunds)}`,
  ];
  return lines.join("\n");
}

function segmentTooltipText(s, monthLabel) {
  if (s.kind === "setters") {
    return [
      `Setters — ${formatUsdFull(s.amount)}`,
      `$4 / show-up + $25 / purchase · ${monthLabel}`,
      `${(s.setterRows || []).length} setter(s) in rollup`,
    ].join("\n");
  }
  return closerTooltip(s.name, s.breakdown);
}

export default function CommissionOverviewSnapshot() {
  const [range, setRange] = useState("mtd");
  const customFallback = useMemo(() => getRangeBounds("custom"), []);
  const [customStart, setCustomStart] = useState(
    () => customFallback.start.toISOString().slice(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(
    () => customFallback.end.toISOString().slice(0, 10),
  );

  const effectiveBounds = useMemo(() => {
    if (range === "custom") {
      return normalizeCustomBounds(customStart, customEnd);
    }
    return getRangeBounds(range);
  }, [range, customStart, customEnd]);

  /** Commission rollups are calendar-month based; map each filter to a YYYY-MM. */
  const monthKey = useMemo(() => {
    const { start, end } = effectiveBounds;
    const anchor = range === "lastWeek" ? end : start;
    const ym = DateHelpers.getYearMonthInTimezone(
      anchor,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    return (
      ym?.monthKey ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
    );
  }, [effectiveBounds, range]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [animate, setAnimate] = useState(false);
  const [dataTick, setDataTick] = useState(0);
  const [segments, setSegments] = useState([]);
  const [barTip, setBarTip] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: closers, error: closersErr } = await supabase
          .from("closers")
          .select("id, name")
          .eq("active", true)
          .order("name", { ascending: true });

        if (closersErr) throw closersErr;

        const [setterRows, ...closerBreakdowns] = await Promise.all([
          getAllSettersMonthlyCommission(monthKey),
          ...(closers || []).map((c) =>
            getCloserCommissionBreakdown(c.id, monthKey).then((b) => ({
              id: c.id,
              name: c.name?.trim() || `Closer ${c.id}`,
              ...b,
            })),
          ),
        ]);

        if (cancelled) return;

        const setterGrandTotal = (setterRows || []).reduce(
          (s, r) => s + (Number(r.total) || 0),
          0,
        );

        const closerWithAmount = closerBreakdowns
          .map((row, idx) => ({
            key: `closer-${row.id}`,
            kind: "closer",
            id: row.id,
            name: row.name,
            amount: Math.max(0, Number(row.total) || 0),
            color: CLOSER_PALETTE[idx % CLOSER_PALETTE.length],
            breakdown: row,
          }))
          .filter((r) => r.amount > 0)
          .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

        const nextSegments = [...closerWithAmount];
        if (setterGrandTotal > 0) {
          nextSegments.push({
            key: "setters-all",
            kind: "setters",
            name: "Setters",
            amount: setterGrandTotal,
            color: SETTERS_COLOR,
            setterRows: setterRows || [],
          });
        }

        setSegments(nextSegments);
        setDataTick((t) => t + 1);
      } catch (e) {
        if (!cancelled) {
          console.error("[CommissionOverviewSnapshot]", e);
          setError(e?.message || "Failed to load commission data");
          setSegments([]);
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
  }, [monthKey]);

  useEffect(() => {
    if (loading) return;
    setAnimate(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimate(true));
    });
    return () => cancelAnimationFrame(id);
  }, [loading, dataTick]);

  const total = useMemo(
    () => segments.reduce((acc, s) => acc + s.amount, 0),
    [segments],
  );

  const monthLabel = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: DateHelpers.DEFAULT_TIMEZONE,
    });
  }, [monthKey]);

  const monthShort = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: DateHelpers.DEFAULT_TIMEZONE,
    });
  }, [monthKey]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="mb-2 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-[18px] font-bold leading-tight tracking-tight text-[#374151]">
            Commission overview snapshot
          </h2>
          <SectionInfoHint text="How this month's closer and setter payouts split—each person's share of total commission." />
        </div>
        <div className="mb-2 min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
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
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none sm:min-w-[9.5rem]"
              aria-label="Custom range start"
            />
            <span className="text-[10px] font-semibold text-slate-500">–</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none sm:min-w-[9.5rem]"
              aria-label="Custom range end"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <CommissionSnapshotShimmer />
      ) : segments.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-slate-500">
          No commission for {monthShort} yet.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
              <span className="text-slate-500">Split</span>
              <span className="mx-1 text-slate-300" aria-hidden>
                ·
              </span>
              <span className="text-slate-800">{monthShort}</span>
            </p>
            <span className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-800">
              {formatUsd(total)}
            </span>
          </div>

          <div
            className="relative flex h-9 w-full gap-px overflow-hidden rounded-lg bg-slate-200/80 p-px"
            onMouseLeave={() => setBarTip(null)}
          >
            {segments.map((s) => {
              const pct = total > 0 ? (s.amount / total) * 100 : 0;
              const tip = segmentTooltipText(s, monthLabel);
              const showInBar = pct >= 10;

              return (
                <div
                  key={s.key}
                  role="img"
                  aria-label={`${s.name}, ${formatUsd(s.amount)}, ${pct.toFixed(1)} percent of total`}
                  className="relative flex min-w-0 shrink-0 cursor-default items-center justify-center overflow-hidden px-0.5 text-[10px] font-bold tabular-nums text-white transition-[width,filter] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] first:rounded-l-[7px] last:rounded-r-[7px] hover:z-10 hover:brightness-110"
                  style={{
                    width: animate ? `${pct}%` : "0%",
                    backgroundColor: s.color,
                  }}
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setBarTip({
                      text: tip,
                      pct: pct.toFixed(1),
                      x: r.left + r.width / 2,
                      y: r.top,
                    });
                  }}
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setBarTip((prev) =>
                      prev
                        ? {
                            ...prev,
                            x: r.left + r.width / 2,
                            y: r.top,
                          }
                        : null,
                    );
                  }}
                >
                  {showInBar ? (
                    <span className="pointer-events-none whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
                      {formatUsd(s.amount)}
                    </span>
                  ) : (
                    <span
                      className="pointer-events-none h-1 w-1 rounded-full bg-white/90"
                      aria-hidden
                    />
                  )}
                </div>
              );
            })}
          </div>

          {barTip ? (
            <div
              className="pointer-events-none fixed z-[100] max-w-[min(16rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-full rounded-md border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-left text-[10px] font-medium leading-snug text-white shadow-lg"
              style={{
                left: barTip.x,
                top: Math.max(8, barTip.y - 6),
              }}
            >
              <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                {barTip.pct}% of payout
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[11px] leading-snug text-slate-100">
                {barTip.text}
              </pre>
            </div>
          ) : null}

          <ul className="mt-2 grid list-none grid-cols-2 gap-x-2 gap-y-1.5">
            {segments.map((s) => (
              <li
                key={s.key}
                className="flex min-w-0 cursor-default items-center gap-1.5 text-[11px] text-slate-700"
                title={segmentTooltipText(s, monthLabel)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate font-semibold">
                  {s.name}
                  <span className="ml-1 font-bold tabular-nums text-slate-900">
                    {formatUsd(s.amount)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
