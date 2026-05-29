import { useState } from "react";
import { GripVertical } from "lucide-react";
import SegmentedTabs from "../segmented-tabs";
import {
  COMPARISON_ITEMS,
  COMPARISON_METRICS,
  DEFAULT_COMPARISON_METRICS,
  cx,
  formatInt,
  formatPct,
} from "./metricTransforms";
import { Panel, PanelSkeleton, SectionBadge, Select } from "./metrics-ui";

const METRIC_COLORS = {
  bookingsMade: "#64748b",
  booked: "#475569",
  confirmationRate: "#7c3aed",
  conversionRate: "#d97706",
  downsellPercent: "#d97706",
  dqRate: "#be123c",
  pickUpRate: "#2563eb",
  pifPercent: "#4f46e5",
  purchased: "#059669",
  recoveryRate: "#0f766e",
  showedUp: "#0d9488",
  showUpRate: "#059669",
  successRate: "#4338ca",
};

const COMPARISON_DAY_OPTIONS = [7, 14, 30, 60, 90];
const SCOPE_OPTIONS = [
  { id: "all", label: "All" },
  { id: "organic", label: "Organic" },
  { id: "ads", label: "Ads" },
];

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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {selectedMetricIds.map((metricId) => {
        const meta = metricMeta(metricId);
        const scopedValues = (rows || []).map((row) => metricValueForScope(row, metricId, scope));
        const scopedLabel = scope === "all" ? "All sources" : scope === "organic" ? "Organic" : "Ads";
        const scopedColor = scope === "organic" ? "#059669" : scope === "ads" ? "#2563eb" : (METRIC_COLORS[metricId] || "#4f46e5");
        return (
          <div key={metricId} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-black text-slate-900">{meta.label}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{rows?.length || 0} periods</div>
              </div>
              <div className="text-right text-[12px] font-black text-slate-900">
                {formatMetricCell(metricValueForScope(latest, metricId, scope), metricId)}
              </div>
            </div>
            <Sparkline values={scopedValues} color={scopedColor} dashed={scope === "ads"} title={`${meta.label} ${scopedLabel.toLowerCase()} trend`} />
          </div>
        );
      })}
    </div>
  );
}

function DeltaPill({ value, metricId }) {
  const meta = metricMeta(metricId);
  const n = Number(value || 0);
  const positive = n >= 0;
  return (
    <span className={cx(
      "rounded-md px-1.5 py-0.5 text-[9px] font-black tabular-nums",
      positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
    )}>
      {positive ? "+" : ""}{meta.kind === "percent" ? formatPct(n) : formatInt(n)}
    </span>
  );
}

