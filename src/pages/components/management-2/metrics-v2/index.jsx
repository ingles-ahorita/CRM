import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, GripVertical } from "lucide-react";
import SegmentedTabs from "../segmented-tabs";
import { useManagementMetricsData } from "./useManagementMetricsData";
import {
  COMPARISON_METRICS,
  DEFAULT_COMPARISON_METRICS,
  LINKED_ITEMS,
  PURCHASE_TAB_ITEMS,
  RANGE_ITEMS,
  SOURCE_ITEMS,
  VIEW_ITEMS,
  cx,
  formatInt,
  formatPct,
  formatUsd,
  metricValue,
  selectedStats,
  sortTeamRows,
  splitPurchases,
} from "./metricTransforms";

const TEAM_SORT_OPTIONS = [
  { value: "conversion", label: "Conversion" },
  { value: "showUp", label: "Show-up" },
  { value: "recovery", label: "Recovery" },
  { value: "purchases", label: "Purchases" },
  { value: "pickup", label: "Pick-up" },
  { value: "name", label: "Name" },
];
const TEAM_VIEW_ITEMS = [
  { id: "closers", label: "Closers" },
  { id: "setters", label: "Setters" },
];

const COUNTRY_METRICS = [
  { value: "conversion", label: "Conversion" },
  { value: "showUp", label: "Show-up" },
  { value: "pickup", label: "Pick-up" },
  { value: "recovery", label: "Recovery" },
  { value: "purchases", label: "Purchases" },
  { value: "bookings", label: "Bookings" },
];

const METRIC_COLORS = {
  bookingsMade: "#64748b",
  confirmationRate: "#7c3aed",
  conversionRate: "#d97706",
  dqRate: "#be123c",
  pickUpRate: "#2563eb",
  purchased: "#059669",
  recoveryRate: "#0f766e",
  showedUp: "#0d9488",
  showUpRate: "#059669",
  successRate: "#4338ca",
};

function Panel({ title, kicker, action, children, className = "" }) {
  return (
    <section className={cx("flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-2", className)}>
      <div className="mb-2 flex min-h-8 items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold leading-tight text-slate-950">{title}</h3>
          {kicker && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kicker}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function StatCard({ label, value, sub, tone = "slate" }) {
  const tones = {
    blue: "text-blue-700 bg-white border-slate-200",
    emerald: "text-emerald-700 bg-white border-slate-200",
    rose: "text-rose-700 bg-white border-slate-200",
    amber: "text-amber-700 bg-white border-slate-200",
    slate: "text-slate-800 bg-white border-slate-200",
  };
  return (
    <div className={cx("min-h-[82px] rounded-xl border px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]", tones[tone] || tones.slate)}>
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-black leading-none">{value}</div>
      {sub && <div className="mt-1 truncate text-[11px] font-semibold opacity-70" title={sub}>{sub}</div>}
    </div>
  );
}

function Select({ value, onChange, children, className = "" }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className={cx("h-8 max-w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200", className)}
    >
      {children}
    </select>
  );
}

function LoadingCover({ show }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[1px]">
      <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 shadow-sm">
        Loading metrics...
      </div>
    </div>
  );
}

function SectionBadge({ children }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function ShimmerBlock({ className = "", style }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} style={style} />;
}

