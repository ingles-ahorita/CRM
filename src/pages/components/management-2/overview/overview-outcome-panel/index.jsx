import React, { useEffect, useMemo, useState } from "react";
import SegmentedTabs from "../../segmented-tabs";
import SectionInfoHint from "../section-info-hint";
import { supabase } from "../../../../../lib/supabaseClient";
import {
  TIME_RANGE_ITEMS,
  getRangeBounds,
  normalizeCustomBounds,
} from "../overview-range-helpers";

const METRICS = [
  {
    key: "sales",
    label: "Sales",
    color: "#ea580c",
  },
  {
    key: "recoveries",
    label: "Recoveries",
    color: "#059669",
  },
  {
    key: "pifs",
    label: "PIFs",
    color: "#2563eb",
  },
  {
    key: "payoffs",
    label: "Payoffs",
    color: "#7c3aed",
  },
];

const TRACK = "#f1f5f9";

function shimmer(className = "") {
  return (
    <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />
  );
}

async function fetchAllSalesRows(startISO, endISO) {
  const pageSize = 1000;
  let offset = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from("outcome_log")
      .select(
        "PIF, purchase_date, closers(name), offers!offer_id(installments)",
      )
      .eq("outcome", "yes")
      .not("purchase_date", "is", null)
      .gte("purchase_date", startISO)
      .lte("purchase_date", endISO)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function closerBreakdown(rows) {
  const map = {};
  for (const row of rows) {
    const name = row?.closers?.name?.trim() || "—";
    map[name] = (map[name] || 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => `${count} ${name}`)
    .join(" · ");
}

function buildTooltip(metricKey, data, mixPct) {
  const { value, breakdown, salesTotal } = data;
  const mixLine =
    mixPct != null ? `${mixPct}% of these four totals` : "";
  if (metricKey === "sales") {
    const main = breakdown ? `${value} sales — ${breakdown}` : `${value} closed sales`;
    return mixLine ? `${main} · ${mixLine}` : main;
  }
  if (metricKey === "recoveries") {
    const main = `${value} no-shows rebooked`;
    return mixLine ? `${main} · ${mixLine}` : main;
  }
  if (metricKey === "pifs") {
    const ofSales =
      salesTotal > 0
        ? `${Math.round((value / salesTotal) * 100)}% of sales`
        : null;
    const main = ofSales
      ? `${value} paid in full (${ofSales})`
      : `${value} paid in full`;
    return mixLine ? `${main} · ${mixLine}` : main;
  }
  const ofSales =
    salesTotal > 0
      ? `${Math.round((value / salesTotal) * 100)}% of sales`
      : null;
  const main = ofSales
    ? `${value} paid off (${ofSales})`
    : `${value} paid off`;
  return mixLine ? `${main} · ${mixLine}` : main;
}

function MetricRow({
  metric,
  data,
  loading,
  maxValue,
  mixPct,
  onBarHover,
  onBarLeave,
}) {
  const widthPct =
    maxValue > 0 ? Math.max(2, (data.value / maxValue) * 100) : 0;
  const tip = buildTooltip(metric.key, data, mixPct);

  const showBarTip = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onBarHover({
      text: tip,
      x: r.left + r.width / 2,
      y: r.top,
    });
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          {metric.label}
        </span>
        {loading ? (
          shimmer("h-4 w-16")
        ) : (
          <div
            className="flex shrink-0 items-baseline gap-1.5"
            title={tip}
          >
            <span className="text-[14px] font-bold tabular-nums leading-none text-slate-900">
              {data.value}
            </span>
            <span
              className="text-[11px] font-semibold tabular-nums text-slate-500"
              aria-hidden
            >
              ·
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-slate-500">
              {mixPct}%
            </span>
          </div>
        )}
      </div>
      <div
        className="relative -my-1.5 cursor-default py-1.5"
        onMouseLeave={onBarLeave}
        onMouseEnter={loading ? undefined : showBarTip}
        onMouseMove={loading ? undefined : showBarTip}
      >
        <div
          className="relative h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: TRACK }}
        >
          {loading ? (
            shimmer("absolute inset-0 rounded-full")
          ) : data.value > 0 ? (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: `${widthPct}%`,
                backgroundColor: metric.color,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const EMPTY_DATA = {
  sales: { value: 0, breakdown: "", salesTotal: 0 },
  recoveries: { value: 0, breakdown: "", salesTotal: 0 },
  pifs: { value: 0, breakdown: "", salesTotal: 0 },
  payoffs: { value: 0, breakdown: "", salesTotal: 0 },
};

export default function OverviewOutcomePanel() {
  const [range, setRange] = useState("mtd");
  const customFallback = useMemo(() => getRangeBounds("custom"), []);
  const [customStart, setCustomStart] = useState(
    () => customFallback.start.toISOString().slice(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(
    () => customFallback.end.toISOString().slice(0, 10),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(EMPTY_DATA);
  const [barTip, setBarTip] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError(null);

      try {
        const { start, end } =
          range === "custom"
            ? normalizeCustomBounds(customStart, customEnd)
            : getRangeBounds(range);
        const startISO = start.toISOString();
        const endISO = end.toISOString();

        const [salesRows, recoveriesRes] = await Promise.all([
          fetchAllSalesRows(startISO, endISO),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("recovered", true)
            .neq("cancelled", true)
            .gte("book_date", startISO)
            .lte("book_date", endISO),
        ]);

        if (recoveriesRes.error) throw recoveriesRes.error;

        const salesTotal = salesRows.length;
        const pifs = salesRows.filter(
          (row) =>
            row?.offers?.installments != null &&
            Number(row.offers.installments) === 0,
        ).length;
        const payoffs = salesRows.filter(
          (row) => row?.PIF === true || row?.PIF === "true",
        ).length;
        if (cancelled) return;

        setData({
          sales: {
            value: salesTotal,
            breakdown: closerBreakdown(salesRows),
            salesTotal,
          },
          recoveries: {
            value: recoveriesRes.count ?? 0,
            breakdown: "",
            salesTotal: 0,
          },
          pifs: {
            value: pifs,
            breakdown: "",
            salesTotal,
          },
          payoffs: {
            value: payoffs,
            breakdown: "",
            salesTotal,
          },
        });
      } catch (e) {
        if (!cancelled) {
          console.error("[OverviewOutcomePanel]", e);
          setError(e?.message || "Failed to load metrics");
          setData(EMPTY_DATA);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [range, customStart, customEnd]);

  const maxValue = useMemo(
    () => Math.max(...METRICS.map((m) => data[m.key]?.value ?? 0), 1),
    [data],
  );

  const mixTotal = useMemo(
    () => METRICS.reduce((sum, m) => sum + (data[m.key]?.value ?? 0), 0),
    [data],
  );

  const mixPctByKey = useMemo(() => {
    const t = mixTotal > 0 ? mixTotal : 1;
    return Object.fromEntries(
      METRICS.map((m) => [
        m.key,
        Math.round(((data[m.key]?.value ?? 0) / t) * 100),
      ]),
    );
  }, [data, mixTotal]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="mb-2 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-[18px] font-bold tracking-tight text-[#374151]">
            Outcome Snapshot
          </h2>
          <SectionInfoHint text="Counts for sales, recovered leads, paid-in-full deals, and payoffs in the period you select." />
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
        <div className="mb-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {METRICS.map((metric) => (
          <MetricRow
            key={metric.key}
            metric={metric}
            data={data[metric.key]}
            loading={loading}
            maxValue={maxValue}
            mixPct={mixPctByKey[metric.key] ?? 0}
            onBarHover={setBarTip}
            onBarLeave={() => setBarTip(null)}
          />
        ))}
      </div>

      <div className="mt-2.5 border-t border-slate-100 pt-2.5">
        <ul
          className="flex list-none flex-wrap gap-x-3 gap-y-1.5"
          aria-label="Colors used in the rows above"
        >
          {METRICS.map((metric) => (
            <li
              key={metric.key}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"
              title={
                loading
                  ? undefined
                  : buildTooltip(
                      metric.key,
                      data[metric.key],
                      mixPctByKey[metric.key],
                    )
              }
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
                style={{ backgroundColor: metric.color }}
                aria-hidden
              />
              <span>{metric.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {barTip ? (
        <div
          className="pointer-events-none fixed z-[100] max-w-[14rem] -translate-x-1/2 -translate-y-full rounded-md border border-slate-700/80 bg-slate-900 px-2 py-1.5 text-[10px] font-medium leading-snug text-slate-100 shadow-lg"
          style={{
            left: barTip.x,
            top: Math.max(8, barTip.y - 6),
          }}
        >
          {barTip.text}
        </div>
      ) : null}
    </div>
  );
}
