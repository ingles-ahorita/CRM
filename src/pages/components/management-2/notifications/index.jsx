import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Search,
  ShoppingBag,
  Users,
  CalendarClock,
  AlertCircle,
  RefreshCw,
  Activity,
} from "lucide-react";
import SegmentedTabs from "../segmented-tabs";
import { markNotificationsSeen } from "../../../../hooks/usePlatformEventsBadge";
import { usePlatformEventsRealtime } from "../../../../hooks/usePlatformEventsRealtime";
import { fetchPlatformEventsList } from "../../../../lib/platformEventsQuery";
import { eventMatchesActivityFilters } from "../../../../lib/platformEventFilters";
import { formatPlatformEventSummary } from "../../../../lib/platformEventDisplay";

const RANGE_ITEMS = [
  { id: "today", label: "Today", title: "Today (UTC)" },
  { id: "last7", label: "7d", title: "Last 7 days" },
  { id: "last30", label: "30d", title: "Last 30 days" },
  { id: "custom", label: "Custom", title: "Custom date range" },
];

const VIEW_ITEMS = [
  { id: "live", label: "Live", title: "High-signal events" },
  { id: "all", label: "All", title: "All logged events in range" },
];

const TOPIC_ITEMS = [
  { id: "all", label: "All" },
  { id: "bookings", label: "Bookings" },
  { id: "sales", label: "Sales" },
  { id: "team", label: "Team" },
  { id: "errors", label: "Errors" },
  { id: "sync", label: "Sync" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "crm", label: "CRM" },
  { value: "calendly", label: "Calendly" },
  { value: "kajabi", label: "Kajabi" },
  { value: "sync", label: "Sync" },
];

const CATEGORY_DOT = {
  booking: "bg-indigo-500",
  sale: "bg-emerald-500",
  team: "bg-slate-500",
  system: "bg-slate-400",
  error: "bg-red-500",
};

function cx(...p) {
  return p.filter(Boolean).join(" ");
}

function shimmer(className = "") {
  return (
    <div
      className={cx("animate-pulse rounded-md bg-slate-200/70", className)}
      aria-hidden
    />
  );
}

function formatRelativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatAbsoluteTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function formatSourceLabel(source) {
  if (!source) return "CRM";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function CategoryIcon({ category, severity }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (severity === "error") {
    return <AlertCircle className={cx(cls, "text-red-500")} strokeWidth={2.2} aria-hidden />;
  }
  if (category === "sale") {
    return <ShoppingBag className={cx(cls, "text-emerald-600")} strokeWidth={2.2} aria-hidden />;
  }
  if (category === "team") {
    return <Users className={cx(cls, "text-slate-600")} strokeWidth={2.2} aria-hidden />;
  }
  if (category === "booking") {
    return <CalendarClock className={cx(cls, "text-indigo-600")} strokeWidth={2.2} aria-hidden />;
  }
  return <Activity className={cx(cls, "text-slate-500")} strokeWidth={2.2} aria-hidden />;
}

function ActivityFiltersBar({
  range,
  onRangeChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  view,
  onViewChange,
  topic,
  onTopicChange,
  source,
  onSourceChange,
  search,
  onSearchChange,
  periodLabel,
  loading,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs size="sm" fit items={RANGE_ITEMS} activeId={range} onChange={onRangeChange} />
        {range === "custom" ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
            <input
              type="date"
              value={customFrom || ""}
              onChange={(e) => onCustomFromChange?.(e.target.value)}
              className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
              aria-label="Custom start date"
            />
            <span className="text-[10px] font-semibold text-slate-500">–</span>
            <input
              type="date"
              value={customTo || ""}
              onChange={(e) => onCustomToChange?.(e.target.value)}
              className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
              aria-label="Custom end date"
            />
          </div>
        ) : null}

        <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" aria-hidden />

        <SegmentedTabs size="sm" fit items={VIEW_ITEMS} activeId={view} onChange={onViewChange} />
        <SegmentedTabs size="sm" fit items={TOPIC_ITEMS} activeId={topic} onChange={onTopicChange} />

        {view === "all" ? (
          <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
            <label htmlFor="activity-source-filter" className="sr-only">
              Source filter
            </label>
            <select
              id="activity-source-filter"
              value={source || ""}
              onChange={(e) => onSourceChange?.(e.target.value)}
              disabled={loading}
              className="h-6 max-w-[min(100%,140px)] cursor-pointer rounded border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-700 !outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 disabled:opacity-50"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex min-w-[140px] flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 sm:max-w-[220px]">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.2} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search…"
            className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-slate-700 placeholder:text-slate-400 !outline-none"
            aria-label="Search activity"
          />
        </div>

        <div className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          <Calendar className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.2} aria-hidden />
          <span className="text-[11px] font-semibold tabular-nums text-slate-700">
            {loading ? "…" : periodLabel || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ item, expanded, onToggle, isNew }) {
  const isError = item.severity === "error";
  const dotClass = CATEGORY_DOT[item.category] || CATEGORY_DOT.system;
  const changes = item.metadata?.changes;
  const href = item.metadata?.href;
  const displaySummary = formatPlatformEventSummary(item);

  return (
    <div
      className={cx(
        "border-b border-slate-100 last:border-b-0",
        isError && "border-l-2 border-l-red-500 bg-red-50/30",
        isNew && "bg-indigo-50/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="activity-feed-row-btn flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50/80"
        aria-expanded={expanded}
      >
        <span className="mt-1.5 flex shrink-0 items-center gap-1.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          )}
          <span className={cx("h-2 w-2 rounded-full shrink-0", dotClass)} aria-hidden />
          <CategoryIcon category={item.category} severity={item.severity} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-snug text-slate-800">
            {displaySummary}
          </span>
          <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
            {[item.actor_display, formatSourceLabel(item.source)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <time
          className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500"
          dateTime={item.occurred_at}
          title={formatAbsoluteTime(item.occurred_at)}
        >
          {formatRelativeTime(item.occurred_at)}
        </time>
      </button>
      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2.5 pl-10 text-[11px] text-slate-600">
          <p className="font-medium text-slate-500">{formatAbsoluteTime(item.occurred_at)}</p>
          {Array.isArray(changes) && changes.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[10px]">
              {changes.map((c, i) => (
                <li key={i}>
                  {c.field}: {String(c.old ?? "—")} → {String(c.new ?? "—")}
                </li>
              ))}
            </ul>
          ) : null}
          {item.lead_email ? (
            <p className="mt-1">
              <span className="font-semibold text-slate-500">Email:</span> {item.lead_email}
            </p>
          ) : null}
          {href ? (
            <a
              href={href}
              className="mt-2 inline-block font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Open in Leads →
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-2.5">
          {shimmer("h-4 w-4 rounded")}
          <div className="flex-1 space-y-2">
            {shimmer("h-4 w-[70%]")}
            {shimmer("h-3 w-[40%]")}
          </div>
          {shimmer("h-3 w-10")}
        </div>
      ))}
    </div>
  );
}

export default function NotificationsTab({ onSeen }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [periodLabel, setPeriodLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") || "");
  const [newIds, setNewIds] = useState(() => new Set());

  const range = searchParams.get("range") || "last7";
  const view = searchParams.get("view") === "live" ? "live" : "all";
  const topic = searchParams.get("topic") || "all";
  const source = searchParams.get("source") || "";
  const q = searchParams.get("q") || "";
  const customFrom = searchParams.get("from") || "";
  const customTo = searchParams.get("to") || "";

  const patchParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "notifications");
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    markNotificationsSeen();
    onSeen?.();
  }, [onSeen]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== q) patchParams({ q: searchDraft || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, q, patchParams]);

  const filterParams = useMemo(
    () => ({ range, from: customFrom, to: customTo, view, topic, source, q }),
    [range, customFrom, customTo, view, topic, source, q],
  );

  const fetchParams = useMemo(() => {
    const p = new URLSearchParams({
      range: range === "custom" && (!customFrom || !customTo) ? "last7" : range,
      view,
      topic,
      limit: "50",
    });
    if (range === "custom" && customFrom && customTo) {
      p.set("from", customFrom);
      p.set("to", customTo);
    }
    if (source) p.set("source", source);
    if (q) p.set("q", q);
    return p;
  }, [range, view, topic, source, q, customFrom, customTo]);

  const load = useCallback(
    async (cursor, append) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const json = await fetchPlatformEventsList({
          range: fetchParams.get("range") || "today",
          from: fetchParams.get("from") || undefined,
          to: fetchParams.get("to") || undefined,
          view: fetchParams.get("view") === "all" ? "all" : "live",
          topic: fetchParams.get("topic") || "all",
          source: fetchParams.get("source") || "",
          q: fetchParams.get("q") || "",
          cursor: cursor || undefined,
          limit: 50,
        });
        setTableMissing(!!json.table_missing);
        setPeriodLabel(json.period?.label || "");
        setNextCursor(json.next_cursor || null);
        setItems((prev) => (append ? [...prev, ...(json.items || [])] : json.items || []));
      } catch (e) {
        setError(e.message || "Failed to load activity");
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fetchParams],
  );

  useEffect(() => {
    load(null, false);
  }, [load]);

  usePlatformEventsRealtime({
    enabled: true,
    onInsert: (row) => {
      if (!eventMatchesActivityFilters(row, filterParams)) return;
      setItems((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        return [row, ...prev];
      });
      setNewIds((prev) => new Set(prev).add(row.id));
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }, 4000);
    },
  });

  return (
    <div className="w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col items-start gap-1">
        <h2 className="text-[28px] font-bold tracking-tight text-[#0f172a]">Activity</h2>
        <p className="text-[13px] font-medium text-slate-500">
          Bookings, sales outcomes, Kajabi purchases and refunds, setter transfers, shifts,
          revenue-goal changes, offers, logins, and system errors — filter by date and topic;
          new entries stream in real time.
        </p>
      </div>

      <ActivityFiltersBar
        range={range}
        onRangeChange={(id) => patchParams({ range: id })}
        customFrom={customFrom}
        onCustomFromChange={(v) => patchParams({ from: v || null })}
        customTo={customTo}
        onCustomToChange={(v) => patchParams({ to: v || null })}
        view={view}
        onViewChange={(id) => patchParams({ view: id })}
        topic={topic}
        onTopicChange={(id) => patchParams({ topic: id === "all" ? null : id })}
        source={source}
        onSourceChange={(v) => patchParams({ source: v || null })}
        search={searchDraft}
        onSearchChange={setSearchDraft}
        periodLabel={periodLabel}
        loading={loading}
      />

      {tableMissing ? (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          Run the <code className="text-[11px]">platform_events</code> migration in Supabase to
          enable the activity feed.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="relative mt-4">
        <div className="rounded-[12px] border-[2px] border-dashed border-slate-300/80 bg-slate-50/50 overflow-hidden">
          {loading ? (
            <ListSkeleton />
          ) : items.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-[13px] font-semibold text-slate-600">No activity in this range</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                Try switching to <span className="text-indigo-600">All</span> or a wider date range.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 bg-white rounded-[10px]">
              {items.map((item) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  isNew={newIds.has(item.id)}
                  expanded={expandedId === item.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === item.id ? null : item.id))
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => load(null, false)}
            className="activity-feed-action-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={cx("h-3.5 w-3.5", loading && "animate-spin")}
              strokeWidth={2.2}
              aria-hidden
            />
            Refresh
          </button>
          {nextCursor && !loading ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => load(nextCursor, true)}
              className="activity-feed-action-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