function PanelSkeleton({ rows = 5, chart = false }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {chart ? (
        <div className="flex h-[230px] items-end gap-2">
          {[48, 76, 42, 88, 60, 72, 54, 82, 66, 44].map((height, index) => (
            <ShimmerBlock key={index} className="w-full" style={{ height }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1fr_56px] items-center gap-3">
              <div>
                <ShimmerBlock className="h-3 w-3/4" />
                <ShimmerBlock className="mt-1.5 h-2.5 w-1/2" />
              </div>
              <ShimmerBlock className="h-4 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopFilterShell({ children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2">
      {children}
    </div>
  );
}

function FunnelCards({ stats, revenueSummary, loading }) {
  const gross = (revenueSummary?.grossCents || 0) / 100;
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="min-h-[82px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <ShimmerBlock className="h-2.5 w-20" />
            <ShimmerBlock className="mt-3 h-6 w-16" />
            <ShimmerBlock className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <StatCard label="Booked in period" value={formatInt(stats?.bookingsMadeInPeriod)} sub={`${formatInt(stats?.pickedUpFromBookings)} picked up`} tone="blue" />
      <StatCard label="Show-up" value={formatPct(stats?.showUpRateConfirmed || stats?.showUpRate)} sub={`${formatInt(stats?.totalShowedUp)} / ${formatInt(stats?.totalConfirmed)} confirmed`} tone="emerald" />
      <StatCard label="Conversion" value={formatPct(stats?.conversionRate)} sub={`${formatInt(stats?.totalPurchased)} / ${formatInt(stats?.totalShowedUp)} showed`} tone="amber" />
      <StatCard label="Success" value={formatPct(stats?.successRate)} sub={`${formatInt(stats?.totalPurchased)} / ${formatInt(stats?.totalBooked)} calls`} tone="slate" />
      <StatCard label="DQ rate" value={formatPct(stats?.dqRate)} sub={`${formatInt(stats?.totalDQ)} DQ`} tone="rose" />
      <StatCard label="Recovery rate" value={formatPct(stats?.recoveryRate)} sub={`${formatInt(stats?.totalRecovered)} / ${formatInt(stats?.totalNoShows)} no-shows`} tone="emerald" />
      <StatCard label="Gross revenue" value={formatUsd(gross)} sub={`${formatUsd((revenueSummary?.netCents || 0) / 100)} net`} tone="emerald" />
    </div>
  );
}

function SourceSplit({ sourceStats, mediumStats, loading }) {
  const rows = [
    { label: "Ads", data: sourceStats?.ads, color: "bg-blue-500" },
    { label: "Organic", data: sourceStats?.organic, color: "bg-emerald-500" },
    { label: "TikTok", data: mediumStats?.tiktok, color: "bg-pink-500" },
    { label: "Instagram", data: mediumStats?.instagram, color: "bg-purple-500" },
    { label: "Other ads", data: mediumStats?.other, color: "bg-slate-500" },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex items-center justify-between">
        <SectionBadge>Conversion by split</SectionBadge>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => <ShimmerBlock key={index} className="h-3.5 w-full" />)}
        </div>
      ) : (
      <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[72px_1fr_48px] items-center gap-2 text-[12px]"
          title={`${row.label}: ${formatPct(row.data?.conversionRate)} conversion, ${formatInt(row.data?.totalPurchased)} purchased, ${formatInt(row.data?.totalBooked)} booked`}
        >
          <div className="truncate font-bold text-slate-700">{row.label}</div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className={cx("h-2 rounded-full", row.color)} style={{ width: `${Math.min(100, row.data?.conversionRate || 0)}%` }} />
          </div>
          <div className="text-right font-bold text-slate-900">{formatPct(row.data?.conversionRate)}</div>
        </div>
      ))}
      </div>
      )}
    </div>
  );
}

