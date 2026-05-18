import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
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
import { getConversionBgClass, getConversionClass } from "../../../../utils/performanceBenchmarks";
import SegmentedTabs from "../segmented-tabs";

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

const EMPTY_DATA = {
  pieData: [],
  organicDaily: [],
  totalOrganicCalls: 0,
  totalPurchases: 0,
  mediumBySource: [],
  campaignData: [],
  conversionByPlatform: [],
  conversionByCampaign: [],
  bookingsPerDay: [],
  bookingsPerDaySourceKeys: [],
  mediumKeys: [],
};

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

/** Human-readable UTM dimension labels (null / empty in DB). */
function formatUtmLabel(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.toLowerCase() === "null") return "Not set";
  if (s.toLowerCase() === "unknown") return "Unknown";
  return s;
}

function conversionPill(conv, bookings) {
  const b = Number(bookings || 0);
  const c = Number(conv || 0);
  if (b <= 0) {
    return { label: "—", className: "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200/80" };
  }
  if (b < 5) {
    return {
      label: formatPct(c),
      className: cx(
        "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200/80",
        getConversionClass(c),
      ),
    };
  }
  return {
    label: formatPct(c),
    className: cx(
      "ring-1 ring-inset ring-black/5",
      getConversionBgClass(c),
      getConversionClass(c),
    ),
  };
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
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

function getOrganicRangeBounds(range, customStart = null, customEnd = null) {
  const now = new Date();

  if (range === "custom") {
    return normalizeCustomBounds(customStart, customEnd);
  }
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
    const monthRange = DateHelpers.getMonthRangeInTimezone(
      previousMonth,
      DateHelpers.DEFAULT_TIMEZONE,
    );
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

function MetricInfo({ title, body }) {
  return (
    <span className="group relative inline-flex h-3.5 w-3.5 shrink-0 cursor-default items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold leading-none text-slate-500">
      i
      <span className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1 w-[168px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium leading-snug text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.14)] group-hover:visible">
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

function OrganicFiltersBar({
  range,
  onRangeChange,
  customStart,
  onCustomStartChange,
  customEnd,
  onCustomEndChange,
  sourceFilter,
  onSourceFilterChange,
  sourceOptions,
  rangeBounds,
  loading,
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
          <label htmlFor="organic-source-filter" className="sr-only">
            UTM source filter
          </label>
          <select
            id="organic-source-filter"
            value={sourceFilter || ""}
            onChange={(e) => onSourceFilterChange?.(e.target.value)}
            disabled={loading}
            className="h-6 max-w-[min(100%,220px)] cursor-pointer rounded border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-700 !outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 disabled:cursor-not-allowed disabled:opacity-50"
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
      <p className="mt-1.5 text-[10px] font-medium leading-snug text-slate-500">
        Organic only — paid ads excluded. Calls by{" "}
        <span className="font-semibold text-slate-600">call_date</span>; sales by{" "}
        <span className="font-semibold text-slate-600">purchase_date</span>.
      </p>
    </div>
  );
}

function KpiRevenueCard({ label, value, note, badge, badgeClass, loading, infoTitle, infoBody }) {
  return (
    <article className="min-h-[96px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        {infoBody ? <MetricInfo title={infoTitle || label} body={infoBody} /> : null}
      </div>
      {loading ? (
        <ShimmerBlock className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-2 text-[24px] font-extrabold leading-none tracking-normal text-slate-950 tabular-nums">
          {value}
        </p>
      )}
      <p className="mt-2 text-[11px] font-semibold text-slate-500">{note}</p>
      {badge ? (
        <div className="mt-2">
          <span className={cx("inline-flex rounded-md px-2 py-1 text-[10px] font-extrabold leading-none", badgeClass)}>
            {loading ? <ShimmerText className="h-2.5 w-16" /> : badge}
          </span>
        </div>
      ) : null}
    </article>
  );
}

function BookingsSparklineCard({ series, loading }) {
  const chartData = useMemo(
    () =>
      (series || []).map((row) => ({
        d: formatShortDate(row.date),
        isoDay: row.date,
        v: Number(row.total || 0),
      })),
    [series],
  );

  return (
    <article className="flex min-h-[128px] flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Booking pace</p>
        <MetricInfo
          title="Booking pace"
          body="Total organic bookings by book_date per day. Reschedules deduped; optional UTM source filter applies."
        />
      </div>
      {loading ? (
        <ShimmerBlock className="mt-3 min-h-[72px] flex-1 w-full" />
      ) : (
        <>
          <p className="mt-1 text-[22px] font-bold tabular-nums leading-none text-slate-900">
            {formatInt(chartData.reduce((s, r) => s + r.v, 0))}
          </p>
          <div className="mt-2 min-h-[56px] flex-1 w-full">
            {chartData.length === 0 ? (
              <p className="py-4 text-center text-[11px] font-medium text-slate-400">No bookings in range</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={56}>
                <BarChart data={chartData} margin={{ top: 4, right: 2, left: 0, bottom: 0 }}>
                  <XAxis dataKey="d" hide />
                  <YAxis hide domain={[0, "dataMax + 1"]} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      fontSize: 11,
                    }}
                    labelFormatter={(_, payload) => {
                      const raw = payload?.[0]?.payload?.isoDay;
                      return raw ? formatShortDate(raw) : "";
                    }}
                    formatter={(value) => [formatInt(value), "Bookings"]}
                  />
                  <Bar dataKey="v" fill="#22c55e" radius={[3, 3, 0, 0]} minPointSize={2} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-1 text-[10px] font-medium text-slate-400">Sum of daily book_date counts</p>
        </>
      )}
    </article>
  );
}

function SourceMixDonut({ pieData, loading }) {
  const slices = useMemo(() => {
    const sorted = [...(pieData || [])].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, r) => s + r.value, 0);
    const rows = top.map((r, i) => ({
      name: r.name,
      value: r.value,
      fill: UTM_ANALYTICS_CHART_COLORS[i % UTM_ANALYTICS_CHART_COLORS.length],
    }));
    if (rest > 0) {
      rows.push({ name: "Other", value: rest, fill: "#cbd5e1" });
    }
    return rows;
  }, [pieData]);

  const total = slices.reduce((s, r) => s + r.value, 0);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Source mix</p>
        <MetricInfo title="Source mix" body="Share of organic calls by utm_source (top 5 + other)." />
      </div>
      {loading ? (
        <div className="mt-3 flex items-center gap-3">
          <ShimmerBlock className="h-[88px] w-[88px] rounded-full" />
          <div className="flex-1 space-y-2">
            <ShimmerBlock className="h-3 w-full" />
            <ShimmerBlock className="h-3 w-4/5" />
            <ShimmerBlock className="h-3 w-3/5" />
          </div>
        </div>
      ) : total === 0 ? (
        <p className="mt-4 py-6 text-center text-[11px] font-medium text-slate-400">No source data</p>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <div className="h-[88px] w-[88px] shrink-0">
            <PieChart width={88} height={88}>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={26}
                outerRadius={40}
                stroke="none"
                isAnimationActive={false}
              >
                {slices.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </div>
          <ul className="min-w-0 flex-1 space-y-1">
            {slices.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} />
                  <span className="truncate font-semibold text-slate-700">{formatUtmLabel(row.name)}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                  {formatPct(total > 0 ? (row.value / total) * 100 : 0, 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

const CONVERSION_TABLE_CAP = 9;

function ConversionDrilldownTable({ rows, loading, view, onViewChange }) {
  const sorted = useMemo(
    () => [...(rows || [])].sort((a, b) => Number(b.bookings || 0) - Number(a.bookings || 0)),
    [rows],
  );
  const visible = sorted.slice(0, CONVERSION_TABLE_CAP);
  const hiddenCount = Math.max(0, sorted.length - visible.length);
  const displayRows = loading
    ? Array.from({ length: 6 }).map((_, i) => ({
        name: `—${i}`,
        fullName: `—${i}`,
        bookings: 0,
        purchases: 0,
        conversionRate: 0,
      }))
    : visible;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold tracking-normal text-slate-950">UTM performance</h2>
            <MetricInfo
              title="UTM performance"
              body="Calls booked vs purchases in range, by utm_source or utm_campaign. Close rate = purchases ÷ calls booked."
            />
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">
            Top {CONVERSION_TABLE_CAP} by call volume · muted close rate when under 5 calls
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SectionBadge>UTM · CRM</SectionBadge>
          <SegmentedTabs
            size="xs"
            className="!w-fit shrink-0"
            items={CONVERSION_VIEW_ITEMS}
            activeId={view}
            onChange={onViewChange}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-1.5">
        <div className="grid grid-cols-[minmax(0,1.35fr)_64px_64px_88px] items-end gap-x-2 px-1.5 pb-1.5 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          <div>{view === "campaign" ? "Campaign" : "Source"}</div>
          <div className="text-right">Calls</div>
          <div className="text-right">Sales</div>
          <div className="text-right">Close rate</div>
        </div>

        <div className="divide-y divide-slate-100/90">
          {!loading && sorted.length === 0 ? (
            <p className="py-5 text-center text-[11px] font-medium text-slate-400">No UTM rows in this range</p>
          ) : (
            displayRows.map((row) => {
              const label = formatUtmLabel(row.fullName || row.name);
              const bookings = Number(row.bookings || 0);
              const purchases = Number(row.purchases || 0);
              const pill = conversionPill(row.conversionRate, bookings);
              return (
                <div
                  key={row.fullName || row.name}
                  className="grid grid-cols-[minmax(0,1.35fr)_64px_64px_88px] items-center gap-x-2 px-1.5 py-1.5"
                  title={label}
                >
                  <div className="min-w-0 truncate text-[11px] font-semibold text-slate-900">
                    {loading ? <ShimmerText className="h-3 w-24" /> : label}
                  </div>
                  <div className="text-right text-[11px] font-medium tabular-nums text-slate-600">
                    {loading ? <ShimmerText className="ml-auto h-3 w-7" /> : formatInt(bookings)}
                  </div>
                  <div className="text-right text-[11px] font-medium tabular-nums text-slate-600">
                    {loading ? <ShimmerText className="ml-auto h-3 w-7" /> : formatInt(purchases)}
                  </div>
                  <div className="text-right">
                    {loading ? (
                      <ShimmerText className="ml-auto h-3 w-12" />
                    ) : (
                      <span
                        className={cx(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                          pill.className,
                        )}
                        title={
                          bookings > 0 ? `${purchases} sales from ${bookings} calls` : undefined
                        }
                      >
                        {pill.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {hiddenCount > 0 && !loading ? (
          <p className="border-t border-slate-100 px-2 py-1.5 text-center text-[10px] font-medium text-slate-400">
            +{hiddenCount} more {view === "campaign" ? "campaigns" : "sources"} — narrow the range or filter by source
          </p>
        ) : null}
      </div>
    </section>
  );
}

function OrganicLeadsTrendChart({ organicDaily, loading }) {
  const chartData = useMemo(
    () =>
      (organicDaily || []).map((row) => ({
        date: row.date,
        label: formatShortDate(row.date),
        leads: Number(row.leads || 0),
      })),
    [organicDaily],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-slate-950">Daily book trend</h3>
            <MetricInfo
              title="Daily book trend"
              body="Organic calls with a book_date per day — one line, not split by source."
            />
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">By book_date</p>
        </div>
        <SectionBadge>Trend</SectionBadge>
      </div>
      {loading ? (
        <ShimmerBlock className="h-[132px] w-full rounded-lg" />
      ) : chartData.length === 0 ? (
        <p className="flex h-[132px] items-center justify-center text-[11px] font-medium text-slate-400">
          No book_date activity in range
        </p>
      ) : (
        <div className="h-[132px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="organicLeadsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={[0, "dataMax + 1"]} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 11,
                }}
                labelFormatter={(_, payload) => {
                  const raw = payload?.[0]?.payload?.date;
                  return raw ? formatShortDate(raw) : "";
                }}
                formatter={(value) => [formatInt(value), "Leads booked"]}
              />
              <Area
                type="monotone"
                dataKey="leads"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#organicLeadsFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function TopLineCard({ card, loading }) {
  return (
    <article className="flex min-h-[76px] flex-col rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500 leading-tight">
          {card.label}
        </p>
        {card.infoBody ? (
          <MetricInfo title={card.infoTitle || card.label} body={card.infoBody} />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
      </div>
      <div className="mt-auto flex flex-1 flex-col justify-end pt-2">
        <p
          className={cx(
            "text-[16px] font-semibold leading-none tracking-normal tabular-nums",
            card.valueClass || "text-slate-900",
          )}
        >
          {loading ? <ShimmerText className="h-5 w-16" /> : card.value}
        </p>
        <div className="mt-1.5 min-h-[18px]">
          <span
            className={cx(
              "inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none",
              card.badgeClass || "bg-slate-100 text-slate-600",
            )}
            title={typeof card.badge === "string" ? card.badge : undefined}
          >
            {loading ? <ShimmerText className="h-2.5 w-14" /> : card.badge}
          </span>
        </div>
      </div>
    </article>
  );
}

function TopCampaignsList({ campaigns, loading }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Top campaigns by volume</h3>
        <MetricInfo title="Top campaigns" body="utm_campaign volume for organic calls in the selected range." />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="divide-y divide-dashed divide-slate-100">
          {(campaigns?.length ? campaigns : []).length === 0 && !loading ? (
            <p className="py-4 text-center text-[11px] font-medium text-slate-400">No campaigns</p>
          ) : (
            (campaigns?.length ? campaigns.slice(0, 6) : Array.from({ length: 5 }).map((_, i) => ({ name: `—${i}`, value: 0, percentage: 0 }))).map(
              (row) => (
                <div
                  key={row.fullName || row.name}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2"
                  title={row.fullName || row.name}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-slate-950">
                      {loading ? <ShimmerText className="h-3 w-28" /> : formatUtmLabel(row.name)}
                    </div>
                    <div className="mt-0.5 text-[10px] font-medium text-slate-500">
                      {loading ? <ShimmerText className="h-2.5 w-20" /> : `${formatInt(row.value)} calls · ${formatPct(row.percentage, 0)}`}
                    </div>
                  </div>
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, Number(row.percentage || 0))}%` }}
                    />
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </section>
  );
}

function SocialMediumBreakdown({ mediumBySource, mediumKeys, loading }) {
  const platforms = mediumBySource || [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          IG · FB · TikTok · YT
        </h3>
        <MetricInfo
          title="Social mediums"
          body="utm_medium breakdown for Instagram, Facebook, TikTok, and YouTube organic calls."
        />
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-2">
        {loading ? (
          <>
            <ShimmerBlock className="my-2 h-10 w-full" />
            <ShimmerBlock className="my-2 h-10 w-full" />
          </>
        ) : platforms.length === 0 ? (
          <p className="py-4 text-center text-[11px] font-medium text-slate-400">No social UTMs in range</p>
        ) : (
          platforms.map((row) => {
            const keys = (mediumKeys || []).filter((k) => Number(row[k] || 0) > 0);
            const topMedium = keys.sort((a, b) => Number(row[b] || 0) - Number(row[a] || 0))[0];
            return (
              <div key={row.source} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 py-2">
                <span className="text-[11px] font-bold uppercase text-slate-700">{row.source}</span>
                <div className="min-w-0 truncate text-[10px] font-medium text-slate-500">
                  {keys.length === 0
                    ? "—"
                    : keys
                        .slice(0, 3)
                        .map((k) => `${k}: ${formatInt(row[k])}`)
                        .join(" · ")}
                </div>
                <span className="text-[12px] font-semibold tabular-nums text-slate-900">
                  {formatInt(row.total)}
                  {topMedium ? (
                    <span className="ml-1 text-[9px] font-medium text-slate-400">({topMedium})</span>
                  ) : null}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

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
    return () => {
      cancelled = true;
    };
  }, [rangeBounds, sourceFilter]);

  const overallConversion =
    data.totalOrganicCalls > 0 ? (data.totalPurchases / data.totalOrganicCalls) * 100 : 0;

  const avgDailyBookings = useMemo(() => {
    const days = (data.organicDaily || []).length;
    if (!days) return 0;
    const sum = (data.organicDaily || []).reduce((s, r) => s + Number(r.leads || 0), 0);
    return sum / days;
  }, [data.organicDaily]);

  const conversionRows =
    conversionView === "campaign" ? data.conversionByCampaign : data.conversionByPlatform;

  const topLineCards = useMemo(
    () => [
      {
        label: "Close rate",
        value: formatPct(overallConversion),
        valueClass: getConversionClass(overallConversion),
        badge: "Goal 32%",
        badgeClass: getConversionBgClass(overallConversion),
        infoTitle: "Close rate",
        infoBody: "Purchases ÷ organic calls (call_date window). From CRM outcome_log.",
      },
      {
        label: "Avg / day",
        value: avgDailyBookings.toFixed(1),
        valueClass: "text-slate-900",
        badge: "book_date",
        badgeClass: "bg-sky-100 text-sky-800",
        infoTitle: "Daily bookings",
        infoBody: "Average organic leads booked per day in the selected range.",
      },
      {
        label: "UTM sources",
        value: formatInt((data.pieData || []).length),
        badge: sourceFilter ? formatUtmLabel(sourceFilter) : "All sources",
        badgeClass: "bg-indigo-100 text-indigo-700",
        infoTitle: "Source count",
        infoBody: "Distinct utm_source values on organic calls in this window.",
      },
    ],
    [overallConversion, avgDailyBookings, data.pieData, sourceFilter],
  );

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

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <div className="grid gap-2">
            <KpiRevenueCard
              label="Organic calls"
              value={formatInt(data.totalOrganicCalls)}
              note="With call_date in range"
              badge="Excludes paid ads"
              badgeClass="bg-emerald-100 text-emerald-700"
              loading={loading}
              infoBody="Deduped organic calls with call_date in the selected window."
            />
            <KpiRevenueCard
              label="Purchases"
              value={formatInt(data.totalPurchases)}
              note="purchase_date in range"
              badge={`Close rate ${formatPct(overallConversion)}`}
              badgeClass={getConversionBgClass(overallConversion)}
              loading={loading}
              infoBody="CRM purchases linked to organic calls (purchase_date in range)."
            />
          </div>
          <BookingsSparklineCard series={data.bookingsPerDay} loading={loading} />
          <SourceMixDonut pieData={data.pieData} loading={loading} />
        </div>

        <div className="col-span-4 flex flex-col gap-3">
          <ConversionDrilldownTable
            rows={conversionRows}
            loading={loading}
            view={conversionView}
            onViewChange={setConversionView}
          />
          <OrganicLeadsTrendChart organicDaily={data.organicDaily} loading={loading} />
        </div>

        <div className="col-span-2 flex flex-col gap-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-1.5">
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Snapshot</h2>
              <MetricInfo
                title="Organic snapshot"
                body="Headline rates for the filtered organic UTM window."
              />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {topLineCards.map((card) => (
                <TopLineCard key={card.label} card={card} loading={loading} />
              ))}
            </div>
          </section>
          <TopCampaignsList campaigns={data.campaignData} loading={loading} />
          <SocialMediumBreakdown
            mediumBySource={data.mediumBySource}
            mediumKeys={data.mediumKeys}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
