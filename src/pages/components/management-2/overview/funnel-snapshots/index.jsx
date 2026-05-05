import React, { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, ArcElement } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { getWeekBoundsUTC } from "../../../../../utils/dateHelpers";

ChartJS.register(ArcElement);

import { getConfirmationColor, getShowUpColor, getConversionColor, getSuccessColor } from "../../../../../utils/performanceBenchmarks";

const FUNNEL_TRACK_GRAY = "#e8ecf1";
const FUNNEL_NEUTRAL = "#cbd5e1";

/**
 * @param {"confirmation"|"showup"|"conversion"|"success"} metricKey
 * @param {number} pct 0–100
 * @param {string} [subtext] use "—" as no-data
 */
function funnelArcColor(metricKey, pct, subtext) {
  if (subtext === "—") return FUNNEL_NEUTRAL;
  const p = Number(pct);
  if (!Number.isFinite(p)) return FUNNEL_NEUTRAL;

  switch (metricKey) {
    case "confirmation":
      return getConfirmationColor(p);
    case "showup":
      return getShowUpColor(p);
    case "conversion":
      return getConversionColor(p);
    case "success":
      return getSuccessColor(p);
    default:
      return FUNNEL_NEUTRAL;
  }
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function roundPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function formatPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toFixed(1)}%`;
}

function toBadgeDate(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
}

function shimmer(className = "") {
  return (
    <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />
  );
}

function SnapshotCardShimmer() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="mb-6 flex items-center justify-between gap-3">
        {shimmer("h-4 w-24")}
        {shimmer("h-6 w-16")}
      </div>
      <div className="flex flex-wrap items-start justify-around gap-y-8 sm:flex-nowrap sm:justify-between">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex min-w-[72px] max-w-[92px] flex-1 flex-col items-center px-2"
          >
            {shimmer("h-[84px] w-[84px] rounded-full")}
            {shimmer("mt-2.5 h-3 w-16")}
            {shimmer("mt-2 h-3 w-20")}
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutGauge({ value, color, label, subtext }) {
  const noData = subtext === "—";
  const targetPct = noData
    ? 0
    : roundPct(Math.min(100, Math.max(0, Number(value) || 0)));
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    setAnimatedPct(0);
    const t = setTimeout(() => setAnimatedPct(targetPct), 70);
    return () => clearTimeout(t);
  }, [targetPct]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      rotation: -90,
      circumference: 360,
      cutout: "78%",
      animation: {
        animateRotate: true,
        animateScale: false,
        duration: 1400,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
    }),
    [],
  );

  const data = useMemo(() => {
    if (noData || animatedPct <= 0) {
      return {
        datasets: [
          {
            data: [100],
            backgroundColor: [FUNNEL_TRACK_GRAY],
            borderWidth: 0,
            hoverOffset: 0,
          },
        ],
      };
    }
    if (animatedPct >= 100) {
      return {
        datasets: [
          {
            data: [100],
            backgroundColor: [color],
            borderWidth: 0,
            hoverOffset: 0,
          },
        ],
      };
    }
    return {
      datasets: [
        {
          data: [animatedPct, 100 - animatedPct],
          backgroundColor: [color, FUNNEL_TRACK_GRAY],
          borderWidth: 0,
          spacing: 0,
          hoverOffset: 0,
        },
      ],
    };
  }, [animatedPct, color, noData]);

  return (
    <div className="flex min-w-[72px] max-w-[92px] flex-1 flex-col items-center px-1.5">
      <div className="relative aspect-square w-[min(100%,84px)] max-w-[84px] rounded-full shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/[0.04]">
        <Doughnut data={data} options={options} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className={`text-[13px] font-extrabold tabular-nums tracking-tight md:text-[14px] ${
              noData ? "text-slate-400" : "text-slate-900"
            }`}
          >
            {noData ? "—" : formatPct(targetPct)}
          </span>
        </div>
      </div>
      <div className="mt-2.5 whitespace-nowrap text-center text-[9px] font-semibold uppercase tracking-wide text-[#94a3b8] md:text-[11px]">
        {label}
      </div>
      <div className="mt-1 whitespace-nowrap text-center text-[10px] font-medium text-slate-500">
        {subtext || "—"}
      </div>
    </div>
  );
}

const METRIC_ROWS = [
  { key: "confirmation", label: "CONFIRMATION" },
  { key: "showup", label: "SHOW-UP" },
  { key: "conversion", label: "CONVERSION" },
  { key: "success", label: "SUCCESS" },
];

function SnapshotCard({ panel }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-[#333333]">
          {panel.title}
        </h3>
        <span className="shrink-0 rounded-md bg-[#ebecef] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#474e60] ring-1 ring-black/[0.04]">
          {panel.dateBadge}
        </span>
      </div>
      <div className="flex flex-wrap items-start justify-around gap-y-8 sm:flex-nowrap sm:justify-between">
        {METRIC_ROWS.map((row) => (
          <DonutGauge
            key={`${panel.id}-${row.key}`}
            value={panel.values[row.key]}
            color={funnelArcColor(
              row.key,
              panel.values[row.key],
              panel.subtexts[row.key],
            )}
            label={row.label}
            subtext={panel.subtexts[row.key]}
          />
        ))}
      </div>
    </div>
  );
}

export default function FunnelSnapshots() {
  const [loading, setLoading] = useState(true);
  const [panels, setPanels] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshots() {
      setLoading(true);
      try {
        const res = await fetch("/api/management-series?days=14");
        const json = await res.json().catch(() => ({}));
        const series = Array.isArray(json?.series) ? json.series : [];

        const last = series.length ? series[series.length - 1] : null;
        const yesterday = series.length >= 2 ? series[series.length - 2] : last;

        const now = new Date();
        const { weekStart } = getWeekBoundsUTC(now);
        const mondayStr = weekStart.toISOString().slice(0, 10);
        const todayStr = now.toISOString().slice(0, 10);
        const thisWeek = series.filter(
          (d) => d?.date && d.date >= mondayStr && d.date <= todayStr,
        );

        const compute = (srcRows, type) => {
          const rows = Array.isArray(srcRows)
            ? srcRows
            : srcRows
              ? [srcRows]
              : [];
          const showed = rows.reduce(
            (a, d) => a + (Number(d?.totalShowedUp ?? 0) || 0),
            0,
          );
          const confirmed = rows.reduce(
            (a, d) => a + (Number(d?.totalConfirmed ?? 0) || 0),
            0,
          );
          const calls = rows.reduce(
            (a, d) =>
              a +
              (Number(
                d?.callsForConfirmation ?? d?.callsDeduped ?? d?.calls ?? 0,
              ) || 0),
            0,
          );
          const purchased = rows.reduce(
            (a, d) => a + (Number(d?.totalPurchased ?? 0) || 0),
            0,
          );
          const yesterdayShowUpRate = rows.length ? rows[0]?.showUpRate : null;

          const confirmation = calls > 0 ? (confirmed / calls) * 100 : null;
          const showup =
            type === "yesterday"
              ? yesterdayShowUpRate
              : confirmed > 0
                ? (showed / confirmed) * 100
                : null;
          const conversion = showed > 0 ? (purchased / showed) * 100 : null;
          const success = calls > 0 ? (purchased / calls) * 100 : null;

          return {
            values: {
              confirmation: roundPct(clampPct(confirmation)),
              showup: roundPct(clampPct(showup)),
              conversion: roundPct(clampPct(conversion)),
              success: roundPct(clampPct(success)),
            },
            subtexts: {
              confirmation: calls > 0 ? `${confirmed} / ${calls} calls` : "—",
              showup:
                confirmed > 0 ? `${showed} / ${confirmed} confirmed` : "—",
              conversion:
                showed > 0 ? `${purchased} / ${showed} show-ups` : "—",
              success: calls > 0 ? `${purchased} / ${calls} calls` : "—",
            },
          };
        };

        const y = compute(yesterday, "yesterday");
        const w = compute(thisWeek, "week");
        const nextPanels = [
          {
            id: "yesterday",
            title: "YESTERDAY",
            dateBadge: toBadgeDate(yesterday?.date),
            values: y.values,
            subtexts: y.subtexts,
          },
          {
            id: "week",
            title: "THIS WEEK",
            dateBadge: `${toBadgeDate(mondayStr)}–${toBadgeDate(todayStr)}`,
            values: w.values,
            subtexts: w.subtexts,
          },
        ];

        if (cancelled) return;
        setPanels(nextPanels);
      } catch (e) {
        if (cancelled) return;
        setPanels([
          {
            id: "yesterday",
            title: "YESTERDAY",
            dateBadge: "—",
            values: { confirmation: 0, showup: 0, conversion: 0, success: 0 },
            subtexts: {
              confirmation: "—",
              showup: "—",
              conversion: "—",
              success: "—",
            },
          },
          {
            id: "week",
            title: "THIS WEEK",
            dateBadge: "—",
            values: { confirmation: 0, showup: 0, conversion: 0, success: 0 },
            subtexts: {
              confirmation: "—",
              showup: "—",
              conversion: "—",
              success: "—",
            },
          },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="border border-slate-200 rounded-2xl p-2 bg-white">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[18px] font-bold tracking-tight text-[#333333]">
            Funnel snapshots
          </h2>
          {/* <span className="inline-flex rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white ring-1 ring-violet-700/30">
            CURRENT
          </span> */}
        </div>
        {/* <p className="mt-2 max-w-4xl text-[13px] font-medium leading-relaxed text-[#777777]">
          The two side panels with Confirmation / Show-up / Conversion /
          Success. Donut gauges instead of dashes.
        </p> */}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <>
            <SnapshotCardShimmer />
            <SnapshotCardShimmer />
          </>
        ) : (
          panels.map((panel) => <SnapshotCard key={panel.id} panel={panel} />)
        )}
      </div>
    </div>
  );
}