function TeamPanel({ title, rows, type, sortKey, onSortKey, loading }) {
  const sorted = useMemo(() => sortTeamRows(rows, sortKey).slice(0, 8), [rows, sortKey]);
  return (
    <Panel
      title={title}
      kicker={type === "closer" ? "Showed up + purchase-date sales" : "Book-date pickup + show-up"}
      action={
        <Select value={sortKey} onChange={onSortKey}>
          {TEAM_SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      }
    >
      {loading ? <PanelSkeleton rows={6} /> : (
      <div className="max-h-[240px] space-y-1.5 overflow-auto pr-1">
        {sorted.map((row, index) => {
          const primary = sortKey === "recovery"
            ? row.recoveryRate
            : sortKey === "showUp"
              ? row.showUpRate
              : type === "closer"
                ? row.conversionRate
                : row.pickUpRate;
          const purchases = type === "closer" ? row.purchased : row.totalPurchased;
          return (
            <div
              key={row.id || row.name}
              className="grid grid-cols-[24px_1fr_56px_52px] items-center gap-2 rounded-xl border border-slate-100 bg-white px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              title={`${row.name}: ${formatPct(primary)} ${sortKey}, ${formatInt(purchases)} sold`}
            >
              <div className="text-[11px] font-black text-slate-400">#{index + 1}</div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-bold text-slate-900" title={row.name}>{row.name}</div>
                <div className="text-[10px] font-semibold text-slate-500">
                  {type === "closer"
                    ? `${formatInt(row.purchased)} / ${formatInt(row.showedUp)}`
                    : `${formatInt(row.pickedUpFromBookings)} / ${formatInt(row.bookingsMadeInPeriod)}`}
                </div>
              </div>
              <div className="text-right text-[12px] font-black text-slate-900">{formatPct(primary)}</div>
              <div className="text-right text-[11px] font-bold text-emerald-700">{formatInt(purchases)} sold</div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="py-8 text-center text-[12px] font-semibold text-slate-400">No rows</div>}
      </div>
      )}
    </Panel>
  );
}

function TeamSnapshotPanel({ closers, setters, closerSort, setterSort, onCloserSort, onSetterSort, loading }) {
  const [teamView, setTeamView] = useState("closers");
  const type = teamView === "closers" ? "closer" : "setter";
  const rows = teamView === "closers" ? (closers || []) : (setters || []);
  const sortKey = teamView === "closers" ? closerSort : setterSort;
  const setSortKey = teamView === "closers" ? onCloserSort : onSetterSort;
  const sorted = useMemo(() => sortTeamRows(rows, sortKey).slice(0, 8), [rows, sortKey]);
  return (
    <Panel
      title="Team Snapshot"
      kicker="Compact ranked performance"
      action={
        <div className="flex items-center gap-1">
          <SegmentedTabs items={TEAM_VIEW_ITEMS} activeId={teamView} onChange={setTeamView} size="xs" fit />
          <Select value={sortKey} onChange={setSortKey} className="h-7 text-[11px]">
            {TEAM_SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </div>
      }
    >
      {loading ? <PanelSkeleton rows={6} /> : (
      <div className="max-h-[240px] space-y-1.5 overflow-auto pr-1">
        {sorted.map((row, index) => {
          const primary = sortKey === "recovery"
            ? row.recoveryRate
            : sortKey === "showUp"
              ? row.showUpRate
              : type === "closer"
                ? row.conversionRate
                : row.pickUpRate;
          const purchases = type === "closer" ? row.purchased : row.totalPurchased;
          return (
            <div
              key={row.id || row.name}
              className="grid grid-cols-[22px_1fr_52px_46px] items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1.5"
              title={`${row.name}: ${formatPct(primary)} ${sortKey}, ${formatInt(purchases)} sold`}
            >
              <div className="text-[10px] font-black text-slate-400">#{index + 1}</div>
              <div className="min-w-0 truncate text-[11px] font-bold text-slate-900">{row.name}</div>
              <div className="text-right text-[11px] font-black text-slate-900">{formatPct(primary)}</div>
              <div className="text-right text-[10px] font-bold text-emerald-700">{formatInt(purchases)}</div>
            </div>
          );
        })}
      </div>
      )}
    </Panel>
  );
}

function CountryPanel({ countries, topN, onTopN, metric, onMetric, loading }) {
  const rows = useMemo(
    () => [...(countries || [])].sort((a, b) => metricValue(b, metric) - metricValue(a, metric)).slice(0, topN),
    [countries, metric, topN]
  );
  const max = Math.max(1, ...rows.map((row) => metricValue(row, metric)));
  return (
    <Panel
      title="Country Performance"
      kicker="Phone-derived country"
      action={
        <div className="flex max-w-full flex-wrap justify-end gap-1">
          <Select value={metric} onChange={onMetric}>
            {COUNTRY_METRICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Select value={topN} onChange={(v) => onTopN(Number(v))}>
            {[5, 8, 12].map((n) => <option key={n} value={n}>Top {n}</option>)}
          </Select>
        </div>
      }
    >
      {loading ? <PanelSkeleton rows={7} /> : (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div
            key={row.country}
            className="min-w-0 text-[12px]"
            title={`${row.country || "Unknown"}: ${["conversion", "showUp", "pickup", "recovery"].includes(metric) ? formatPct(metricValue(row, metric)) : formatInt(metricValue(row, metric))} ${metric}`}
          >
            <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0 truncate font-bold text-slate-800" title={row.country}>{row.country || "Unknown"}</div>
              <div className="shrink-0 font-black tabular-nums text-slate-900">
                {["conversion", "showUp", "pickup", "recovery"].includes(metric) ? formatPct(metricValue(row, metric)) : formatInt(metricValue(row, metric))}
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100">
              <div className="h-2.5 rounded-full bg-indigo-500" style={{ width: `${Math.max(4, (metricValue(row, metric) / max) * 100)}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="py-6 text-center text-[12px] font-semibold text-slate-400">No country data in this range</div>}
      </div>
      </div>
      )}
    </Panel>
  );
}

function BookingsChart({ rows, hideReschedules, loading }) {
  const data = hideReschedules
    ? (rows || []).map((row) => ({ ...row, rescheduled: 0, total: row.organic + row.ads }))
    : rows || [];
  const max = Math.max(1, ...data.map((row) => row.total || row.organic + row.ads + row.rescheduled));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {loading ? <PanelSkeleton chart /> : (
      <div className="space-y-2">
        {data.slice(-18).map((row) => {
          const organicPct = ((row.organic || 0) / max) * 100;
          const adsPct = ((row.ads || 0) / max) * 100;
          const rescheduledPct = ((row.rescheduled || 0) / max) * 100;
          return (
            <div
              key={row.date}
              className="grid grid-cols-[54px_1fr_34px] items-center gap-2 text-[11px]"
              title={`${row.date}: ${formatInt(row.organic)} organic, ${formatInt(row.ads)} ads${hideReschedules ? "" : `, ${formatInt(row.rescheduled)} rescheduled`} · ${formatInt(row.total)} total`}
            >
              <div className="font-bold tabular-nums text-slate-500">{String(row.date).slice(5)}</div>
              <div className="flex h-5 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                <div className="bg-emerald-500" style={{ width: `${organicPct}%` }} />
                <div className="bg-blue-500" style={{ width: `${adsPct}%` }} />
                {!hideReschedules && <div className="bg-amber-500" style={{ width: `${rescheduledPct}%` }} />}
              </div>
              <div className="text-right font-black text-slate-900">{formatInt(row.total)}</div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-bold text-slate-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />Organic</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-500" />Ads</span>
          {!hideReschedules && <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />Rescheduled</span>}
        </div>
      </div>
      )}
    </div>
  );
}

function BookingsHeatmap({ rows, loading }) {
  const cells = (rows || []).slice(-28).map((row) => ({
    date: row.date,
    total: row.total || row.organic + row.ads + row.rescheduled,
  }));
  const max = Math.max(1, ...cells.map((cell) => cell.total));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {loading ? <PanelSkeleton chart /> : (
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell) => {
            const alpha = 0.15 + (cell.total / max) * 0.85;
            return (
              <div
                key={cell.date}
                className="flex h-8 items-center justify-center rounded-md border border-slate-200 text-[9px] font-bold text-slate-700"
                style={{ backgroundColor: `rgba(79,70,229,${alpha.toFixed(3)})` }}
                title={`${cell.date}: ${formatInt(cell.total)} bookings`}
              >
                {String(cell.date).slice(8, 10)}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
          <span>Last 28 days booking intensity</span>
          <span>{formatInt(cells.reduce((sum, c) => sum + c.total, 0))} total</span>
        </div>
      </div>
      )}
    </div>
  );
}

function metricMeta(metricId) {
  return COMPARISON_METRICS.find((metric) => metric.id === metricId) || COMPARISON_METRICS[0];
}

function formatMetricCell(value, metricId) {
  const meta = metricMeta(metricId);
  return meta.kind === "percent" ? formatPct(value) : formatInt(value);
}

function metricValueForScope(row, metricId, scope) {
  if (scope === "organic" || scope === "ads") return row?.[scope]?.[metricId] ?? 0;
  return row?.[metricId] ?? 0;
}

function sparklinePath(values, width = 168, height = 38) {
  const nums = (values || []).map((value) => Number(value || 0));
  if (nums.length === 0) return "";
  const max = Math.max(1, ...nums);
  const step = nums.length > 1 ? width / (nums.length - 1) : width;
  return nums
    .map((value, index) => {
      const x = Math.round(index * step * 10) / 10;
      const y = Math.round((height - (value / max) * (height - 4) - 2) * 10) / 10;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function Sparkline({ values, color, dashed = false, title = "" }) {
  const path = sparklinePath(values);
  return (
    <svg viewBox="0 0 168 38" className="h-[38px] w-full overflow-visible" role="img" aria-label={title || "Metric trend"}>
      {title && <title>{title}</title>}
      <path d="M 0 36 L 168 36" fill="none" stroke="#e2e8f0" strokeWidth="1" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "4 4" : undefined} />
    </svg>
  );
}

function TrendBoard({ rows, loading, selectedMetricIds, sourceFilter }) {
  if (loading) return <PanelSkeleton rows={4} />;
  const latest = rows?.[rows.length - 1] || null;
  const scope = sourceFilter === "organic" || sourceFilter === "ads" ? sourceFilter : "all";
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
      {selectedMetricIds.map((metricId) => {
        const meta = metricMeta(metricId);
        const scopedValues = (rows || []).map((row) => metricValueForScope(row, metricId, scope));
        const scopedLabel = scope === "all" ? "All sources" : scope === "organic" ? "Organic" : "Ads";
        const scopedColor = scope === "organic" ? "#059669" : scope === "ads" ? "#2563eb" : (METRIC_COLORS[metricId] || "#4f46e5");
        return (
          <div key={metricId} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-black text-slate-900">{meta.label}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rows?.length || 0} periods</div>
              </div>
              <div className="text-right text-[13px] font-black text-slate-900">
                {formatMetricCell(metricValueForScope(latest, metricId, scope), metricId)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-500">
                <span className={scope === "organic" ? "text-emerald-700" : scope === "ads" ? "text-blue-700" : "text-slate-500"}>{scopedLabel}</span>
                <span>{formatMetricCell(metricValueForScope(latest, metricId, scope), metricId)}</span>
              </div>
              <Sparkline values={scopedValues} color={scopedColor} dashed={scope === "ads"} title={`${meta.label} ${scopedLabel.toLowerCase()} trend`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricSelector({ selectedMetricIds, onToggle, onMove, onReorder }) {
  const [draggingMetricId, setDraggingMetricId] = useState(null);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex items-center justify-between">
        <SectionBadge>Metric picker</SectionBadge>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{selectedMetricIds.length} selected</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {COMPARISON_METRICS.map((metric) => {
          const active = selectedMetricIds.includes(metric.id);
          return (
            <button
              key={metric.id}
              type="button"
              onClick={() => onToggle(metric.id)}
              title={`${active ? "Remove" : "Add"} ${metric.label} from comparison`}
              className={cx(
                "min-h-8 rounded-md border px-2 py-1 text-left text-[10.5px] font-bold leading-tight transition",
                active
                  ? "border-slate-300 bg-slate-100 text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {metric.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {selectedMetricIds.map((metricId, index) => {
          const metric = metricMeta(metricId);
          return (
            <div
              key={metricId}
              draggable
              onDragStart={() => setDraggingMetricId(metricId)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingMetricId && draggingMetricId !== metricId) onReorder(draggingMetricId, metricId);
                setDraggingMetricId(null);
              }}
              onDragEnd={() => setDraggingMetricId(null)}
              className={cx(
                "flex cursor-grab items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 active:cursor-grabbing",
                draggingMetricId === metricId && "opacity-50"
              )}
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.2} />
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: METRIC_COLORS[metricId] || "#4f46e5" }} />
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-700">{metric.label}</span>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); onMove(index, -1); }}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:bg-slate-50 disabled:text-slate-400"
                disabled={index === 0}
                aria-label={`Move ${metric.label} up`}
                title="Move up"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.8} />
              </button>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); onMove(index, 1); }}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:bg-slate-50 disabled:text-slate-400"
                disabled={index === selectedMetricIds.length - 1}
                aria-label={`Move ${metric.label} down`}
                title="Move down"
              >
                <ArrowDown className="h-4 w-4" strokeWidth={2.8} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonTable({ rows, loading, selectedMetricIds, sourceFilter }) {
  if (loading) return <PanelSkeleton rows={7} />;
  const scope = sourceFilter === "organic" || sourceFilter === "ads" ? sourceFilter : "all";
  return (
    <div className="max-h-[180px] overflow-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <table className="min-w-full text-left text-[11px]">
        <thead className="sticky top-0 bg-slate-50 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
          <tr>
            <th className="px-2 py-2">Period</th>
            {selectedMetricIds.map((metricId) => (
              <th key={metricId} className="px-2 py-2">
                <span className="block max-w-[86px] truncate" title={metricMeta(metricId).label}>{metricMeta(metricId).label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(rows || []).map((row) => (
            <tr key={row.period} className="font-semibold text-slate-700">
              <td className="whitespace-nowrap px-2 py-2 font-black text-slate-900" title={row.period}>{row.period}</td>
              {selectedMetricIds.map((metricId) => (
                <td
                  key={metricId}
                  className="whitespace-nowrap px-2 py-2"
                  title={`${row.period} · ${metricMeta(metricId).label}: ${formatMetricCell(metricValueForScope(row, metricId, scope), metricId)}`}
                >
                  <span className={scope === "organic" ? "text-emerald-700" : scope === "ads" ? "text-blue-700" : ""}>
                    {formatMetricCell(metricValueForScope(row, metricId, scope), metricId)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricsComparisonBuilder({
  comparisonLoading,
  comparisonSeries,
  sourceFilter,
}) {
  const [selectedMetricIds, setSelectedMetricIds] = useState(DEFAULT_COMPARISON_METRICS);
  const toggleMetric = (metricId) => {
    setSelectedMetricIds((prev) => {
      if (prev.includes(metricId)) return prev.length === 1 ? prev : prev.filter((id) => id !== metricId);
      return [...prev, metricId];
    });
  };
  const moveMetric = (index, direction) => {
    setSelectedMetricIds((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const reorderMetric = (draggedId, targetId) => {
    setSelectedMetricIds((prev) => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  return (
    <Panel
      title="Custom Metric Comparison"
      kicker="Choose only the trends the client wants to inspect"
    >
      <div className="space-y-2">
        <MetricSelector selectedMetricIds={selectedMetricIds} onToggle={toggleMetric} onMove={moveMetric} onReorder={reorderMetric} />
        <div className="min-w-0 space-y-2">
          <TrendBoard rows={comparisonSeries} loading={comparisonLoading} selectedMetricIds={selectedMetricIds} sourceFilter={sourceFilter} />
          <ComparisonTable rows={comparisonSeries} loading={comparisonLoading} selectedMetricIds={selectedMetricIds} sourceFilter={sourceFilter} />
        </div>
      </div>
    </Panel>
  );
}

function DistributionChart({ sourceStats, mediumStats, loading }) {
  const data = [
    { name: "Ads", value: sourceStats?.ads?.totalPurchased || 0, booked: sourceStats?.ads?.totalBooked || 0, conversion: sourceStats?.ads?.conversionRate || 0, color: "bg-blue-500", soft: "bg-blue-50 text-blue-700" },
    { name: "Organic", value: sourceStats?.organic?.totalPurchased || 0, booked: sourceStats?.organic?.totalBooked || 0, conversion: sourceStats?.organic?.conversionRate || 0, color: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700" },
    { name: "TikTok", value: mediumStats?.tiktok?.totalPurchased || 0, booked: mediumStats?.tiktok?.totalBooked || 0, conversion: mediumStats?.tiktok?.conversionRate || 0, color: "bg-pink-500", soft: "bg-pink-50 text-pink-700" },
    { name: "Instagram", value: mediumStats?.instagram?.totalPurchased || 0, booked: mediumStats?.instagram?.totalBooked || 0, conversion: mediumStats?.instagram?.conversionRate || 0, color: "bg-purple-500", soft: "bg-purple-50 text-purple-700" },
  ];
  const max = Math.max(1, ...data.map((row) => row.value));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {loading ? <PanelSkeleton chart /> : (
      <div className="grid grid-cols-2 gap-2">
        {data.map((row) => (
          <div
            key={row.name}
            className="rounded-xl border border-slate-100 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            title={`${row.name}: ${formatInt(row.value)} purchases, ${formatPct(row.conversion)} conversion, ${formatInt(row.booked)} booked`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-black", row.soft)}>{row.name}</span>
              <span className="text-[12px] font-black text-slate-900">{formatInt(row.value)}</span>
            </div>
            <div className="mt-2 h-16 rounded-lg border border-slate-100 bg-slate-50 p-1">
              <div className="flex h-full items-end">
                <div className={cx("w-full rounded-md", row.color)} style={{ height: `${Math.max(8, (row.value / max) * 100)}%` }} />
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500">
              <span>{formatPct(row.conversion)}</span>
              <span>{formatInt(row.booked)} booked</span>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function FunnelChart({ stats, loading }) {
  const rows = [
    { name: "Booked", value: stats?.totalBooked || 0, color: "bg-slate-500" },
    { name: "Confirmed", value: stats?.totalConfirmed || 0, color: "bg-blue-500" },
    { name: "Showed", value: stats?.totalShowedUp || 0, color: "bg-emerald-500" },
    { name: "Purchased", value: stats?.totalPurchased || 0, color: "bg-indigo-500" },
  ];
  const max = Math.max(1, rows[0]?.value || 0, ...rows.map((row) => row.value));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {loading ? <PanelSkeleton chart /> : (
      <div className="space-y-2">
        {rows.map((row, index) => {
          const prev = index === 0 ? row.value : rows[index - 1].value;
          const retention = index === 0 ? 100 : (prev ? (row.value / prev) * 100 : 0);
          return (
            <div
              key={row.name}
              className="rounded-xl border border-slate-100 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              title={`${row.name}: ${formatInt(row.value)} total${index > 0 ? `, ${formatPct(retention)} from previous stage` : ""}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-600">{row.name}</div>
                <div className="text-[13px] font-black text-slate-950">{formatInt(row.value)}</div>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div className={cx("h-3 rounded-full", row.color)} style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
              </div>
              <div className="mt-1 text-right text-[10px] font-bold text-slate-400">
                {index === 0 ? "Start" : `${formatPct(retention)} retained`}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function PurchaseLog({ rows, specialOfferIds, loading, teamLists, onSaveTreatmentOverride }) {
  const [tab, setTab] = useState("purchases");
  const [closerFilter, setCloserFilter] = useState("");
  const [setterFilter, setSetterFilter] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("all");
  const [contextRow, setContextRow] = useState(null);
  const split = useMemo(() => splitPurchases(rows, specialOfferIds), [rows, specialOfferIds]);
  const tabRows = split[tab] || [];
  const filtered = tabRows.filter((row) => {
    if (closerFilter && row.closer_name !== closerFilter) return false;
    if (setterFilter && row.setter_name !== setterFilter) return false;
    if (linkedFilter === "linked" && !row.isLinkedToOutcome) return false;
    if (linkedFilter === "unlinked" && row.isLinkedToOutcome) return false;
    return true;
  });

  const handleOverride = async (treatment) => {
    if (!contextRow?.purchase_id) return;
    await onSaveTreatmentOverride(contextRow.purchase_id, treatment);
    setContextRow(null);
  };

  return (
    <Panel
      title="Purchase Log"
      kicker={`${filtered.length} visible · ${rows?.length || 0} loaded`}
      action={<SegmentedTabs items={PURCHASE_TAB_ITEMS} activeId={tab} onChange={setTab} size="xs" fit />}
      className="relative"
    >
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <Select value={closerFilter} onChange={setCloserFilter} className="min-w-0">
          <option value="">All closers</option>
          {(teamLists.closers || []).map((row) => <option key={row.id} value={row.name}>{row.name}</option>)}
        </Select>
        <Select value={setterFilter} onChange={setSetterFilter} className="min-w-0">
          <option value="">All setters</option>
          {(teamLists.setters || []).map((row) => <option key={row.id} value={row.name}>{row.name}</option>)}
        </Select>
        <div className="col-span-2 min-w-0 overflow-hidden">
          <SegmentedTabs items={LINKED_ITEMS} activeId={linkedFilter} onChange={setLinkedFilter} size="xs" fit={false} />
        </div>
      </div>
      <div className="max-h-[250px] overflow-auto rounded-md border border-slate-100">
        {loading ? (
          <div className="py-8 text-center text-[12px] font-bold text-slate-400">Loading purchases...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-[12px] font-bold text-slate-400">No purchases match these filters</div>
        ) : (
          filtered.map((row) => (
            <div
              key={row._rowKey}
              className={cx("grid grid-cols-[1fr_54px_52px] gap-2 border-b border-slate-100 px-2 py-2 text-[11px] last:border-b-0", row.isLinkedToOutcome ? "bg-white" : "bg-orange-50")}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextRow(row);
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  {row.lead_id ? (
                    <a className="truncate font-black text-slate-900 hover:text-indigo-700" href={`/lead/${row.lead_id}`} title={row.name}>{row.name}</a>
                  ) : row.contact_id ? (
                    <a className="truncate font-black text-slate-900 hover:text-indigo-700" href={`https://app.kajabi.com/admin/contacts/${encodeURIComponent(row.contact_id)}`} target="_blank" rel="noreferrer" title={row.name}>
                      {row.name}<ExternalLink className="ml-1 inline h-3 w-3" />
                    </a>
                  ) : (
                    <span className="truncate font-black text-slate-900" title={row.name}>{row.name}</span>
                  )}
                </div>
                <div className="truncate font-semibold text-slate-500" title={`${row.email} · ${row.offer_name}`}>{row.email} · {row.offer_name}</div>
              </div>
              <div className="text-right font-black text-slate-900">{row.amount_formatted}</div>
              <div className="text-right font-bold text-slate-500">{row.closer_name || "x"}</div>
            </div>
          ))
        )}
      </div>
      {contextRow && (
        <div className="absolute right-3 top-12 z-20 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          <button className="block w-full px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleOverride("purchase")}>Treat as Purchase</button>
          <button className="block w-full px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleOverride("lock_in")}>Treat as Lock-in</button>
          <button className="block w-full px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleOverride("payoff")}>Treat as Payoff</button>
          {contextRow.treatment_override && (
            <button className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-[12px] font-semibold text-slate-500 hover:bg-slate-50" onClick={() => handleOverride(null)}>Clear override</button>
          )}
          <button className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-[12px] font-semibold text-slate-400 hover:bg-slate-50" onClick={() => setContextRow(null)}>Close</button>
        </div>
      )}
    </Panel>
  );
}

export default function ManagementMetricsV2() {
  const data = useManagementMetricsData();
  const [sourceFilter, setSourceFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [viewMode, setViewMode] = useState("cards");
  const [hideReschedules, setHideReschedules] = useState(false);
  const [closerSort, setCloserSort] = useState("conversion");
  const [setterSort, setSetterSort] = useState("pickup");
  const [countryTopN, setCountryTopN] = useState(8);
  const [countryMetric, setCountryMetric] = useState("conversion");

  const filteredStats = selectedStats(data.stats, sourceFilter, countryFilter);
  const sourceOptions = useMemo(() => {
    const headlineCount = data.stats?.headline?.totalBooked ?? data.stats?.headline?.bookingsMadeInPeriod ?? 0;
    return SOURCE_ITEMS.map((item) => {
      if (item.id === "all") return { ...item, count: headlineCount };
      const block = data.stats?.sourceStats?.[item.id];
      return { ...item, count: block?.totalBooked ?? block?.bookingsMadeInPeriod ?? 0 };
    });
  }, [data.stats?.headline, data.stats?.sourceStats]);
  const countryOptions = useMemo(() => {
    const byCountry = new Map();
    (data.stats?.countries || []).forEach((row) => {
      if (row?.country) byCountry.set(row.country, row);
    });
    Object.keys(data.stats?.countrySourceStats || {}).forEach((country) => {
      if (country && !byCountry.has(country)) {
        const split = data.stats?.countrySourceStats?.[country] || {};
        byCountry.set(country, {
          country,
          totalBooked: (split.ads?.totalBooked || 0) + (split.organic?.totalBooked || 0),
          bookingsMadeInPeriod: (split.ads?.bookingsMadeInPeriod || 0) + (split.organic?.bookingsMadeInPeriod || 0),
        });
      }
    });
    return [...byCountry.values()].sort((a, b) => String(a.country || "").localeCompare(String(b.country || "")));
  }, [data.stats?.countries, data.stats?.countrySourceStats]);
  const startInput = data.startDate?.slice(0, 10) || "";
  const endInput = data.endDate?.slice(0, 10) || "";

  return (
    <div className="space-y-4">
      <TopFilterShell>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 shrink-0">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Range</div>
            <SegmentedTabs items={RANGE_ITEMS} activeId={data.rangePreset} onChange={data.actions.applyRangePreset} size="sm" fit />
          </div>
          {data.rangePreset === "custom" && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
              <input
                type="date"
                value={startInput}
                onChange={(event) => data.actions.setCustomStart(event.target.value)}
                className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
                aria-label="Custom start date"
              />
              <span className="text-[10px] font-semibold text-slate-500">–</span>
              <input
                type="date"
                value={endInput}
                onChange={(event) => data.actions.setCustomEnd(event.target.value)}
                className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
                aria-label="Custom end date"
              />
            </div>
          )}
          <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" aria-hidden="true" />
          <Select value={sourceFilter} onChange={setSourceFilter} className="h-7 text-[11px]">
            {sourceOptions.map((item) => <option key={item.id} value={item.id}>{item.label} ({formatInt(item.count)})</option>)}
          </Select>
          <Select value={countryFilter} onChange={setCountryFilter} className="h-7 min-w-[9.5rem] max-w-[13rem] text-[11px]">
            <option value="all">All countries ({formatInt(data.stats?.headline?.totalBooked || 0)})</option>
            {data.loading && countryOptions.length === 0 ? (
              <option value="__loading" disabled>Loading countries...</option>
            ) : (
              countryOptions.map((row) => (
                <option key={row.country} value={row.country}>
                  {row.country || "Unknown"} ({formatInt(row.totalBooked ?? row.bookingsMadeInPeriod ?? 0)})
                </option>
              ))
            )}
          </Select>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SegmentedTabs items={VIEW_ITEMS} activeId={viewMode} onChange={setViewMode} size="sm" fit />
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-700">{data.periodLabel}</span>
          </div>
        </div>
      </TopFilterShell>

      {data.error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700">{data.error}</div>}

      <div className="relative">
        {viewMode === "cards" ? (
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-8">
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
              <Panel title="Headline Funnel" kicker="Filtered view">
                <FunnelCards stats={filteredStats} revenueSummary={data.revenueSummary} loading={data.loading} />
              </Panel>
              <Panel title="Source Mix" kicker="Ads, organic, medium">
                <SourceSplit sourceStats={data.stats?.sourceStats} mediumStats={data.stats?.mediumStats} loading={data.loading} />
              </Panel>
              <Panel title="Funnel Shape" kicker="Call-date retention">
                <FunnelChart stats={filteredStats} loading={data.loading} />
              </Panel>
            </div>
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
              <MetricsComparisonBuilder
                comparisonLoading={data.comparisonLoading}
                comparisonSeries={data.comparisonSeries}
                sourceFilter={sourceFilter}
              />
              <Panel
                title="Booked Calls Activity"
                kicker="Stacked lanes + heatmap"
                action={
                  <button type="button" onClick={() => setHideReschedules((v) => !v)} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                    {hideReschedules ? "Show reschedules" : "Hide reschedules"}
                  </button>
                }
              >
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <BookingsChart rows={data.stats?.bookingsPerDay} hideReschedules={hideReschedules} loading={data.loading} />
                  <BookingsHeatmap rows={data.stats?.bookingsPerDay} loading={data.loading} />
                </div>
              </Panel>
            </div>
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
              <CountryPanel countries={data.stats?.countries} topN={countryTopN} onTopN={setCountryTopN} metric={countryMetric} onMetric={setCountryMetric} loading={data.loading} />
              <TeamSnapshotPanel
                closers={data.stats?.closers}
                setters={data.stats?.setters}
                closerSort={closerSort}
                setterSort={setterSort}
                onCloserSort={setCloserSort}
                onSetterSort={setSetterSort}
                loading={data.loading}
              />
              <PurchaseLog
                rows={data.purchases}
                specialOfferIds={data.specialOfferIds}
                loading={data.purchaseLoading}
                teamLists={data.teamLists}
                onSaveTreatmentOverride={data.actions.saveTreatmentOverride}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-8">
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
              <Panel title="Headline Funnel" kicker="Filtered view">
                <FunnelCards stats={filteredStats} revenueSummary={data.revenueSummary} loading={data.loading} />
              </Panel>
              <Panel title="Source Distribution" kicker="Purchases">
                <DistributionChart sourceStats={data.stats?.sourceStats} mediumStats={data.stats?.mediumStats} loading={data.loading} />
              </Panel>
              <CountryPanel countries={data.stats?.countries} topN={countryTopN} onTopN={setCountryTopN} metric={countryMetric} onMetric={setCountryMetric} loading={data.loading} />
            </div>
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
              <Panel title="Visual Metrics Board" kicker="Micro visuals">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <BookingsHeatmap rows={data.stats?.bookingsPerDay} loading={data.loading} />
                  <FunnelChart stats={filteredStats} loading={data.loading} />
                </div>
              </Panel>
              <MetricsComparisonBuilder
                comparisonLoading={data.comparisonLoading}
                comparisonSeries={data.comparisonSeries}
                sourceFilter={sourceFilter}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
              <Panel
                title="Booked Calls"
                kicker="Stacked source lanes"
                action={
                  <button type="button" onClick={() => setHideReschedules((v) => !v)} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                    {hideReschedules ? "Show reschedules" : "Hide reschedules"}
                  </button>
                }
              >
                <BookingsChart rows={data.stats?.bookingsPerDay} hideReschedules={hideReschedules} loading={data.loading} />
              </Panel>
              <TeamSnapshotPanel
                closers={data.stats?.closers}
                setters={data.stats?.setters}
                closerSort={closerSort}
                setterSort={setterSort}
                onCloserSort={setCloserSort}
                onSetterSort={setSetterSort}
                loading={data.loading}
              />
              <PurchaseLog
                rows={data.purchases}
                specialOfferIds={data.specialOfferIds}
                loading={data.purchaseLoading}
                teamLists={data.teamLists}
                onSaveTreatmentOverride={data.actions.saveTreatmentOverride}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
