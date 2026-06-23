import { useEffect, useMemo, useState, useCallback } from "react";
import { Calendar } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as DateHelpers from "../../../../utils/dateHelpers";
import {
  fetchUTMAnalytics,
  UTM_ANALYTICS_CHART_COLORS,
} from "../../../../lib/utmAnalyticsData";
import {
  BENCHMARKS,
  getConversionBgClass,
  getConversionClass,
  PERFORMANCE_SOFT_BG_CLASSES,
} from "../../../../utils/performanceBenchmarks";
import SegmentedTabs from "../segmented-tabs";
import { PanelCursorTooltip, usePanelCursorTooltip } from "../panel-cursor-tooltip";

const RANGE_ITEMS = [
  { id: "mtd", label: "MTD", title: "Month to date" },
  { id: "last7", label: "7d", title: "Last 7 days" },
  { id: "last30", label: "30d", title: "Last 30 days" },
  { id: "lastWeek", label: "Last wk", title: "Previous calendar week" },
  { id: "lastMonth", label: "Last mo", title: "Previous calendar month" },
  { id: "custom", label: "Custom", title: "Custom date range" },
];

const CONVERSION_VIEW_ITEMS = [
  { id: "source", label: "Source" },
  { id: "campaign", label: "Campaign" },
];

const BOOKING_TREND_VIEW_ITEMS = [
  { id: "total", label: "Total" },
  { id: "sources", label: "By source" },
  { id: "aibot", label: "AI bot" },
];

/** Display-only merge for duplicate UTM spellings (fb/facebook, ig/instagram). */
const BOOKING_SOURCE_ALIASES = {
  fb: "facebook",
  ig: "instagram",
};

function normalizeBookingSource(raw) {
  const key = String(raw ?? "").trim();
  if (!key || key === "Organic") return key || "Unknown";
  const lower = key.toLowerCase();
  return BOOKING_SOURCE_ALIASES[lower] ?? key;
}

function buildDailyBookingsModel(bookingsPerDay, sourceKeys) {
  const rawKeys = (sourceKeys || []).filter((k) => k && k !== "Organic");
  const totalsBySource = {};

  (bookingsPerDay || []).forEach((row) => {
    rawKeys.forEach((rawKey) => {
      const nk = normalizeBookingSource(rawKey);
      totalsBySource[nk] = (totalsBySource[nk] || 0) + Number(row[rawKey] || 0);
    });
  });

  const ranked = Object.entries(totalsBySource).sort((a, b) => b[1] - a[1]);
  const topKeys = ranked.slice(0, 5).map(([k]) => k);
  const topSet = new Set(topKeys);
  const hasOther = ranked.length > 5;

  const series = (bookingsPerDay || []).map((row) => {
    const point = {
      date: row.date,
      label: row.date
        ? new Date(`${row.date}T12:00:00.000Z`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
        : "",
      total: Number(row.total || 0),
      aiBot: Number(row.aiBot || 0),
    };

    const bucket = {};
    rawKeys.forEach((rawKey) => {
      const nk = normalizeBookingSource(rawKey);
      const count = Number(row[rawKey] || 0);
      if (topSet.has(nk)) bucket[nk] = (bucket[nk] || 0) + count;
      else bucket.Other = (bucket.Other || 0) + count;
    });

    topKeys.forEach((k) => {
      point[k] = bucket[k] || 0;
    });
    if (hasOther) point.Other = bucket.Other || 0;

    return point;
  });

  const lineKeys = hasOther ? [...topKeys, "Other"] : topKeys;

  return { series, lineKeys, totalsBySource };
}

const EMPTY_DATA = {
  pieData: [],
  organicDaily: [],
  totalOrganicCalls: 0,
  totalPurchases: 0,
  aiBot: { calls: 0, purchases: 0 },
  mediumBySource: [],
  campaignData: [],
  conversionByPlatform: [],
  conversionByCampaign: [],
  bookingsPerDay: [],
  bookingsPerDaySourceKeys: [],
  mediumKeys: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function formatInt(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n || 0));
}

function formatPct(n, digits = 1) {
  const v = Number(n || 0);
  return `${v.toFixed(digits)}%`;
}

const UTM_DISPLAY_NAMES = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  email: "Email",
};

/** utm_source row accents — distinct from medium segment colors below. */
const SOURCE_BRAND_COLORS = {
  instagram: "#db2777",
  facebook: "#2563eb",
  youtube: "#dc2626",
  tiktok: "#0f766e",
  email: "#7c3aed",
  unknown: "#64748b",
  "not set": "#94a3b8",
  other: "#cbd5e1",
};

/** utm_medium segments inside each platform row. */
const MEDIUM_SEGMENT_COLORS = {
  bio: "#6366f1",
  dm: "#0284c7",
  video: "#d97706",
  masterclass: "#9333ea",
  unknown: "#94a3b8",
};

function getSourceBrandColor(sourceKey) {
  const k = normalizeBookingSource(sourceKey).toLowerCase();
  if (SOURCE_BRAND_COLORS[k]) return SOURCE_BRAND_COLORS[k];
  const idx = Math.abs(k.split("").reduce((h, c) => h + c.charCodeAt(0), 0)) % UTM_ANALYTICS_CHART_COLORS.length;
  return UTM_ANALYTICS_CHART_COLORS[idx];
}

function getMediumSegmentColor(mediumKey) {
  const k = String(mediumKey ?? "").toLowerCase();
  return MEDIUM_SEGMENT_COLORS[k] || "#64748b";
}

function getTopMediumForRow(row, mediumKeys) {
  let bestMed = null;
  let bestVal = 0;
  for (const med of mediumKeys) {
    const v = Number(row[med] || 0);
    if (v > bestVal) {
      bestVal = v;
      bestMed = med;
    }
  }
  if (!bestMed || row.total <= 0) return null;
  return { med: bestMed, value: bestVal, pct: (bestVal / row.total) * 100 };
}

function formatUtmLabel(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.toLowerCase() === "null") return "Not set";
  if (s.toLowerCase() === "unknown") return "Unknown";
  const norm = normalizeBookingSource(s).toLowerCase();
  if (UTM_DISPLAY_NAMES[norm]) return UTM_DISPLAY_NAMES[norm];
  if (s.length <= 3) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMediumLabel(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.toLowerCase() === "unknown") return "Unknown";
  if (s.toLowerCase() === "dm") return "DM";
  if (s.length <= 3) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Merge dm/DM and align keys for stacked medium bars. */
