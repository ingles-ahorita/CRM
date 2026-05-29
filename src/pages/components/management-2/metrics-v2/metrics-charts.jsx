/* eslint-disable react-refresh/only-export-components */
import { cx, formatInt, formatPct, formatUsd, pct } from "./metricTransforms";
import { PanelSkeleton, SectionBadge, ShimmerBlock } from "./metrics-ui";

export function StatCard({ label, value, sub, tone = "slate" }) {
  const tones = {
    blue: "text-blue-700 bg-white border-slate-200",
    emerald: "text-emerald-700 bg-white border-slate-200",
    rose: "text-rose-700 bg-white border-slate-200",
    amber: "text-amber-700 bg-white border-slate-200",
    slate: "text-slate-800 bg-white border-slate-200",
    cyan: "text-cyan-700 bg-white border-slate-200",
    indigo: "text-indigo-700 bg-white border-slate-200",
  };
  return (
    <div className={cx("min-h-[72px] rounded-xl border px-2.5 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]", tones[tone] || tones.slate)}>
      <div className="text-[9px] font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-lg font-black leading-none">{value}</div>
      {sub && <div className="mt-1 truncate text-[10px] font-semibold opacity-70" title={sub}>{sub}</div>}
    </div>
  );
}

export function FunnelCards({ stats, revenueSummary, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="min-h-[72px] rounded-xl border border-slate-200 px-2.5 py-2">
            <ShimmerBlock className="h-2 w-16" />
            <ShimmerBlock className="mt-2 h-5 w-12" />
          </div>
        ))}
      </div>
    );
  }
  const gross = (revenueSummary?.grossCents || 0) / 100;
  const avgDeal = stats?.totalPurchased > 0 ? gross / stats.totalPurchased : 0;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <StatCard label="Booked in period" value={formatInt(stats?.bookingsMadeInPeriod)} sub={`${formatInt(stats?.pickedUpFromBookings)} picked up`} tone="blue" />
      <StatCard label="Total calls" value={formatInt(stats?.totalShowedUp)} sub={`${formatInt(stats?.totalPurchased)} closed deals`} tone="blue" />
      <StatCard label="Show-up" value={formatPct(stats?.showUpRateConfirmed || stats?.showUpRate)} sub={`${formatInt(stats?.totalShowedUp)} / ${formatInt(stats?.totalConfirmed)} confirmed`} tone="emerald" />
      <StatCard label="Conversion" value={formatPct(stats?.conversionRate)} sub={`${formatInt(stats?.totalPurchased)} / ${formatInt(stats?.totalShowedUp)} showed`} tone="amber" />
      <StatCard label="Success" value={formatPct(stats?.successRate)} sub={`${formatInt(stats?.totalPurchased)} / ${formatInt(stats?.totalBooked)} calls`} tone="slate" />
      <StatCard label="DQ rate" value={formatPct(stats?.dqRate)} sub={`${formatInt(stats?.totalDQ)} DQ`} tone="rose" />
      <StatCard label="Recovery" value={formatPct(stats?.recoveryRate)} sub={`${formatInt(stats?.totalRecovered)} / ${formatInt(stats?.totalNoShows)} no-shows`} tone="emerald" />
      <StatCard label="PIF rate" value={formatPct(stats?.pifPercent)} sub={`${formatInt(stats?.totalPif)} / ${formatInt(stats?.totalPurchased)} purchases`} tone="indigo" />
      <StatCard label="Downsell" value={formatPct(stats?.downsellPercent)} sub={`${formatInt(stats?.totalDownsell)} / ${formatInt(stats?.totalPurchased)} purchases`} tone="amber" />
      <StatCard label="Gross revenue" value={formatUsd(gross)} sub={avgDeal > 0 ? `${formatUsd(avgDeal)} avg / deal` : `${formatUsd((revenueSummary?.netCents || 0) / 100)} net`} tone="emerald" />
    </div>
  );
}

