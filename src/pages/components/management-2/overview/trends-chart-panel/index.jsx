import React, { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

function PillBadge({ children, className }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ring-1 ring-inset", className)}>
      {children}
    </span>
  );
}

const ACTIVE = "bg-sky-100 text-blue-700 ring-sky-200";
const INACTIVE = "bg-white text-slate-500 ring-slate-200/90 hover:bg-slate-50";

const PERIOD_FILTERS = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "mtd", label: "MTD" },
];
const SPLIT_FILTERS = [
  { id: "all", label: "Split: All" },
  { id: "organic", label: "Split: Organic" },
  { id: "ads", label: "Split: Ads" },
];
const METRIC_FILTERS = [
  { id: "showup", label: "Show up %", color: "#28a745", legend: "Show-up %" },
  { id: "conversion", label: "Conversion %", color: "#6f42c1", legend: "Conversion %" },
  { id: "pif", label: "PIF %", color: "#fd7e14", legend: "PIF %" },
  { id: "pickup", label: "Pick-up %", color: "#0d9488", legend: "Pick-up %" },
];

function ToggleRow({ items, activeId, onChange }) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/60 p-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cx("rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-inset transition !outline-none", item.id === activeId ? ACTIVE : INACTIVE)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function MetricToggleRow({ activeSet, onToggle }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/60 p-1">
      {METRIC_FILTERS.map((item) => {
        const on = activeSet.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={cx("rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-inset transition !outline-none", on ? ACTIVE : INACTIVE)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function shimmer(className = "") {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function dayLabel(iso, period) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (period === "7d") {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

export default function TrendsChartPanel() {
  const [period, setPeriod] = useState("7d");
  const [splitBy, setSplitBy] = useState("all");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [seriesRows, setSeriesRows] = useState([]);
  const [metricsOn, setMetricsOn] = useState(() => new Set(["showup", "conversion", "pif"]));

  useEffect(() => {
    let cancelled = false;
    async function loadSeries() {
      setLoading(true);
      setErrorMsg("");
      try {
        const now = new Date();
        const days = period === "30d" ? 30 : period === "mtd" ? now.getUTCDate() : 7;
        const res = await fetch(`/api/management-series?days=${days}`);
        if (!res.ok) throw new Error(`API failed (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        setSeriesRows(Array.isArray(json?.series) ? json.series : []);
      } catch (e) {
        if (cancelled) return;
        setSeriesRows([]);
        setErrorMsg(e?.message || "Failed to load trends");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSeries();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const toggleMetric = (id) => {
    setMetricsOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const chartRows = useMemo(() => {
    return (seriesRows || []).map((r) => {
      const showRaw = splitBy === "organic"
        ? Number(r?.showUpRateOrganic ?? 0)
        : splitBy === "ads"
          ? Number(r?.showUpRateAds ?? 0)
          : Number(r?.showUpRate ?? 0);
      const conversionRaw = Number(r?.totalShowedUp || 0) > 0
        ? (Number(r?.totalPurchased || 0) / Number(r.totalShowedUp)) * 100
        : 0;
      const pifRaw = Number(r?.calls || 0) > 0
        ? (Number(r?.totalPurchasedByCallDate || 0) / Number(r.calls)) * 100
        : 0;
      const pickupRaw = Number(r?.bookings || 0) > 0
        ? (Number(r?.totalConfirmed || 0) / Number(r.bookings)) * 100
        : 0;
      return {
        label: dayLabel(r?.date || "", period),
        showup: clampPct(showRaw),
        conversion: clampPct(conversionRaw),
        pif: clampPct(pifRaw),
        pickup: clampPct(pickupRaw),
      };
    });
  }, [seriesRows, splitBy, period]);

  const chartData = useMemo(() => {
    const datasets = METRIC_FILTERS.map((m) => ({
      label: m.legend,
      data: chartRows.map((r) => Number(r?.[m.id] || 0)),
      borderColor: m.color,
      backgroundColor: "transparent",
      // Small tension + extra y-axis headroom avoids curves/markers clipping off the top.
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 3.5,
      pointHoverRadius: 5,
      pointBackgroundColor: m.color,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 1.2,
      clip: false,
      hidden: !metricsOn.has(m.id),
    }));
    return { labels: chartRows.map((r) => r.label), datasets };
  }, [chartRows, metricsOn]);

  /** Room above the peak so point markers and splines are not cropped (scale was ending exactly at max). */
  const yMax = useMemo(() => {
    let mx = 0;
    const keys = METRIC_FILTERS.filter((m) => metricsOn.has(m.id)).map((m) => m.id);
    if (keys.length === 0) return 100;
    for (const row of chartRows) {
      for (const k of keys) {
        mx = Math.max(mx, Number(row?.[k]) || 0);
      }
    }
    const headroomPct = Math.max(10, Math.ceil(mx * 0.08));
    let cap = mx + headroomPct;
    cap = Math.ceil(cap / 5) * 5;
    return Math.max(25, cap);
  }, [chartRows, metricsOn]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    clip: false,
    layout: { padding: { top: 18, right: 10, bottom: 6, left: 8 } },
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(17,24,39,0.92)" } },
    scales: {
      x: {
        offset: true,
        grid: { display: false },
        ticks: { color: "#777777", font: { size: 11, weight: "500" } },
        border: { display: false },
      },
      y: {
        min: 0,
        max: yMax,
        border: { display: false },
        grid: { color: "#e9ecef", drawTicks: false, lineWidth: 1 },
        ticks: {
          color: "#777777",
          font: { size: 11, weight: "500" },
          callback: (tickValue) => {
            const v = Number(tickValue);
            if (!Number.isFinite(v)) return "";
            const n = Number.isInteger(v) ? v : Math.round(v);
            return `${n}%`;
          },
        },
      },
    },
  }), [yMax]);

  const visibleLegend = METRIC_FILTERS.filter((m) => metricsOn.has(m.id));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-[#333333]">Trends chart panel</h2>
        </div>
      </div>

      <div className="rounded-xl border-[2px] border-dashed border-slate-300 bg-slate-50/35 p-4">
        <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-2">
            <ToggleRow items={PERIOD_FILTERS} activeId={period} onChange={setPeriod} />
            <ToggleRow items={SPLIT_FILTERS} activeId={splitBy} onChange={setSplitBy} />
          </div>
          <MetricToggleRow activeSet={metricsOn} onToggle={toggleMetric} />
        </div>

        {errorMsg ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
            {errorMsg}
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
          {visibleLegend.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#333333]">
              <span className="h-3 w-3 shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10" style={{ backgroundColor: m.color }} aria-hidden />
              {m.legend}
            </span>
          ))}
        </div>

        <div className="relative w-full" style={{ height: "clamp(260px, 36vw, 340px)", minHeight: 260 }}>
          {loading ? shimmer("h-full w-full") : <Line data={chartData} options={chartOptions} />}
        </div>
      </div>
    </div>
  );
}
