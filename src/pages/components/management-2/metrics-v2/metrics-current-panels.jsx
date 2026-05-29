import { useMemo } from "react";
import {
  aggregateCloserDq,
  cx,
  formatInt,
  formatPct,
  getBreakdownSegments,
  pct,
} from "./metricTransforms";
import {
  BookingsChart,
  BookingsHeatmap,
  DistributionChart,
  FunnelCards,
  FunnelChart,
  SourceSplit,
  showUpRateBooked,
} from "./metrics-charts";
import { Panel, PanelSkeleton, toneText } from "./metrics-ui";

function BreakdownFooter({ stats, sourceFilter, countryFilter, readRate, readPair }) {
  const segments = getBreakdownSegments(stats, sourceFilter, countryFilter);
  if (segments.length === 0) return null;
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-slate-100 pt-1.5 text-[9px] font-semibold">
      {segments.map((seg) => {
        const block = seg.block;
        const rate = readRate(block);
        const pair = readPair?.(block);
        return (
          <div key={seg.label} className="min-w-0">
            <span className={toneText(seg.tone)}>{seg.label}: {formatPct(rate)}</span>
            {pair && <div className="truncate text-slate-400">{pair}</div>}
          </div>
        );
      })}
    </div>
  );
}

function MetricTile({ label, hint, value, sub, tone = "slate", footer, chartMode, barPct = 0 }) {
  if (chartMode) {
    return (
      <div className="rounded-lg border border-slate-100 bg-white p-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-slate-800">{label}</div>
            {hint && <div className="truncate text-[9px] text-slate-400">{hint}</div>}
          </div>
          <div className={`text-[12px] font-black ${toneText(tone)}`}>{value}</div>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
          <div className={`h-1.5 rounded-full bg-current ${toneText(tone)}`} style={{ width: `${Math.min(100, Math.max(4, barPct))}%`, backgroundColor: "currentColor" }} />
        </div>
        {sub && <div className="mt-1 text-[9px] font-semibold text-slate-500">{sub}</div>}
        {footer}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-2 py-1.5">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-800">{label}</div>
          {hint && <div className="truncate text-[9px] text-slate-400">{hint}</div>}
        </div>
        <div className={`text-[13px] font-black leading-none ${toneText(tone)}`}>{value}</div>
      </div>
      {sub && <div className="mt-0.5 text-[9px] font-semibold text-slate-500">{sub}</div>}
      {footer}
    </div>
  );
}

function MetricDenseGrid({ stats, fullStats, sourceFilter, countryFilter, loading, chartMode }) {
  if (loading) return <PanelSkeleton rows={8} />;
  const closerDq = aggregateCloserDq(fullStats?.closers);
  const tiles = [
    {
      label: "Pick-up",
      hint: "Picked up / booked",
      value: formatPct(stats?.pickUpRate),
      sub: `${formatInt(stats?.pickedUpFromBookings)} / ${formatInt(stats?.bookingsMadeInPeriod)}`,
      tone: "blue",
      barPct: stats?.pickUpRate,
      rate: (b) => b?.pickUpRate,
      pair: (b) => `${formatInt(b?.pickedUpFromBookings)} / ${formatInt(b?.bookingsMadeInPeriod)}`,
    },
    {
      label: "Confirmation",
      hint: "Confirmed / booked",
      value: formatPct(stats?.confirmationRate),
      sub: `${formatInt(stats?.confirmedFromBookings)} / ${formatInt(stats?.bookingsForConfirmation)}`,
      tone: "cyan",
      barPct: stats?.confirmationRate,
      rate: (b) => b?.confirmationRate,
      pair: (b) => `${formatInt(b?.confirmedFromBookings)} / ${formatInt(b?.bookingsForConfirmation)}`,
    },
    {
      label: "DQ rate",
      hint: "Picked up, not confirmed",
      value: formatPct(stats?.dqRate),
      sub: `${formatInt(stats?.totalDQ)} / ${formatInt(stats?.totalPickedUpByBookDate)}`,
      tone: "amber",
      barPct: stats?.dqRate,
      rate: (b) => b?.dqRate,
      pair: (b) => `${formatInt(b?.totalDQ)} / ${formatInt(b?.totalPickedUpByBookDate)}`,
    },
    {
      label: "Show-up",
      hint: "Showed / confirmed",
      value: formatPct(stats?.showUpRateConfirmed || stats?.showUpRate),
      sub: `${formatInt(stats?.totalShowedUp)} / ${formatInt(stats?.totalConfirmed)}`,
      tone: "emerald",
      barPct: stats?.showUpRateConfirmed || stats?.showUpRate,
      rate: (b) => b?.showUpRateConfirmed ?? b?.showUpRate,
      pair: (b) => `${formatInt(b?.totalShowedUp)} / ${formatInt(b?.totalConfirmed)}`,
    },
    {
      label: "Closer DQ",
      hint: "Don't qualify / showed",
      value: formatPct(closerDq.rate),
      sub: `${formatInt(closerDq.dontQualify)} / ${formatInt(closerDq.showedUp)}`,
      tone: "rose",
      barPct: closerDq.rate,
      rate: (b) => b?.closerDqRate ?? pct((b?.totalPickedUp || 0) - (b?.totalConfirmed || 0), b?.totalShowedUp),
      pair: null,
    },
    {
      label: "Conversion",
      hint: "Purchased / showed",
      value: formatPct(stats?.conversionRate),
      sub: `${formatInt(stats?.totalPurchased)} / ${formatInt(stats?.totalShowedUp)}`,
      tone: "indigo",
      barPct: stats?.conversionRate,
      rate: (b) => b?.conversionRate,
      pair: (b) => `${formatInt(b?.totalPurchased)} / ${formatInt(b?.totalShowedUp)}`,
    },
    {
      label: "Success",
      hint: "Purchased / booked",
      value: formatPct(stats?.successRate),
      sub: `${formatInt(stats?.totalPurchased)} / ${formatInt(stats?.totalBooked)}`,
      tone: "indigo",
      barPct: stats?.successRate,
      rate: (b) => b?.successRate,
      pair: (b) => `${formatInt(b?.totalPurchased)} / ${formatInt(b?.totalBooked)}`,
    },
    {
      label: "Show-up (booked)",
      hint: "Showed / happened",
      value: formatPct(showUpRateBooked(stats)),
      sub: `${formatInt(stats?.totalShowedUp)} / ${formatInt(stats?.totalBookedThatHappened)}`,
      tone: "emerald",
      barPct: showUpRateBooked(stats),
      rate: (b) => pct(b?.totalShowedUp, b?.totalBookedThatHappened),
      pair: (b) => `${formatInt(b?.totalShowedUp)} / ${formatInt(b?.totalBookedThatHappened)}`,
    },
    {
      label: "Rescheduled",
      hint: "In period",
      value: formatInt(stats?.totalRescheduled),
      sub: "calls rescheduled",
      tone: "amber",
      barPct: Math.min(100, (stats?.totalRescheduled || 0) * 8),
      rate: (b) => b?.totalRescheduled,
      pair: null,
      count: true,
    },
    {
      label: "Recovered",
      hint: "By book date",
      value: formatInt(stats?.totalRecovered),
      sub: "leads recovered",
      tone: "emerald",
      barPct: Math.min(100, (stats?.totalRecovered || 0) * 8),
      rate: (b) => b?.totalRecovered,
      pair: null,
      count: true,
    },
    {
      label: "Recovery rate",
      hint: "Recovered / no-shows",
      value: formatPct(stats?.recoveryRate),
      sub: `${formatInt(stats?.totalRecovered)} / ${formatInt(stats?.totalNoShows)}`,
      tone: "emerald",
      barPct: stats?.recoveryRate,
      rate: (b) => b?.recoveryRate,
      pair: (b) => `${formatInt(b?.totalRecovered)} / ${formatInt(b?.totalNoShows)}`,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {tiles.map((tile) => (
        <MetricTile
          key={tile.label}
          label={tile.label}
          hint={tile.hint}
          value={tile.count ? formatInt(tile.rate(stats)) : tile.value}
          sub={tile.sub}
          tone={tile.tone}
          chartMode={chartMode}
          barPct={tile.barPct}
          footer={
            tile.pair ? (
              <BreakdownFooter
                stats={fullStats}
                sourceFilter={sourceFilter}
                countryFilter={countryFilter}
                readRate={tile.rate}
                readPair={tile.pair}
              />
            ) : null
          }
        />
      ))}
    </div>
  );
}

function CompactTable({ columns, rows, emptyLabel = "No data" }) {
  return (
    <div className="max-h-[220px] overflow-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-left text-[10px]">
        <thead className="sticky top-0 bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-400">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={cx("whitespace-nowrap px-2 py-1.5", col.align === "right" ? "text-right" : "text-left")}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center font-semibold text-slate-400">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row._key} className="font-semibold text-slate-700 hover:bg-slate-50/80">
                {columns.map((col) => (
                  <td key={col.key} className={cx("whitespace-nowrap px-2 py-1.5", col.align === "right" ? "text-right tabular-nums" : "")}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MetricsCurrentLeft({
  viewMode,
  filteredStats,
  stats,
  revenueSummary,
  sourceFilter,
  countryFilter,
  loading,
  bookingsPerDay,
  hideReschedules,
  onToggleReschedules,
}) {
  const chartMode = viewMode === "charts";
  return (
    <div className="flex min-w-0 flex-col gap-2 xl:col-span-2">
      <Panel title="Headline" kicker="Filtered period snapshot">
        <FunnelCards stats={filteredStats} revenueSummary={revenueSummary} loading={loading} />
      </Panel>
      <Panel title="Funnel metrics" kicker={chartMode ? "Bar view" : "All rates & counts"}>
        <MetricDenseGrid
          stats={filteredStats}
          fullStats={stats}
          sourceFilter={sourceFilter}
          countryFilter={countryFilter}
          loading={loading}
          chartMode={chartMode}
        />
      </Panel>
      <Panel title={chartMode ? "Purchases by source" : "Source mix"} kicker="Ads · organic · medium">
        {chartMode ? (
          <DistributionChart sourceStats={stats?.sourceStats} mediumStats={stats?.mediumStats} loading={loading} />
        ) : (
          <SourceSplit sourceStats={stats?.sourceStats} mediumStats={stats?.mediumStats} loading={loading} />
        )}
      </Panel>
      <Panel
        title="Booked calls"
        kicker="Daily lanes"
        action={
          <button
            type="button"
            onClick={onToggleReschedules}
            className="h-6 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
          >
            {hideReschedules ? "Show resched." : "Hide resched."}
          </button>
        }
      >
        <BookingsChart rows={bookingsPerDay} hideReschedules={hideReschedules} loading={loading} />
      </Panel>
      {chartMode && (
        <Panel title="Booking heatmap" kicker="Last 28 days">
          <BookingsHeatmap rows={bookingsPerDay} loading={loading} />
        </Panel>
      )}
      {!chartMode && (
        <Panel title="Funnel shape" kicker="Stage retention">
          <FunnelChart stats={filteredStats} loading={loading} />
        </Panel>
      )}
    </div>
  );
}

export function MetricsCurrentRight({
  viewMode,
  stats,
  loading,
  closers,
  setters,
  purchasesPanel,
}) {
  const chartMode = viewMode === "charts";
  const closerRows = useMemo(
    () => (closers || []).map((c) => ({
      _key: c.id || c.name,
      ...c,
      conversionRate: c.conversionRate ?? pct(c.purchased, c.showedUp),
      showUpRate: c.showUpRate ?? pct(c.showedUp, c.confirmed),
      pifRate: c.pifRate ?? pct(c.pif, c.purchased),
      closerDqRate: c.closerDqRate ?? pct(c.dontQualify, c.showedUp),
    })),
    [closers],
  );

  const countryRows = useMemo(
    () => (stats?.countries || []).map((c) => ({
      _key: c.country,
      ...c,
      successRate: c.totalBooked > 0 ? pct(c.totalPurchased, c.totalBooked) : 0,
    })),
    [stats?.countries],
  );

  return (
    <div className="flex min-w-0 flex-col gap-2 xl:col-span-2">
      <Panel title="Closers" kicker="Show-up · DQ · conversion">
        {loading ? (
          <PanelSkeleton rows={6} />
        ) : (
          <CompactTable
            columns={[
              { key: "name", label: "Name", render: (r) => <span className="font-bold text-slate-900">{r.name}</span> },
              { key: "showed", label: "Showed", align: "right", render: (r) => formatInt(r.showedUp) },
              { key: "showUp", label: "Show%", align: "right", render: (r) => formatPct(r.showUpRate) },
              { key: "dq", label: "DQ%", align: "right", render: (r) => <span className="text-rose-700">{formatPct(r.closerDqRate)}</span> },
              { key: "sold", label: "Sold", align: "right", render: (r) => formatInt(r.purchased) },
              { key: "pif", label: "PIF%", align: "right", render: (r) => formatPct(r.pifRate) },
              { key: "payoff", label: "Pay", align: "right", render: (r) => formatInt(r.payoffs) },
              { key: "conv", label: "Conv%", align: "right", render: (r) => formatPct(r.conversionRate) },
            ]}
            rows={closerRows}
          />
        )}
      </Panel>
      <Panel title="Setters" kicker="Pick-up · show-up · purchases">
        {loading ? (
          <PanelSkeleton rows={6} />
        ) : (
          <CompactTable
            columns={[
              { key: "name", label: "Name", render: (r) => <span className="font-bold text-slate-900">{r.name}</span> },
              { key: "booked", label: "Book", align: "right", render: (r) => formatInt(r.bookingsMadeInPeriod ?? r.totalBooked) },
              { key: "picked", label: "Pick", align: "right", render: (r) => formatInt(r.pickedUpFromBookings ?? r.totalPickedUp) },
              { key: "pickup", label: "Pick%", align: "right", render: (r) => formatPct(r.pickUpRate) },
              { key: "conf", label: "Conf", align: "right", render: (r) => formatInt(r.totalConfirmed) },
              { key: "show", label: "Show%", align: "right", render: (r) => formatPct(r.showUpRate) },
              { key: "buy", label: "Buy", align: "right", render: (r) => formatInt(r.totalPurchased) },
            ]}
            rows={setters || []}
          />
        )}
      </Panel>
      <Panel title="Countries" kicker={chartMode ? "Top performers" : "Phone-derived"}>
        {loading ? (
          <PanelSkeleton rows={6} />
        ) : (
          <CompactTable
            columns={[
              { key: "country", label: "Country", render: (r) => <span className="font-bold text-slate-800">{r.country || "Unknown"}</span> },
              { key: "booked", label: "Book", align: "right", render: (r) => formatInt(r.totalBooked) },
              { key: "pickup", label: "Pick%", align: "right", render: (r) => formatPct(r.pickUpRate) },
              { key: "confirmed", label: "Conf", align: "right", render: (r) => formatInt(r.totalConfirmed) },
              { key: "confirmation", label: "Conf%", align: "right", render: (r) => formatPct(r.confirmationRate) },
              { key: "shows", label: "Shows", align: "right", render: (r) => formatInt(r.totalShowedUp) },
              { key: "show", label: "Show%", align: "right", render: (r) => formatPct(r.showUpRate ?? r.showUpRateConfirmed) },
              { key: "sales", label: "Sales", align: "right", render: (r) => <span className="font-black text-emerald-700">{formatInt(r.totalPurchased)}</span> },
              { key: "conv", label: "Conv%", align: "right", render: (r) => formatPct(r.conversionRate) },
              { key: "closerDq", label: "CDQ%", align: "right", render: (r) => <span className="text-rose-700">{formatPct(r.closerDqRate)}</span> },
              { key: "success", label: "Success%", align: "right", render: (r) => formatPct(r.successRate) },
            ]}
            rows={countryRows}
            emptyLabel="No country data"
          />
        )}
      </Panel>
      {purchasesPanel}
    </div>
  );
}
