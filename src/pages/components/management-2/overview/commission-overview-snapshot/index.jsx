import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../../lib/supabaseClient";
import * as DateHelpers from "../../../../../utils/dateHelpers";
import { getCloserCommissionBreakdown } from "../../../../../lib/closerCommission";
import { getAllSettersMonthlyCommission } from "../../../../../lib/setterCommission";

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
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ">
        {shimmer("h-4 w-48")}
        {shimmer("h-8 w-32 rounded-full")}
      </div>
      {shimmer("h-11 w-full rounded-lg sm:h-[46px]")}
      <div className="mt-5 flex gap-x-3 gap-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2"> 
            {shimmer("h-3 w-3 rounded-[3px]")}
            {shimmer("h-4 w-28")}
          </div>
        ))}
      </div>
    </div>
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

export default function CommissionOverviewSnapshot() {
  const monthKey = useMemo(() => {
    const ym = DateHelpers.getYearMonthInTimezone(
      new Date(),
      DateHelpers.DEFAULT_TIMEZONE,
    );
    return (
      ym?.monthKey ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [animate, setAnimate] = useState(false);
  const [dataTick, setDataTick] = useState(0);
  const [segments, setSegments] = useState([]);

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

  return (
    <div className="border border-slate-200 rounded-2xl p-3 bg-white">
      <div className="mb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-[18px] font-bold tracking-tight text-[#374151]">
            Commission overview snapshot
          </h2>
        </div>
        <p className="mt-1 text-[12px] font-medium text-slate-500">
          {monthLabel} · same rules as monthly commission overview
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <CommissionSnapshotShimmer />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[10px] font-semibold uppercase text-black">
              Commission split this month
            </h3>
            <span className="inline-flex w-fit shrink-0 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-[11px] font-bold tabular-nums tracking-tight text-[#374151]">
              TOTAL {formatUsd(total)}
            </span>
          </div>

          {segments.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-500">
              No commission recorded for this month yet.
            </p>
          ) : (
            <>
              <div className="flex h-11 w-full overflow-hidden rounded-lg sm:h-[46px]">
                {segments.map((s) => {
                  const pct = total > 0 ? (s.amount / total) * 100 : 0;
                  const barLabel = Math.round(s.amount);
                  const tooltipText =
                    s.kind === "setters"
                      ? [
                          `Setters — ${formatUsdFull(s.amount)}`,
                          `All active setters: $${String(4)}/show-up + $${String(25)}/purchase (${DateHelpers.DEFAULT_TIMEZONE})`,
                          `${(s.setterRows || []).length} setter(s) in rollup`,
                        ].join("\n")
                      : closerTooltip(s.name, s.breakdown);

                  return (
                    <div
                      key={s.key}
                      className="flex min-w-0 shrink-0 cursor-help items-center justify-center overflow-hidden px-0.5 text-[11px] font-bold tabular-nums text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:text-[12px]"
                      style={{
                        width: animate ? `${pct}%` : "0%",
                        backgroundColor: s.color,
                        transition:
                          "width 1.05s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                      title={tooltipText}
                    >
                      {pct >= 7 ? (
                        <span className="whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.28)]">
                          {barLabel}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <ul className="mt-3 flex list-none flex-wrap gap-x-3 gap-y-2">
                {segments.map((s) => (
                  <li
                    key={s.key}
                    className="flex cursor-help items-center gap-1 text-[12px] text-[#374151]"
                    title={
                      s.kind === "setters"
                        ? [
                            `Setters — ${formatUsdFull(s.amount)}`,
                            `Roll-up of all active setters for ${monthKey}`,
                          ].join("\n")
                        : closerTooltip(s.name, s.breakdown)
                    }
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                    <span className="font-semibold whitespace-nowrap">
                      {s.name}{" "}
                      <span className="font-bold tabular-nums text-neutral-900">
                        {formatUsd(s.amount)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