export function SourceSplit({ sourceStats, mediumStats, loading }) {
  const rows = [
    { label: "Ads", data: sourceStats?.ads, color: "bg-blue-500" },
    { label: "Organic", data: sourceStats?.organic, color: "bg-emerald-500" },
    { label: "TikTok", data: mediumStats?.tiktok, color: "bg-pink-500" },
    { label: "Instagram", data: mediumStats?.instagram, color: "bg-purple-500" },
    { label: "Other ads", data: mediumStats?.other, color: "bg-slate-500" },
  ];
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2">
      <div className="mb-2 flex items-center justify-between">
        <SectionBadge>Conversion by split</SectionBadge>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => <ShimmerBlock key={index} className="h-3 w-full" />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[64px_1fr_42px] items-center gap-1.5 text-[10px]">
              <div className="truncate font-bold text-slate-700">{row.label}</div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className={cx("h-1.5 rounded-full", row.color)} style={{ width: `${Math.min(100, row.data?.conversionRate || 0)}%` }} />
              </div>
              <div className="text-right font-black text-slate-900">{formatPct(row.data?.conversionRate)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FunnelChart({ stats, loading }) {
  const rows = [
    { name: "Booked", value: stats?.totalBooked || 0, color: "bg-slate-500" },
    { name: "Confirmed", value: stats?.totalConfirmed || 0, color: "bg-blue-500" },
    { name: "Showed", value: stats?.totalShowedUp || 0, color: "bg-emerald-500" },
    { name: "Purchased", value: stats?.totalPurchased || 0, color: "bg-indigo-500" },
  ];
  const max = Math.max(1, rows[0]?.value || 0, ...rows.map((row) => row.value));
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2">
      {loading ? <PanelSkeleton chart /> : (
        <div className="space-y-1.5">
          {rows.map((row, index) => {
            const prev = index === 0 ? row.value : rows[index - 1].value;
            const retention = index === 0 ? 100 : (prev ? (row.value / prev) * 100 : 0);
            return (
              <div key={row.name}>
                <div className="mb-0.5 flex justify-between text-[10px] font-bold text-slate-600">
                  <span>{row.name}</span>
                  <span className="text-slate-900">{formatInt(row.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={cx("h-2 rounded-full", row.color)} style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
                </div>
                {index > 0 && <div className="mt-0.5 text-right text-[9px] font-semibold text-slate-400">{formatPct(retention)} retained</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DistributionChart({ sourceStats, mediumStats, loading }) {
  const data = [
    { name: "Ads", value: sourceStats?.ads?.totalPurchased || 0, color: "bg-blue-500" },
    { name: "Organic", value: sourceStats?.organic?.totalPurchased || 0, color: "bg-emerald-500" },
    { name: "TikTok", value: mediumStats?.tiktok?.totalPurchased || 0, color: "bg-pink-500" },
    { name: "Instagram", value: mediumStats?.instagram?.totalPurchased || 0, color: "bg-purple-500" },
  ];
  const max = Math.max(1, ...data.map((row) => row.value));
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2">
      {loading ? <PanelSkeleton chart /> : (
        <div className="grid grid-cols-2 gap-1.5">
          {data.map((row) => (
            <div key={row.name} className="rounded-lg border border-slate-100 bg-white p-1.5">
              <div className="flex justify-between text-[10px] font-bold text-slate-700">
                <span>{row.name}</span>
                <span>{formatInt(row.value)}</span>
              </div>
              <div className="mt-1 h-10 rounded bg-slate-50 p-0.5">
                <div className={cx("h-full w-full rounded", row.color)} style={{ height: `${Math.max(8, (row.value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BookingsChart({ rows, hideReschedules, loading }) {
  const data = hideReschedules
    ? (rows || []).map((row) => ({ ...row, rescheduled: 0, total: row.organic + row.ads }))
    : rows || [];
  const max = Math.max(1, ...data.map((row) => row.total || row.organic + row.ads + row.rescheduled));
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2">
      {loading ? <PanelSkeleton chart /> : (
        <div className="max-h-[200px] space-y-1 overflow-auto pr-0.5">
          {data.slice(-14).map((row) => {
            const organicPct = ((row.organic || 0) / max) * 100;
            const adsPct = ((row.ads || 0) / max) * 100;
            const rescheduledPct = ((row.rescheduled || 0) / max) * 100;
            return (
              <div key={row.date} className="grid grid-cols-[44px_1fr_28px] items-center gap-1 text-[10px]">
                <div className="font-bold tabular-nums text-slate-500">{String(row.date).slice(5)}</div>
                <div className="flex h-4 overflow-hidden rounded border border-slate-100 bg-white">
                  <div className="bg-emerald-500" style={{ width: `${organicPct}%` }} />
                  <div className="bg-blue-500" style={{ width: `${adsPct}%` }} />
                  {!hideReschedules && <div className="bg-amber-500" style={{ width: `${rescheduledPct}%` }} />}
                </div>
                <div className="text-right font-black text-slate-900">{formatInt(row.total)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BookingsHeatmap({ rows, loading }) {
  const cells = (rows || []).slice(-28).map((row) => ({
    date: row.date,
    total: row.total || row.organic + row.ads + row.rescheduled,
  }));
  const max = Math.max(1, ...cells.map((cell) => cell.total));
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2">
      {loading ? <PanelSkeleton chart /> : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const alpha = 0.15 + (cell.total / max) * 0.85;
              return (
                <div
                  key={cell.date}
                  className="flex h-7 items-center justify-center rounded border border-slate-200 text-[8px] font-bold text-slate-700"
                  style={{ backgroundColor: `rgba(79,70,229,${alpha.toFixed(3)})` }}
                  title={`${cell.date}: ${formatInt(cell.total)}`}
                >
                  {String(cell.date).slice(8, 10)}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] font-semibold text-slate-500">
            <span>28-day intensity</span>
            <span>{formatInt(cells.reduce((sum, c) => sum + c.total, 0))} total</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function showUpRateBooked(stats) {
  return pct(stats?.totalShowedUp, stats?.totalBookedThatHappened);
}
