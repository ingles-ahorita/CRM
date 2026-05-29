import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import SegmentedTabs from "../segmented-tabs";
import { useManagementMetricsData } from "./useManagementMetricsData";
import MetricsComparisonHub from "./metrics-comparison-hub";
import { MetricsCurrentLeft, MetricsCurrentRight } from "./metrics-current-panels";
import {
  LINKED_ITEMS,
  PURCHASE_TAB_ITEMS,
  RANGE_ITEMS,
  SOURCE_ITEMS,
  VIEW_ITEMS,
  cx,
  formatInt,
  selectedStats,
  splitPurchases,
} from "./metricTransforms";
import { LoadingCover, Panel, PanelSkeleton, Select, ShimmerBlock } from "./metrics-ui";

function TopFilterShell({ children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2">
      {children}
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="space-y-4">
      <TopFilterShell>
        <div className="flex flex-wrap items-center gap-2">
          <ShimmerBlock className="h-8 w-64" />
          <ShimmerBlock className="h-7 w-32" />
          <div className="ml-auto flex gap-2">
            <ShimmerBlock className="h-8 w-44" />
            <ShimmerBlock className="h-7 w-32" />
          </div>
        </div>
      </TopFilterShell>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-8">
        <div className="flex min-w-0 flex-col gap-2 xl:col-span-2">
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={8} />
          <PanelSkeleton chart />
        </div>
        <div className="xl:col-span-4">
          <PanelSkeleton rows={4} />
          <div className="mt-2"><PanelSkeleton chart /></div>
          <div className="mt-2"><PanelSkeleton rows={8} /></div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 xl:col-span-2">
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={6} />
        </div>
      </div>
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
      title="Purchase log"
      kicker={`${filtered.length} visible · ${rows?.length || 0} loaded`}
      action={<SegmentedTabs items={PURCHASE_TAB_ITEMS} activeId={tab} onChange={setTab} size="xs" fit />}
      className="relative"
    >
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <Select value={closerFilter} onChange={setCloserFilter} className="min-w-0 h-7 text-[11px]">
          <option value="">All closers</option>
          {(teamLists.closers || []).map((row) => <option key={row.id} value={row.name}>{row.name}</option>)}
        </Select>
        <Select value={setterFilter} onChange={setSetterFilter} className="min-w-0 h-7 text-[11px]">
          <option value="">All setters</option>
          {(teamLists.setters || []).map((row) => <option key={row.id} value={row.name}>{row.name}</option>)}
        </Select>
        <div className="col-span-2 min-w-0 overflow-hidden">
          <SegmentedTabs items={LINKED_ITEMS} activeId={linkedFilter} onChange={setLinkedFilter} size="xs" fit={false} />
        </div>
      </div>
      <div className="max-h-[220px] overflow-auto rounded-md border border-slate-100">
        {loading ? (
          <div className="py-8 text-center text-[12px] font-bold text-slate-400">Loading purchases...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-[12px] font-bold text-slate-400">No purchases match these filters</div>
        ) : (
          filtered.map((row) => (
            <div
              key={row._rowKey}
              className={cx("grid grid-cols-[1fr_54px_52px] gap-2 border-b border-slate-100 px-2 py-1.5 text-[10px] last:border-b-0", row.isLinkedToOutcome ? "bg-white" : "bg-orange-50")}
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
              <div className="text-right font-bold text-slate-500">{row.closer_name || "—"}</div>
            </div>
          ))
        )}
      </div>
      {contextRow && (
        <div className="absolute right-3 top-12 z-20 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          <button type="button" className="block w-full px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleOverride("purchase")}>Treat as Purchase</button>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleOverride("lock_in")}>Treat as Lock-in</button>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleOverride("payoff")}>Treat as Payoff</button>
          {contextRow.treatment_override && (
            <button type="button" className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-[12px] font-semibold text-slate-500 hover:bg-slate-50" onClick={() => handleOverride(null)}>Clear override</button>
          )}
          <button type="button" className="block w-full border-t border-slate-100 px-3 py-1.5 text-left text-[12px] font-semibold text-slate-400 hover:bg-slate-50" onClick={() => setContextRow(null)}>Close</button>
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

  const purchasePanel = (
    <PurchaseLog
      rows={data.purchases}
      specialOfferIds={data.specialOfferIds}
      loading={data.purchaseLoading}
      teamLists={data.teamLists}
      onSaveTreatmentOverride={data.actions.saveTreatmentOverride}
    />
  );

  if (data.loading && !data.stats) return <MetricsSkeleton />;

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
          <Select value={countryFilter} onChange={setCountryFilter} className="min-w-[9.5rem] max-w-[13rem] h-7 text-[11px]">
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
        <LoadingCover show={data.loading} />
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-8">
          <MetricsCurrentLeft
            viewMode={viewMode}
            filteredStats={filteredStats}
            stats={data.stats}
            revenueSummary={data.revenueSummary}
            sourceFilter={sourceFilter}
            countryFilter={countryFilter}
            loading={data.loading}
            bookingsPerDay={data.stats?.bookingsPerDay}
            hideReschedules={hideReschedules}
            onToggleReschedules={() => setHideReschedules((v) => !v)}
          />
          <MetricsComparisonHub
            comparisonLoading={data.comparisonLoading}
            comparisonSeries={data.comparisonSeries}
            comparisonKind={data.comparisonKind}
            comparisonDays={data.comparisonDays}
            onComparisonKind={data.actions.setComparisonKind}
            onComparisonDays={data.actions.setComparisonDays}
            sourceFilter={sourceFilter}
            viewMode={viewMode}
          />
          <MetricsCurrentRight
            viewMode={viewMode}
            stats={data.stats}
            loading={data.loading}
            closers={data.stats?.closers}
            setters={data.stats?.setters}
            purchasesPanel={purchasePanel}
          />
        </div>
      </div>
    </div>
  );
}
