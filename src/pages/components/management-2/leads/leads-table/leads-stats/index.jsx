import React, { useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
} from "recharts";

// UI-only summary band shown between the table tabs and the lead rows.
// Values are static dummy numbers for now — wire to real stats later.
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

function StatTile({
  label,
  value,
  color,
  total,
  isActive,
  onMouseEnter,
  onMouseLeave,
}) {
  const percent = pct(value, total);
  const isMuted = value === 0;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cx(
        "group relative flex flex-1 min-w-[120px] flex-col justify-center gap-1.5 px-4",
        "first:pl-3 transition-colors duration-200 cursor-default",
        isActive ? "bg-slate-50/80" : "",
      )}
    >
      <div
        className={cx(
          "absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-all duration-300",
          isActive ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50",
        )}
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="flex items-center gap-1.5">
        <span
          className={cx(
            "h-[7px] w-[7px] rounded-full flex-shrink-0",
            "transition-all duration-200",
            isActive ? "scale-[1.6]" : "scale-100",
          )}
          style={{
            backgroundColor: color,
            opacity: isMuted ? 0.45 : 1,
            boxShadow: isActive ? `0 0 0 3px ${color}33` : "none",
          }}
        />
        <span
          className={cx(
            "text-[10.5px] font-bold uppercase tracking-[0.06em]",
            isMuted ? "text-slate-400" : "text-slate-500",
          )}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cx(
            "text-[22px] font-black leading-none tabular-nums",
            "transition-colors duration-200",
            isMuted ? "text-slate-400" : "text-slate-900",
          )}
        >
          {value}
        </span>
        <span className="text-[10.5px] font-semibold text-slate-400 tabular-nums">
          {total ? `${percent}%` : "—"}
        </span>
      </div>
    </div>
  );
}

export default function LeadsStats({ stats = STATS }) {
  const series = buildSeries(stats);
  const totalBooked = stats.booked || 0;
  const [activeIdx, setActiveIdx] = useState(null);

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

          <div className="flex items-stretch divide-x divide-slate-200/70 flex-1">
            {series.slice(0, 4).map((s, i) => (
              <StatTile
                key={s.name}
                label={s.name}
                value={s.value}
                color={s.color}
                total={totalBooked}
                isActive={activeIdx === i}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