function CardBoard({ rows, loading, selectedMetricIds, sourceFilter }) {
  if (loading) return <PanelSkeleton rows={6} />;
  const scope = sourceFilter === "organic" || sourceFilter === "ads" ? sourceFilter : "all";
  const latest = rows?.[rows.length - 1] || null;
  const previous = rows?.[rows.length - 2] || null;
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
      {selectedMetricIds.map((metricId) => {
        const meta = metricMeta(metricId);
        const current = metricValueForScope(latest, metricId, scope);
        const prev = metricValueForScope(previous, metricId, scope);
        const max = Math.max(1, ...((rows || []).map((row) => metricValueForScope(row, metricId, scope))));
        return (
          <div key={metricId} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2" title={`${meta.label}: ${formatMetricCell(current, metricId)} in latest period`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[10px] font-black uppercase tracking-wide text-slate-500">{meta.label}</div>
                <div className="mt-0.5 text-[16px] font-black leading-none text-slate-950">{formatMetricCell(current, metricId)}</div>
              </div>
              <DeltaPill value={Number(current || 0) - Number(prev || 0)} metricId={metricId} />
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white">
              <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.max(3, (Number(current || 0) / max) * 100)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[9px] font-semibold text-slate-400">
              <span>{latest?.period || "Latest"}</span>
              <span>{previous ? `vs ${previous.period}` : "No prior"}</span>
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
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <SectionBadge>Metrics</SectionBadge>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{selectedMetricIds.length} selected</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {COMPARISON_METRICS.map((metric) => {
          const active = selectedMetricIds.includes(metric.id);
          return (
            <button
              key={metric.id}
              type="button"
              onClick={() => onToggle(metric.id)}
              title={`${active ? "Remove" : "Add"} ${metric.label}`}
              className={cx(
                "rounded-md border px-2 py-1 text-[10px] font-bold transition",
                active ? "border-indigo-200 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {metric.label}
            </button>
          );
        })}
      </div>
      {selectedMetricIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
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
                  "flex cursor-grab items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700",
                  draggingMetricId === metricId && "opacity-50",
                )}
              >
                <GripVertical className="h-3 w-3 text-slate-400" strokeWidth={2.2} />
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: METRIC_COLORS[metricId] || "#4f46e5" }} />
                <span className="max-w-[88px] truncate">{metric.label}</span>
                <button
                  type="button"
                  onClick={() => onMove(index, -1)}
                  disabled={index === 0}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none disabled:opacity-100"
                  aria-label="Move up"
                  title="Move metric up"
                >
                  <span className="text-[11px] font-black leading-none text-slate-700" aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, 1)}
                  disabled={index === selectedMetricIds.length - 1}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none disabled:opacity-100"
                  aria-label="Move down"
                  title="Move metric down"
                >
                  <span className="text-[11px] font-black leading-none text-slate-700" aria-hidden>↓</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComparisonTable({ rows, loading, selectedMetricIds, sourceFilter }) {
  if (loading) return <PanelSkeleton rows={8} />;
  const scope = sourceFilter === "organic" || sourceFilter === "ads" ? sourceFilter : "all";
  return (
    <div className="max-h-[min(420px,50vh)] overflow-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-left text-[10px]">
        <thead className="sticky top-0 z-[1] bg-slate-50 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
          <tr>
            <th className="px-2 py-2">Period</th>
            {selectedMetricIds.map((metricId) => (
              <th key={metricId} className="px-2 py-2">
                <span className="block max-w-[72px] truncate" title={metricMeta(metricId).label}>{metricMeta(metricId).label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(rows || []).map((row) => (
            <tr key={row.period} className="font-semibold text-slate-700">
              <td className="whitespace-nowrap px-2 py-1.5 font-black text-slate-900">{row.period}</td>
              {selectedMetricIds.map((metricId) => (
                <td key={metricId} className="whitespace-nowrap px-2 py-1.5 tabular-nums">
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

export default function MetricsComparisonHub({
  comparisonLoading,
  comparisonSeries,
  comparisonKind,
  comparisonDays,
  onComparisonKind,
  onComparisonDays,
  sourceFilter,
  viewMode = "cards",
}) {
  const [selectedMetricIds, setSelectedMetricIds] = useState(DEFAULT_COMPARISON_METRICS);
  const [scopeFilter, setScopeFilter] = useState(sourceFilter === "organic" || sourceFilter === "ads" ? sourceFilter : "all");
  const activeScope = sourceFilter === "organic" || sourceFilter === "ads" ? sourceFilter : scopeFilter;

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
      title="Trend comparison"
      kicker="Daily · weekly · monthly periods"
      className="xl:col-span-4"
      action={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <SegmentedTabs items={COMPARISON_ITEMS} activeId={comparisonKind} onChange={onComparisonKind} size="xs" fit />
          {comparisonKind === "daily" && (
            <Select value={String(comparisonDays)} onChange={(v) => onComparisonDays(Number(v))} className="h-7 w-[4.5rem] text-[11px]">
              {COMPARISON_DAY_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}d</option>
              ))}
            </Select>
          )}
          <Select value={activeScope} onChange={setScopeFilter} className="h-7 w-[5.7rem] text-[11px]" disabled={sourceFilter === "organic" || sourceFilter === "ads"}>
            {SCOPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Select>
        </div>
      }
    >
      <div className="space-y-2">
        <MetricSelector
          selectedMetricIds={selectedMetricIds}
          onToggle={toggleMetric}
          onMove={moveMetric}
          onReorder={reorderMetric}
        />
        {viewMode === "charts" ? (
          <TrendBoard
            rows={comparisonSeries}
            loading={comparisonLoading}
            selectedMetricIds={selectedMetricIds}
            sourceFilter={activeScope}
          />
        ) : (
          <CardBoard
            rows={comparisonSeries}
            loading={comparisonLoading}
            selectedMetricIds={selectedMetricIds}
            sourceFilter={activeScope}
          />
        )}
        <ComparisonTable
          rows={comparisonSeries}
          loading={comparisonLoading}
          selectedMetricIds={selectedMetricIds}
          sourceFilter={activeScope}
        />
      </div>
    </Panel>
  );
}