function buildMediumChartModel(platforms, keys) {
  const canonOrder = [];
  const rawToCanon = new Map();
  (keys || []).forEach((k) => {
    const canon = formatMediumLabel(k);
    rawToCanon.set(k, canon);
    if (!canonOrder.includes(canon)) canonOrder.push(canon);
  });

  const rows = (platforms || [])
    .map((row) => {
      const merged = { source: row.source, total: 0 };
      canonOrder.forEach((ck) => {
        merged[ck] = 0;
      });
      (keys || []).forEach((k) => {
        const canon = rawToCanon.get(k);
        merged[canon] = (merged[canon] || 0) + Number(row[k] || 0);
      });
      merged.total = canonOrder.reduce((s, ck) => s + Number(merged[ck] || 0), 0);
      return merged;
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return { rows, mediumKeys: canonOrder };
}

const CONVERSION_GOAL_PCT = BENCHMARKS.CONVERSION;

function conversionSoftBadgeClass(rate) {
  if (rate < CONVERSION_GOAL_PCT * 0.75) return PERFORMANCE_SOFT_BG_CLASSES.BAD;
  if (rate < CONVERSION_GOAL_PCT) return PERFORMANCE_SOFT_BG_CLASSES.OK;
  if (rate >= CONVERSION_GOAL_PCT * 1.1) return PERFORMANCE_SOFT_BG_CLASSES.GREAT;
  return PERFORMANCE_SOFT_BG_CLASSES.GOOD;
}

/** Soft badge + bar colors aligned to {CONVERSION_GOAL_PCT}% goal. */
function conversionPill(conv, bookings) {
  const b = Number(bookings || 0);
  const c = Number(conv || 0);
  if (b <= 0) {
    return {
      label: "—",
      className: "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200/80",
      barClass: "bg-slate-200",
      lowSample: false,
    };
  }
  if (b < 5) {
    return {
      label: formatPct(c),
      className: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200/80",
      barClass: getConversionBgClass(c),
      lowSample: true,
    };
  }
  return {
    label: formatPct(c),
    className: cx(conversionSoftBadgeClass(c), "ring-1 ring-inset"),
    barClass: getConversionBgClass(c),
    lowSample: false,
  };
}

/** Close-rate bar width: full track = goal %. */
function conversionRateBarWidth(rate) {
  if (CONVERSION_GOAL_PCT <= 0) return 0;
  const w = (Number(rate) / CONVERSION_GOAL_PCT) * 100;
  return Math.min(100, Math.max(0, w));
}

function conversionGoalFooter(rate, purchases, bookings, lowSample) {
  if (bookings <= 0) return "";
  if (rate >= CONVERSION_GOAL_PCT) {
    return lowSample
      ? `At or above ${CONVERSION_GOAL_PCT}% target · Low sample (under 5 calls)`
      : `At or above ${CONVERSION_GOAL_PCT}% target`;
  }
  if (purchases === 0) {
    return lowSample
      ? `No sales yet · ${CONVERSION_GOAL_PCT}% target · Low sample (under 5 calls)`
      : `No sales yet · ${CONVERSION_GOAL_PCT}% target`;
  }
  const ptsBelow = Math.round((CONVERSION_GOAL_PCT - rate) * 10) / 10;
  const base = `${ptsBelow} pts below ${CONVERSION_GOAL_PCT}% target`;
  return lowSample ? `${base} · Low sample (under 5 calls)` : base;
}

/** Merge fb→facebook, ig→instagram, etc. for source view only. */
function mergeConversionRows(rows, view) {
  if (view !== "source") return rows || [];
  const map = new Map();
  for (const row of rows || []) {
    const raw = row.fullName ?? row.name ?? "Unknown";
    const normKey = normalizeBookingSource(raw).toLowerCase();
    const existing = map.get(normKey);
    if (!existing) {
      map.set(normKey, {
        fullName: normKey,
        name: normKey,
        bookings: 0,
        purchases: 0,
      });
    }
    const entry = map.get(normKey);
    entry.bookings += Number(row.bookings || 0);
    entry.purchases += Number(row.purchases || 0);
  }
  return Array.from(map.values()).map((r) => ({
    ...r,
    conversionRate: r.bookings > 0 ? (r.purchases / r.bookings) * 100 : 0,
  }));
}

function formatShortDate(isoDay) {
  if (!isoDay) return "—";
  return new Date(`${isoDay}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatRangeBoundsLabel(start, end) {
  if (!start || !end) return "—";
  const fmt = (d) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  const a = fmt(start);
  const b = fmt(end);
  return a === b ? a : `${a} – ${b}`;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function getOrganicRangeBounds(range, customStart = null, customEnd = null) {
  const now = new Date();
  if (range === "custom") return normalizeCustomBounds(customStart, customEnd);
  if (range === "last30") {
    const end = endOfUtcDay(now);
    const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { start: startOfUtcDay(start), end };
  }
  if (range === "last7") {
    const end = endOfUtcDay(now);
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: startOfUtcDay(start), end };
  }
  if (range === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart, end: weekEnd };
  }
  if (range === "lastMonth") {
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const monthRange = DateHelpers.getMonthRangeInTimezone(previousMonth, DateHelpers.DEFAULT_TIMEZONE);
    return { start: monthRange.startDate, end: monthRange.endDate };
  }
  if (range === "mtd") {
    const monthRange = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
    return { start: monthRange.startDate, end: now };
  }
  const monthRange = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
  return { start: monthRange.startDate, end: monthRange.endDate };
}

function normalizeCustomBounds(startDateText, endDateText) {
  const fallback = getOrganicRangeBounds("mtd");
  if (!startDateText || !endDateText) return fallback;
  const start = new Date(`${startDateText}T00:00:00.000Z`);
  const end = new Date(`${endDateText}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fallback;
  if (start > end) return fallback;
  return { start, end };
}

// ─── Micro components ────────────────────────────────────────────────────────

function MetricInfo({ title, body }) {
  return (
    <span className="group relative inline-flex h-3.5 w-3.5 shrink-0 cursor-default items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold leading-none text-slate-500">
      i
      <span className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1 w-[172px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-medium leading-snug text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.14)] group-hover:visible">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="block">{body}</span>
      </span>
    </span>
  );
}

function ShimmerBlock({ className = "" }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

function ShimmerText({ className = "" }) {
  return <span className={cx("inline-block animate-pulse rounded bg-slate-200/80 align-middle", className)} />;
}

function SectionBadge({ children }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

/** Section title row — matches Sales tab (title left, badge top-right). */
function OrganicSectionHeader({ title, badge, infoTitle, infoBody, subtitle, actions }) {
  return (
    <div className="mb-2">
      <div className="relative">
        <div className={badge ? "min-w-0 pr-[8.5rem]" : "min-w-0"}>
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-900">{title}</h2>
            {infoTitle ? <MetricInfo title={infoTitle} body={infoBody} /> : null}
          </div>
          {subtitle ? <p className="mt-1 text-[11px] font-semibold text-slate-500">{subtitle}</p> : null}
        </div>
        {badge ? (
          <div className="absolute right-0 top-0">
            <SectionBadge>{badge}</SectionBadge>
          </div>
        ) : null}
      </div>
      {actions ? <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

function OrganicDataScopeNote() {
  return (
    <p className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-[11px] font-semibold leading-snug text-slate-600">
      Organic traffic only — paid ads excluded. Calls, bookings, and sales may fall on different days in the
      period.
    </p>
  );
}

// ─── Filters bar ─────────────────────────────────────────────────────────────

function OrganicFiltersBar({
  range, onRangeChange,
  customStart, onCustomStartChange,
  customEnd, onCustomEndChange,
  sourceFilter, onSourceFilterChange,
  sourceOptions, rangeBounds, loading,
}) {
  const periodLabel = rangeBounds ? formatRangeBoundsLabel(rangeBounds.start, rangeBounds.end) : "—";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs size="sm" fit items={RANGE_ITEMS} activeId={range} onChange={onRangeChange} />

        {range === "custom" ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
            <input
              type="date"
              value={customStart || ""}
              onChange={(e) => onCustomStartChange?.(e.target.value)}
              className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
              aria-label="Custom start date"
            />
            <span className="text-[10px] font-semibold text-slate-500">–</span>
            <input
              type="date"
              value={customEnd || ""}
              onChange={(e) => onCustomEndChange?.(e.target.value)}
              className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
              aria-label="Custom end date"
            />
          </div>
        ) : null}

        <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" aria-hidden="true" />

        <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
          <label htmlFor="organic-source-filter" className="sr-only">UTM source filter</label>
          <select
            id="organic-source-filter"
            value={sourceFilter || ""}
            onChange={(e) => onSourceFilterChange?.(e.target.value)}
            disabled={loading}
            className="h-6 max-w-[min(100%,200px)] cursor-pointer rounded border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-700 !outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">All sources</option>
            {(sourceOptions || []).map((name) => (
              <option key={name} value={name.toLowerCase()}>
                {formatUtmLabel(name)}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          <Calendar className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.2} />
          <span className="text-[11px] font-semibold tabular-nums text-slate-700">
            {loading ? <ShimmerText className="h-3 w-28" /> : periodLabel}
          </span>
        </div>
      </div>
    </div>
  );
}


// ─── Left column (pipeline + snapshot cards) ─────────────────────────────────

function formatPeakDayLabel(dateStr) {
  if (!dateStr) return "—";
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function computeBookingStats(bookingsPerDay) {
  const series = bookingsPerDay || [];
  if (!series.length) {
    return { total: 0, avg: 0, peak: null, dayCount: 0, spark: [] };
  }
  const total = series.reduce((s, r) => s + Number(r.total || 0), 0);
  const dayCount = series.length;
  const avg = dayCount > 0 ? total / dayCount : 0;
  const peak = series.reduce(
    (best, row) => (Number(row.total || 0) > Number(best?.total || 0) ? row : best),
    series[0],
  );
  const spark = series.map((r) => ({ v: Number(r.total || 0) }));
  return { total, avg, peak, dayCount, spark };
}

const ORGANIC_PIE_SIZE = 58;
const ORGANIC_PIE_INNER = 16;
const ORGANIC_PIE_OUTER = 25;

function buildGoalPieSlices(main, cap, accentFill, labels = {}) {
  const m = Math.max(0, Number(main) || 0);
  const c = Math.max(0, Number(cap) || 0);
  const slate = "#e2e8f0";
  const progressLabel = labels.progress ?? "Achieved";
  const remainingLabel = labels.remaining ?? "Remaining";
  if (c <= 0) return [{ name: "—", value: 1, fill: slate }];
  const filled = Math.min(m, c);
  const rest = Math.max(0, c - m);
  if (filled <= 0) return [{ name: remainingLabel, value: c, fill: slate }];
  if (rest <= 0) return [{ name: progressLabel, value: Math.max(filled, 1), fill: accentFill }];
  return [
    { name: progressLabel, value: filled, fill: accentFill },
    { name: remainingLabel, value: rest, fill: slate },
  ];
}

function OrganicPieBreakdownTooltip({ slices, formatValue = formatInt, activeName }) {
  const total = slices.reduce((s, row) => s + (Number(row.value) || 0), 0);
  return (
    <div
      className="min-w-[128px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
      role="tooltip"
    >
      <div className="flex flex-col gap-1">
        {slices.map((row) => {
          const val = Number(row.value) || 0;
          const share = total > 0 ? (val / total) * 100 : 0;
          const isActive = activeName === row.name;
          return (
            <div
              key={row.name}
              className={cx(
                "flex items-center justify-between gap-2 text-[10px]",
                isActive ? "font-semibold text-slate-900" : "font-medium text-slate-600",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {formatValue(val)} · {share.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrganicMiniPie({ slices, loading, centerLabel, formatValue = formatInt }) {
  const [hovered, setHovered] = useState(false);
  const [activeName, setActiveName] = useState(null);

  const filtered = useMemo(() => (slices || []).filter((s) => s.value > 0), [slices]);

  const clearHover = useCallback(() => {
    setHovered(false);
    setActiveName(null);
  }, []);

  if (loading) {
    return <ShimmerBlock className="h-[58px] w-[58px] shrink-0 self-center rounded-full" />;
  }
  if (!filtered.length) {
    return (
      <div
        className="flex h-[58px] w-[58px] shrink-0 items-center justify-center self-center rounded-full border border-slate-100 bg-slate-50 text-[9px] font-semibold text-slate-400"
        aria-hidden
      >
        —
      </div>
    );
  }

  return (
    <div
      className="relative flex h-[58px] w-[58px] shrink-0 cursor-default items-center justify-center self-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={clearHover}
      onFocus={() => setHovered(true)}
      onBlur={clearHover}
      tabIndex={0}
      aria-label="Chart breakdown. Hover for details."
    >
      <PieChart width={ORGANIC_PIE_SIZE} height={ORGANIC_PIE_SIZE}>
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={ORGANIC_PIE_INNER}
          outerRadius={ORGANIC_PIE_OUTER}
          paddingAngle={filtered.length > 1 ? 1 : 0}
          stroke="#fff"
          strokeWidth={1}
          isAnimationActive={false}
          onMouseEnter={(_, index) => {
            setHovered(true);
            setActiveName(filtered[index]?.name ?? null);
          }}
          onMouseLeave={() => setActiveName(null)}
        >
          {filtered.map((entry) => (
            <Cell
              key={entry.name}
              fill={entry.fill}
              opacity={activeName && activeName !== entry.name ? 0.45 : 1}
            />
          ))}
        </Pie>
      </PieChart>
      {centerLabel ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-extrabold tabular-nums text-slate-700">
          {centerLabel}
        </span>
      ) : null}
      {hovered ? (
        <div className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2">
          <OrganicPieBreakdownTooltip
            slices={filtered}
            formatValue={formatValue}
            activeName={activeName}
          />
        </div>
      ) : null}
    </div>
  );
}


function OrganicLeftMetricCard({
  label,
  infoTitle,
  infoBody,
  value,
  valueClass = "text-slate-950",
  note,
  subNote,
  footer,
  pie,
  loading,
}) {
  return (
    <article className="relative min-h-[82px] overflow-visible rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</p>
            {infoTitle ? <MetricInfo title={infoTitle} body={infoBody} /> : null}
          </div>
          {loading ? (
            <ShimmerBlock className="mt-2 h-7 w-20" />
          ) : (
            <p className={cx("mt-2 text-[22px] font-extrabold leading-none tabular-nums tracking-normal", valueClass)}>
              {value}
            </p>
          )}
          {note ? <p className="mt-2 text-[11px] font-semibold text-slate-500">{note}</p> : null}
          {subNote ? <p className="mt-0.5 text-[10px] font-medium text-slate-400">{subNote}</p> : null}
          {footer && !loading ? <div className="mt-1.5">{footer}</div> : null}
        </div>
        {pie}
      </div>
    </article>
  );
}

function buildBookedPieSlices(bookingStats) {
  const total = bookingStats?.total || 0;
  const peakVal = Number(bookingStats?.peak?.total || 0);
  const other = Math.max(0, total - peakVal);
  if (total <= 0) return [];
  const peakLabel = bookingStats.peak?.date ? formatPeakDayLabel(bookingStats.peak.date) : "day";
  return [
    { name: `Peak (${peakLabel})`, value: peakVal, fill: "#0ea5e9" },
    { name: "Other days", value: other, fill: "#e2e8f0" },
  ].filter((s) => s.value > 0);
}

function buildSourceMiniPieSlices(pieData, maxSlices = 4) {
  const { rows } = buildSourceMixModel(pieData);
  const top = rows.filter((r) => r.key !== "other").slice(0, maxSlices);
  const restVal = rows
    .filter((r) => !top.some((t) => t.key === r.key) && r.key !== "other")
    .reduce((s, r) => s + r.value, 0);
  const otherRow = rows.find((r) => r.key === "other");
  const otherVal = (otherRow?.value || 0) + restVal;
  const slices = top.map((r) => ({ name: r.name, value: r.value, fill: r.color }));
  if (otherVal > 0) slices.push({ name: "Other", value: otherVal, fill: SOURCE_BRAND_COLORS.other });
  return slices;
}

function OrganicPipelineSection({ totalOrganicCalls, totalPurchases, aiBot, overallConversion, loading }) {
  const aiBotCalls = aiBot?.calls ?? 0;
  const aiBotPurchases = aiBot?.purchases ?? 0;
  const noSale = Math.max(0, totalOrganicCalls - totalPurchases);
  const callPie = useMemo(
    () => [
      { name: "Sales", value: totalPurchases, fill: "#22c55e" },
      { name: "No sale", value: noSale, fill: "#e2e8f0" },
    ],
    [totalPurchases, noSale],
  );
  const purchaseGoal = Math.max(totalPurchases, Math.ceil(totalOrganicCalls * (BENCHMARKS.CONVERSION / 100)));
  const purchasePie = useMemo(
    () =>
      buildGoalPieSlices(totalPurchases, purchaseGoal, overallConversion >= BENCHMARKS.CONVERSION ? "#22c55e" : "#f43f5e", {
        progress: "Purchases",
        remaining: `To ${BENCHMARKS.CONVERSION}% goal`,
      }),
    [totalPurchases, purchaseGoal, overallConversion],
  );

  return (
    <section className="flex flex-col overflow-visible rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <OrganicSectionHeader
        title="Pipeline"
        badge="Calls & sales"
        infoTitle="Pipeline"
        infoBody="Calls are counted when they happened; purchases when the sale closed. Hover charts for a full breakdown."
        subtitle="Calls held vs sales closed in the period"
      />
      <div className="flex flex-col gap-2">
        <OrganicLeftMetricCard
          label="Calls"
          infoTitle="Calls"
          infoBody="Organic calls in range. Reschedules deduped. Paid ads excluded."
          value={formatInt(totalOrganicCalls)}
          loading={loading}
          pie={<OrganicMiniPie slices={callPie} loading={loading} />}
          footer={
            totalOrganicCalls > 0 ? (
              <>
                <p className="text-[11px] font-semibold text-slate-500">
                  <span className="text-emerald-700">{formatPct((totalPurchases / totalOrganicCalls) * 100, 1)}</span>{" "}
                  closed · {formatInt(noSale)} no sale
                </p>
                {aiBotCalls > 0 ? (
                  <p className="text-[11px] font-semibold text-indigo-600">🤖 {formatInt(aiBotCalls)} via AI bot</p>
                ) : null}
              </>
            ) : null
          }
        />
        <OrganicLeftMetricCard
          label="Purchases"
          infoTitle="Purchases"
          infoBody="Confirmed sales from organic calls in range (including partial refunds)."
          value={formatInt(totalPurchases)}
          loading={loading}
          pie={<OrganicMiniPie slices={purchasePie} loading={loading} />}
          footer={
            totalOrganicCalls > 0 ? (
              <>
                <p className="text-[11px] font-semibold text-slate-500">
                  Goal {formatInt(purchaseGoal)} at {BENCHMARKS.CONVERSION}% close rate
                </p>
                {aiBotPurchases > 0 ? (
                  <p className="text-[11px] font-semibold text-indigo-600">🤖 {formatInt(aiBotPurchases)} via AI bot</p>
                ) : null}
              </>
            ) : null
          }
        />
      </div>
    </section>
  );
}

function OrganicSnapshotSection({
  overallConversion,
  bookingsPerDay,
  pieData,
  sourceFilter,
  loading,
}) {
  const bookingStats = useMemo(() => computeBookingStats(bookingsPerDay), [bookingsPerDay]);
  const bookedPie = useMemo(() => buildBookedPieSlices(bookingStats), [bookingStats]);
  const sourceSlices = useMemo(() => buildSourceMiniPieSlices(pieData), [pieData]);
  const closeRatePie = useMemo(
    () =>
      buildGoalPieSlices(overallConversion, BENCHMARKS.CONVERSION, overallConversion >= BENCHMARKS.CONVERSION ? "#22c55e" : "#f43f5e", {
        progress: "Close rate",
        remaining: `To ${BENCHMARKS.CONVERSION}% goal`,
      }),
    [overallConversion],
  );
  const distinctSources = (pieData || []).length;
  const filterLabel = sourceFilter ? formatUtmLabel(sourceFilter) : "All sources";
  const formatPctSlice = (v) => formatPct(v, 1);
  const bookedNote =
    bookingStats.dayCount > 0 ? `Avg ${bookingStats.avg.toFixed(1)} bookings per day` : null;

  return (
    <section className="flex flex-col overflow-visible rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <OrganicSectionHeader
        title="Snapshot"
        badge="Overview"
        infoTitle="Snapshot"
        infoBody="Bookings when scheduled, close rate from calls and sales, and traffic source mix. Hover charts for a full breakdown."
        subtitle="Bookings, conversion, and traffic mix"
      />
      <div className="flex flex-col gap-2">
        <OrganicLeftMetricCard
          label="Booked"
          infoTitle="Booked"
          infoBody="Total bookings in range (matches the Daily bookings chart)."
          value={formatInt(bookingStats.total)}
          note={bookedNote}
          loading={loading}
          pie={<OrganicMiniPie slices={bookedPie} loading={loading} />}
          footer={
            bookingStats.peak && Number(bookingStats.peak.total) > 0 ? (
              <p className="text-[11px] font-semibold text-slate-500">
                Peak {formatInt(bookingStats.peak.total)} on {formatPeakDayLabel(bookingStats.peak.date)}
              </p>
            ) : null
          }
        />
        <OrganicLeftMetricCard
          label="Close rate"
          infoTitle="Close rate"
          infoBody="Purchases divided by organic calls in range."
          value={formatPct(overallConversion)}
          valueClass={getConversionClass(overallConversion)}
          note="Sales divided by calls"
          loading={loading}
          pie={
            <OrganicMiniPie
              slices={closeRatePie}
              loading={loading}
              centerLabel={formatPct(overallConversion, 0)}
              formatValue={formatPctSlice}
            />
          }
        />
        <OrganicLeftMetricCard
          label="Traffic sources"
          infoTitle="Traffic sources"
          infoBody="How many distinct traffic sources had activity in range."
          value={formatInt(distinctSources)}
          note={filterLabel}
          loading={loading}
          pie={<OrganicMiniPie slices={sourceSlices} loading={loading} />}
        />
      </div>
    </section>
  );
}

function OrganicLeftColumn({
  totalOrganicCalls,
  totalPurchases,
  aiBot,
  overallConversion,
  bookingsPerDay,
  pieData,
  sourceFilter,
  loading,
}) {
  return (
    <div className="flex flex-col gap-2 overflow-visible">
      <OrganicPipelineSection
        totalOrganicCalls={totalOrganicCalls}
        totalPurchases={totalPurchases}
        aiBot={aiBot}
        overallConversion={overallConversion}
        loading={loading}
      />
      <OrganicSnapshotSection
        overallConversion={overallConversion}
        bookingsPerDay={bookingsPerDay}
        pieData={pieData}
        sourceFilter={sourceFilter}
        loading={loading}
      />
    </div>
  );
}

// ─── Source mix (utm_source share) ─────────────────────────────────────────────

const SOURCE_MIX_TOP_N = 6;

function buildSourceMixModel(pieData) {
  const map = new Map();
  for (const row of pieData || []) {
    const normKey = normalizeBookingSource(row.name).toLowerCase();
    const val = Number(row.value || 0);
    map.set(normKey, (map.get(normKey) || 0) + val);
  }

  const merged = [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);

  const total = merged.reduce((s, r) => s + r.value, 0);
  const top = merged.slice(0, SOURCE_MIX_TOP_N);
  const restVal = merged.slice(SOURCE_MIX_TOP_N).reduce((s, r) => s + r.value, 0);

  const rows = top.map((r) => ({
    key: r.key,
    name: formatUtmLabel(r.key),
    value: r.value,
    pct: total > 0 ? (r.value / total) * 100 : 0,
    color: getSourceBrandColor(r.key),
  }));

  if (restVal > 0) {
    rows.push({
      key: "other",
      name: "Other",
      value: restVal,
      pct: total > 0 ? (restVal / total) * 100 : 0,
      color: SOURCE_BRAND_COLORS.other,
    });
  }

  return { rows, total };
}

function SourceMixPanel({ pieData, loading }) {
  const { rows, total } = useMemo(() => buildSourceMixModel(pieData), [pieData]);
  const { tip, panelBindings, targetHandlers } = usePanelCursorTooltip();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <OrganicSectionHeader
        title="Traffic sources"
        badge="By source"
        infoTitle="Traffic sources"
        infoBody="Share of organic calls from each traffic source. Facebook and Instagram spellings are merged. Use Close rate → Campaign for campaign detail."
        subtitle="Share of all organic calls"
      />

      {loading ? (
        <div className="space-y-1.5">
          <ShimmerBlock className="h-6 w-full rounded-md" />
          <ShimmerBlock className="h-6 w-full rounded-md" />
          <ShimmerBlock className="h-6 w-full rounded-md" />
        </div>
      ) : total === 0 ? (
        <p className="py-4 text-center text-[11px] font-medium text-slate-400">No source data in range</p>
      ) : (
        <div
          {...panelBindings()}
          className="relative rounded-xl border border-slate-200/80 bg-slate-50/30 p-1.5"
        >
          <PanelCursorTooltip tip={tip} estimateHeight={64}>
            {(payload) => (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg">
                <p className="font-semibold text-slate-900">{payload.name}</p>
                <p className="mt-1 text-slate-700">
                  {formatInt(payload.value)} calls · {formatPct(payload.pct, 1)} of {formatInt(total)}
                </p>
              </div>
            )}
          </PanelCursorTooltip>

          <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            {formatInt(total)} calls total
          </p>

          <div className="grid grid-cols-[minmax(0,1fr)_40px_36px] gap-x-2 px-1 pb-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Source</span>
            <span className="text-right">Calls</span>
            <span className="text-right">Share</span>
          </div>

          <ul className="divide-y divide-slate-100/90">
            {rows.map((row) => {
              const payload = { ...row, id: row.key };
              return (
                <li key={row.key}>
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_40px_36px] items-center gap-x-2 py-1 pl-0 pr-0.5"
                    style={{ borderLeft: `3px solid ${row.color}` }}
                    {...targetHandlers(payload)}
                  >
                    <span className="truncate pl-1.5 text-[11px] font-semibold text-slate-800">{row.name}</span>
                    <span className="text-right text-[11px] font-semibold tabular-nums text-slate-700">
                      {formatInt(row.value)}
                    </span>
                    <span className="text-right text-[10px] font-bold tabular-nums text-slate-500">
                      {formatPct(row.pct, 0)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Daily bookings trend (management-style area / multi-line) ───────────────

function DailyBookingsTrendPanel({ bookingsPerDay, sourceKeys, loading }) {
  const [trendView, setTrendView] = useState("total");
  const [hiddenSources, setHiddenSources] = useState(() => new Set());

  const { series, lineKeys } = useMemo(
    () => buildDailyBookingsModel(bookingsPerDay, sourceKeys),
    [bookingsPerDay, sourceKeys],
  );

  // "Total" and "By source" summarise overall bookings; "AI bot" summarises only
  // the ai-setting series. The subtitle stats follow the active metric so they
  // always match what the chart is showing.
  const metricKey = trendView === "aibot" ? "aiBot" : "total";

  const totalBookings = useMemo(
    () => series.reduce((s, r) => s + Number(r[metricKey] || 0), 0),
    [series, metricKey],
  );

  const avgPerDay = useMemo(() => {
    if (!series.length) return 0;
    return totalBookings / series.length;
  }, [series, totalBookings]);

  const peakDay = useMemo(() => {
    if (!series.length) return null;
    return series.reduce((best, row) =>
      Number(row[metricKey] || 0) > Number(best[metricKey] || 0) ? row : best,
    );
  }, [series, metricKey]);

  const tickStep = Math.max(1, Math.ceil(series.length / 5));
  const visibleLineKeys = lineKeys.filter((k) => !hiddenSources.has(k));

  const toggleSource = (key) => {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bookingsSubtitle =
    !loading && series.length > 0
      ? `${trendView === "aibot" ? "AI bot · " : ""}${formatInt(totalBookings)} in range · ${avgPerDay.toFixed(1)}/day avg${
          peakDay ? ` · peak ${formatInt(peakDay[metricKey])} on ${peakDay.label}` : ""
        }`
      : null;

  // "Total" and "AI bot" share one area chart; only the series key, color and label differ.
  const isAreaView = trendView === "total" || trendView === "aibot";
  const areaKey = metricKey;
  const areaColor = trendView === "aibot" ? "#6366f1" : "#3b82f6";
  const areaLabel = trendView === "aibot" ? "AI bot bookings" : "Bookings";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <OrganicSectionHeader
        title="Daily bookings"
        badge="Booking date"
        infoTitle="Daily bookings"
        infoBody="Bookings counted when they were scheduled. Total shows daily volume; By source splits top traffic sources (Facebook and Instagram merged); AI bot shows only bookings from the n8n AI setter (ai-setting campaign)."
        subtitle={bookingsSubtitle}
        actions={
          <SegmentedTabs
            size="xs"
            fit
            className="!w-fit shrink-0"
            items={BOOKING_TREND_VIEW_ITEMS}
            activeId={trendView}
            onChange={setTrendView}
          />
        }
      />

      {loading ? (
        <ShimmerBlock className="h-[168px] w-full rounded-xl" />
      ) : series.length === 0 ? (
        <p className="flex h-[168px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-[11px] font-medium text-slate-400">
          No bookings in range
        </p>
      ) : (
        <>
          <div className="h-[168px] w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white">
            <ResponsiveContainer width="100%" height="100%">
              {isAreaView ? (
                <AreaChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="organicBookingFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={areaColor} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={areaColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={{ stroke: "#E2E8F0" }}
                    tickLine={false}
                    tickFormatter={(val, i) => {
                      if (i !== 0 && i !== series.length - 1 && i % tickStep !== 0) return "";
                      return new Date(`${val}T00:00:00.000Z`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      });
                    }}
                    tick={{ fill: "#94A3B8", fontSize: 10, fontWeight: 700 }}
                    height={22}
                  />
                  <YAxis hide domain={[0, "dataMax + 1"]} />
                  <Tooltip
                    cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                      padding: "8px 10px",
                    }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                    formatter={(value) => [formatInt(value), areaLabel]}
                  />
                  <Area
                    type="monotone"
                    dataKey={areaKey}
                    stroke={areaColor}
                    strokeWidth={2.5}
                    fill="url(#organicBookingFill)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: areaColor }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              ) : (
                <LineChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={{ stroke: "#E2E8F0" }}
                    tickLine={false}
                    tickFormatter={(val, i) => {
                      if (i !== 0 && i !== series.length - 1 && i % tickStep !== 0) return "";
                      return new Date(`${val}T00:00:00.000Z`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      });
                    }}
                    tick={{ fill: "#94A3B8", fontSize: 10, fontWeight: 700 }}
                    height={22}
                  />
                  <YAxis hide domain={[0, "dataMax + 1"]} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const raw = payload[0]?.payload;
                      const items = (payload || []).filter((p) => Number(p.value) > 0);
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg">
                          <div className="mb-1.5 font-semibold text-slate-900">{raw?.label}</div>
                          <div className="flex flex-col gap-0.5">
                            {items.map((p) => (
                              <div key={p.dataKey} className="flex items-center justify-between gap-3 text-slate-700">
                                <span className="flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                                  {formatUtmLabel(p.dataKey)}
                                </span>
                                <span className="font-semibold tabular-nums">{formatInt(p.value)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-1.5 border-t border-slate-100 pt-1 font-semibold text-slate-800">
                            Total: {formatInt(raw?.total)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {visibleLineKeys.map((key) => {
                    const colorIdx = lineKeys.indexOf(key);
                    const color = UTM_ANALYTICS_CHART_COLORS[colorIdx % UTM_ANALYTICS_CHART_COLORS.length];
                    return (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: color }}
                        isAnimationActive={false}
                      />
                    );
                  })}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
          {trendView === "sources" && lineKeys.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lineKeys.map((key, idx) => {
                const active = !hiddenSources.has(key);
                const color = UTM_ANALYTICS_CHART_COLORS[idx % UTM_ANALYTICS_CHART_COLORS.length];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSource(key)}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset transition !outline-none",
                      active
                        ? "bg-sky-50 text-sky-800 ring-sky-200"
                        : "bg-white text-slate-400 ring-slate-200 line-through opacity-60",
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: active ? color : "#cbd5e1" }}
                    />
                    {formatUtmLabel(key)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

// ─── Conversion drill-down (2-col cards + hover tips) ──────────────────────────

const CONVERSION_TABLE_CAP = 10;

function buildConversionTipPayload(row) {
  const label = formatUtmLabel(row.fullName || row.name);
  const bookings = Number(row.bookings || 0);
  const purchases = Number(row.purchases || 0);
  const rate = Number(row.conversionRate || 0);
  const pill = conversionPill(rate, bookings);
  return { id: row.fullName || row.name, label, bookings, purchases, rate, pill };
}

function ConversionCursorTipCard({ label, bookings, purchases, rate, pill }) {
  if (bookings <= 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg">
        <p className="font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-slate-500">No calls in range</p>
      </div>
    );
  }
  const footer = conversionGoalFooter(rate, purchases, bookings, pill.lowSample);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] shadow-lg">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-1.5 text-slate-700">
        {formatInt(bookings)} calls · {formatInt(purchases)} sales
      </p>
      <p className={cx("mt-0.5 font-semibold tabular-nums", getConversionClass(rate))}>
        {pill.label} close rate
      </p>
      {footer ? (
        <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[10px] font-medium leading-snug text-slate-600">
          {footer}
        </p>
      ) : null}
    </div>
  );
}

function ConversionSourceRow({ row, loading, maxBookings, cursorTipHandlers }) {
  const label = formatUtmLabel(row.fullName || row.name);
  const bookings = Number(row.bookings || 0);
  const purchases = Number(row.purchases || 0);
  const rate = Number(row.conversionRate || 0);
  const pill = conversionPill(rate, bookings);
  const volumeWidth = Math.max(bookings > 0 ? 4 : 0, (bookings / maxBookings) * 100);
  const rateWidth = rate > 0 ? Math.max(4, conversionRateBarWidth(rate)) : 0;
  const goalLeft = 100;

  return (
    <article
      className="flex h-full flex-col rounded-lg border border-slate-100 bg-white px-2 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:border-slate-200 hover:bg-slate-50/50"
      {...(loading || !cursorTipHandlers ? {} : cursorTipHandlers)}
    >
      <div className="mb-1 flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-slate-900">
            {loading ? <ShimmerText className="h-3 w-20" /> : label}
          </p>
          <p className="mt-0.5 truncate text-[9px] font-medium text-slate-500">
            {loading ? (
              <ShimmerText className="h-2 w-16" />
            ) : (
              <>
                {formatInt(bookings)} calls · {formatInt(purchases)} sales
                {pill.lowSample ? <span className="text-slate-400"> · low n</span> : null}
              </>
            )}
          </p>
        </div>
        <div className="shrink-0">
          {loading ? (
            <ShimmerText className="h-4 w-10" />
          ) : (
            <span
              className={cx(
                "inline-flex min-w-[44px] justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                pill.className,
              )}
            >
              {pill.label}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <ShimmerBlock className="mt-auto h-[18px] w-full rounded-full" />
      ) : (
        <div className="mt-auto space-y-1">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/60">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-sky-600/90"
              style={{ width: `${volumeWidth}%` }}
            />
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/60">
            <div
              className={cx("absolute inset-y-0 left-0 rounded-full opacity-90", pill.barClass)}
              style={{ width: `${rateWidth}%` }}
            />
            <div
              className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 rounded-full bg-slate-700 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
              style={{ left: `${goalLeft}%` }}
              title={`${CONVERSION_GOAL_PCT}% goal`}
            />
          </div>
        </div>
      )}
    </article>
  );
}

function ConversionDrilldownTable({ rows, loading, view, onViewChange }) {
  const { tip, panelBindings, targetHandlers } = usePanelCursorTooltip();

  const sorted = useMemo(() => {
    const merged = mergeConversionRows(rows, view);
    return [...merged].sort((a, b) => Number(b.bookings || 0) - Number(a.bookings || 0));
  }, [rows, view]);

  const visible = sorted.slice(0, CONVERSION_TABLE_CAP);
  const hiddenCount = Math.max(0, sorted.length - visible.length);
  const maxBookings = Math.max(...visible.map((r) => Number(r.bookings || 0)), 1);

  const displayRows = loading
    ? Array.from({ length: 6 }).map((_, i) => ({
        name: `—${i}`,
        fullName: `—${i}`,
        bookings: 0,
        purchases: 0,
        conversionRate: 0,
      }))
    : visible;

  const conversionTitle = `Close rate by ${view === "campaign" ? "campaign" : "source"}`;

  return (
    <section className="overflow-visible rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <OrganicSectionHeader
        title={conversionTitle}
        badge="Close rate"
        infoTitle="Close rate breakdown"
        infoBody="Sales divided by organic calls in range. Source view merges similar Facebook and Instagram names. Hover a row for details."
        subtitle={`Top ${CONVERSION_TABLE_CAP} by volume${view === "source" ? " · similar names merged" : ""} · ${BENCHMARKS.CONVERSION}% goal`}
      />
      <div className="mb-2 space-y-2">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-100">
              <span className="inline-block h-2 w-4 rounded-full bg-sky-600" />
              Volume
            </span>
            <span className="flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-100">
              <span className="inline-flex items-center gap-0.5">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Close rate
            </span>
            <span className="flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-100">
              <span className="inline-block h-2 w-0.5 rounded-full bg-slate-700" />
              {CONVERSION_GOAL_PCT}% goal
            </span>
          </div>

          <div className="w-full min-w-0 sm:w-auto sm:shrink-0">
            <SegmentedTabs
              size="xs"
              fit
              className="!w-full sm:!w-fit"
              items={CONVERSION_VIEW_ITEMS}
              activeId={view}
              onChange={onViewChange}
            />
          </div>
        </div>
      </div>

      {!loading && sorted.length === 0 ? (
        <p className="py-6 text-center text-[11px] font-medium text-slate-400">No data in this range</p>
      ) : (
        <div
          {...panelBindings()}
          className="relative grid grid-cols-1 gap-1.5 sm:grid-cols-2"
        >
          <PanelCursorTooltip tip={tip}>
            {(payload) => <ConversionCursorTipCard {...payload} />}
          </PanelCursorTooltip>
          {displayRows.map((row) => (
            <ConversionSourceRow
              key={`${view}-${row.fullName || row.name}`}
              row={row}
              loading={loading}
              maxBookings={maxBookings}
              cursorTipHandlers={loading ? null : targetHandlers(buildConversionTipPayload(row))}
            />
          ))}
        </div>
      )}

      {hiddenCount > 0 && !loading ? (
        <p className="mt-2 text-center text-[10px] font-medium text-slate-400">
          +{hiddenCount} more {view === "campaign" ? "campaigns" : "sources"} · narrow range or filter
        </p>
      ) : null}
    </section>
  );
}

function buildMediumTipPayload(row, mediumKeys, colorByKey) {
  const segments = mediumKeys
    .map((med) => ({
      med,
      value: Number(row[med] || 0),
      color: colorByKey[med],
    }))
    .filter((s) => s.value > 0);
  return {
    source: row.source,
    total: row.total,
    segments,
  };
}

function MediumCursorTipCard({ source, total, segments }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg">
      <p className="font-semibold text-slate-900">{formatUtmLabel(source)}</p>
      <p className="mt-0.5 text-[10px] font-medium text-slate-500">How people found you on this platform</p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {segments.map((s) => (
          <div key={s.med} className="flex items-center justify-between gap-3 text-slate-700">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.med}
            </span>
            <span className="font-semibold tabular-nums">
              {formatInt(s.value)}
              <span className="font-medium text-slate-500">
                {" "}
                ({total > 0 ? formatPct((s.value / total) * 100, 0) : "0%"})
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 border-t border-slate-100 pt-1 font-semibold text-slate-800">
        {formatInt(total)} calls on {formatUtmLabel(source)}
      </p>
    </div>
  );
}

function MediumBySourceChart({ mediumBySource, mediumKeys, loading }) {
  const { rows, mediumKeys: canonKeys } = useMemo(
    () => buildMediumChartModel(mediumBySource, mediumKeys),
    [mediumBySource, mediumKeys],
  );

  const colorByKey = useMemo(() => {
    const map = {};
    canonKeys.forEach((med) => {
      map[med] = getMediumSegmentColor(med);
    });
    return map;
  }, [canonKeys]);

  const payloadBySource = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const id = row.source;
      map[id] = { ...buildMediumTipPayload(row, canonKeys, colorByKey), id };
    });
    return map;
  }, [rows, canonKeys, colorByKey]);

  const { tip, panelRowBindings, rowTipAttr } = usePanelCursorTooltip();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <OrganicSectionHeader
        title="Medium mix"
        badge="By medium"
        infoTitle="Medium mix"
        infoBody="How people found you on each platform (bio, DM, video, etc.). Instagram, Facebook, TikTok, and YouTube only."
        subtitle="Breakdown within each platform"
      />

      {loading ? (
        <div className="space-y-2">
          <ShimmerBlock className="h-10 w-full rounded-lg" />
          <ShimmerBlock className="h-10 w-full rounded-lg" />
        </div>
      ) : rows.length === 0 || canonKeys.length === 0 ? (
        <p className="py-4 text-center text-[11px] font-medium text-slate-400">No social UTMs in range</p>
      ) : (
        <>
          <div
            {...panelRowBindings((el) => payloadBySource[el.getAttribute("data-panel-tip-row")])}
            className="relative divide-y divide-slate-100 rounded-xl border border-dashed border-slate-200 bg-white px-2 py-1"
          >
            <PanelCursorTooltip tip={tip} estimateHeight={130}>
              {(payload) => <MediumCursorTipCard {...payload} />}
            </PanelCursorTooltip>

            {rows.map((row) => {
              const rowId = row.source;
              const top = getTopMediumForRow(row, canonKeys);

              return (
                <div key={rowId} {...rowTipAttr(rowId)} className="py-2">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold text-slate-900">
                      {formatUtmLabel(row.source)}
                    </p>
                    <p className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-600">
                      {formatInt(row.total)} calls
                    </p>
                  </div>
                  <div className="flex h-4 w-full overflow-hidden rounded-md bg-slate-100">
                    {canonKeys.map((med) => {
                      const val = Number(row[med] || 0);
                      if (val <= 0) return null;
                      const segW = (val / row.total) * 100;
                      return (
                        <div
                          key={med}
                          className="h-full shrink-0"
                          style={{
                            width: `${segW}%`,
                            backgroundColor: colorByKey[med],
                          }}
                        />
                      );
                    })}
                  </div>
                  {top ? (
                    <p className="mt-1 text-[9px] font-medium text-slate-500">
                      Top medium:{" "}
                      <span className="font-semibold text-slate-700">
                        {top.med} · {formatPct(top.pct, 0)}
                      </span>
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 border-t border-slate-100 pt-2">
            {canonKeys.map((med) => (
              <span key={med} className="flex items-center gap-1 text-[9px] font-semibold text-slate-600">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: colorByKey[med] }}
                />
                {med}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function OrganicStatsTab() {
  const customFallback = useMemo(() => getOrganicRangeBounds("last7"), []);
  const [range, setRange] = useState("mtd");
  const [customStart, setCustomStart] = useState(customFallback.start.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(customFallback.end.toISOString().slice(0, 10));
  const [sourceFilter, setSourceFilter] = useState("");
  const [conversionView, setConversionView] = useState("source");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(EMPTY_DATA);
  const [sourceOptions, setSourceOptions] = useState([]);

  const rangeBounds = useMemo(
    () => getOrganicRangeBounds(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      const startISO = rangeBounds.start.toISOString();
      const endISO = rangeBounds.end.toISOString();
      const filterVal = sourceFilter.trim() || null;

      try {
        const [filtered, unfiltered] = await Promise.all([
          fetchUTMAnalytics(startISO, endISO, { sourceFilter: filterVal }),
          fetchUTMAnalytics(startISO, endISO, {}),
        ]);
        if (cancelled) return;
        setData(filtered || EMPTY_DATA);
        setSourceOptions((unfiltered?.pieData || []).map((r) => r.name));
        if (filterVal && !(unfiltered?.pieData || []).some((r) => r.name.toLowerCase() === filterVal)) {
          setSourceFilter("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load organic analytics");
          setData(EMPTY_DATA);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [rangeBounds, sourceFilter]);

  const overallConversion =
    data.totalOrganicCalls > 0 ? (data.totalPurchases / data.totalOrganicCalls) * 100 : 0;

  const conversionRows =
    conversionView === "campaign" ? data.conversionByCampaign : data.conversionByPlatform;

  return (
    <div className="flex flex-col gap-4">
      <OrganicFiltersBar
        range={range}
        onRangeChange={setRange}
        customStart={customStart}
        onCustomStartChange={setCustomStart}
        customEnd={customEnd}
        onCustomEndChange={setCustomEnd}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        sourceOptions={sourceOptions}
        rangeBounds={rangeBounds}
        loading={loading}
      />
      {/* <OrganicDataScopeNote /> */}

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-8 gap-2">
        {/* ── Left column ── */}
        <div className="col-span-2 flex flex-col gap-2">
          <OrganicLeftColumn
            totalOrganicCalls={data.totalOrganicCalls}
            totalPurchases={data.totalPurchases}
            aiBot={data.aiBot}
            overallConversion={overallConversion}
            bookingsPerDay={data.bookingsPerDay}
            pieData={data.pieData}
            sourceFilter={sourceFilter}
            loading={loading}
          />
        </div>
        {/* ── Center column ── */}
        <div className="col-span-4 flex flex-col gap-2">
          <DailyBookingsTrendPanel
            bookingsPerDay={data.bookingsPerDay}
            sourceKeys={data.bookingsPerDaySourceKeys}
            loading={loading}
          />
          <ConversionDrilldownTable
            rows={conversionRows}
            loading={loading}
            view={conversionView}
            onViewChange={setConversionView}
          />
        </div>

        {/* ── Right column ── */}
        <div className="col-span-2 flex flex-col gap-2">
          <SourceMixPanel pieData={data.pieData} loading={loading} />
          <MediumBySourceChart mediumBySource={data.mediumBySource} mediumKeys={data.mediumKeys} loading={loading} />
        </div>
      </div>
    </div>
  );
}
