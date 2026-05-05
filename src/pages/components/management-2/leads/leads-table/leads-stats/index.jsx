import React, { useState } from "react";
import { getConfirmationClass } from "../../../../../../utils/performanceBenchmarks";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
} from "recharts";

// Default stats when parent does not pass `stats` (e.g. Storybook).
const STATS = {
  booked: 12,
  confirmed: 7,
  cancelled: 1,
  noPickUp: 2,
  noShows: 0,
};

const PALETTE = {
  confirmed: "#10b981", // emerald-500
  cancelled: "#f97316", // orange-500
  noPickUp: "#ef4444", // red-500
  noShows: "#94a3b8", // slate-400
  remainder: "#e2e8f0", // slate-200
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

function LeadsStatsShimmer() {
  return (
    <div className="px-3 pb-3 pt-2">
      <div
        className="
          relative rounded-2xl border border-slate-200/80
          bg-gradient-to-br from-white via-slate-50/60 to-white
          px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]
        "
      >
        <div className="flex items-center gap-5">
          <div className="relative h-[120px] w-[120px] flex-shrink-0 flex items-center justify-center">
            {shimmer("h-[104px] w-[104px] rounded-full")}
          </div>
          <div className="hidden h-[68px] w-px flex-shrink-0 bg-slate-200/80 sm:block" />
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-y-1 divide-x divide-slate-200/70 lg:grid-cols-4 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-[100px] flex-col justify-center gap-2 px-3 py-1 sm:px-4"
              >
                {shimmer("h-3 w-24")}
                {shimmer("h-8 w-14")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function pct(value, total) {
  if (!total || !Number.isFinite(value)) return 0;
  return Math.round((value / total) * 100);
}

function buildSeries(stats) {
  const consumed =
    (stats.confirmed || 0) +
    (stats.cancelled || 0) +
    (stats.noPickUp || 0) +
    (stats.noShows || 0);
  const remainder = Math.max(0, (stats.booked || 0) - consumed);
  return [
    { name: "Confirmed", value: stats.confirmed || 0, color: PALETTE.confirmed },
    { name: "Cancelled", value: stats.cancelled || 0, color: PALETTE.cancelled },
    { name: "No Pick up", value: stats.noPickUp || 0, color: PALETTE.noPickUp },
    { name: "No Shows", value: stats.noShows || 0, color: PALETTE.noShows },
    { name: "Remaining", value: remainder, color: PALETTE.remainder },
  ];
}

// Active sector — slightly larger ring + a soft outer halo.
function renderActiveShape(props) {
  const { cx: cX, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
    props;
  return (
    <g style={{ filter: `drop-shadow(0 2px 6px ${fill}55)` }}>
      <Sector
        cx={cX}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 5}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cX}
        cy={cy}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 9}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.18}
      />
    </g>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d || d.name === "Remaining") return null;
  return (
    <div className="rounded-md bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg ring-1 ring-white/5 backdrop-blur">
      <span className="opacity-80">{d.name}</span>
      <span className="ml-2 font-extrabold tabular-nums">{d.value}</span>
    </div>
  );
}

function MetricItem({ label, value, subValue, tone = "text-slate-900" }) {
  return (
    <div className="flex min-w-[130px] flex-col justify-center gap-0.5 px-3 py-1.5 sm:px-4">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className={cx("text-[26px] font-black leading-none tabular-nums", tone)}>
          {value}
        </span>
        {subValue != null ? (
          <span className="text-[11px] font-semibold text-slate-400 tabular-nums">
            {subValue}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function LeadsStats({ stats = STATS, loading = false, details }) {
  const series = buildSeries(stats);
  const totalBooked = stats.booked || 0;
  const [activeIdx, setActiveIdx] = useState(null);
  const safeDetails = details || {};
  const slots = Number(safeDetails.slots || 0);
  const occupancy = Number(safeDetails.occupancy || 0);
  const booked = Number(safeDetails.booked || stats.booked || 0);
  const confirmed = Number(safeDetails.confirmed || stats.confirmed || 0);
  const cancelled = Number(safeDetails.cancelled || stats.cancelled || 0);
  const noPickUp = Number(safeDetails.noPickUp || stats.noPickUp || 0);
  const noShows = Number(safeDetails.noShows || stats.noShows || 0);

  if (loading) {
    return <LeadsStatsShimmer />;
  }

  return (
    <div className="px-3 pb-3 pt-2">
      <div
        className="
          relative rounded-2xl border border-slate-200/80
          bg-gradient-to-br from-white via-slate-50/60 to-white
          px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]
        "
      >
        <div className="flex items-center gap-5">
          <div className="relative h-[120px] w-[120px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={series}
                  innerRadius={34}
                  outerRadius={50}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                  startAngle={90}
                  endAngle={450}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                  animationBegin={150}
                  activeIndex={activeIdx ?? -1}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, idx) => setActiveIdx(idx)}
                  onMouseLeave={() => setActiveIdx(null)}
                >
                  {series.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      style={{ cursor: "pointer", outline: "none" }}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<ChartTooltip />}
                  wrapperStyle={{ outline: "none" }}
                  cursor={false}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-black text-slate-900 leading-none">
                {totalBooked}
              </span>
              <span className="mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-[0.18em]">
                Booked
              </span>
            </div>
          </div>

          <div className="hidden h-[68px] w-px bg-slate-200/80 sm:block" />

          <div className="grid flex-1 grid-cols-2 gap-y-1 divide-x divide-slate-200/70 lg:grid-cols-4 xl:grid-cols-7">
            <MetricItem label="Slots" value={slots} />
            <MetricItem label="Occupancy" value={`${occupancy}%`} />
            <MetricItem label="Booked" value={booked} />
            <MetricItem
              label="Confirmed"
              value={confirmed}
              subValue={`${pct(confirmed, booked)}%`}
              tone={getConfirmationClass(pct(confirmed, booked))}
            />
            <MetricItem
              label="Cancelled"
              value={cancelled}
              subValue={`${pct(cancelled, booked)}%`}
            />
            <MetricItem
              label="No Pick up"
              value={noPickUp}
              subValue={`${pct(noPickUp, booked)}%`}
            />
            <MetricItem
              label="No Shows"
              value={noShows}
              subValue={`${pct(noShows, booked)}%`}
              tone={noShows > 0 ? "text-slate-900" : "text-slate-400"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
