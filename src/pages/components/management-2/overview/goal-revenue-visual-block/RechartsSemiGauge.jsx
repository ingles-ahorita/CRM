import React, { useMemo } from "react";
import { Pie, PieChart } from "recharts";

const CHART_W = 200;
const CHART_H = 118;

/** Semicircular progress ring using Recharts Pie (supports built-in animations). */
export default function RechartsSemiGauge({
  percent,
  fillActive,
  trackColor = "#e5e7eb",
  labelMain,
  labelSub,
  animationDuration = 900,
}) {
  const p = Math.min(100, Math.max(0, percent));
  const data = useMemo(() => {
    if (p <= 0)
      return [{ key: "t", value: 100, fill: trackColor }];
    if (p >= 100) return [{ key: "p", value: 100, fill: fillActive }];
    return [
      { key: "p", value: p, fill: fillActive },
      { key: "t", value: 100 - p, fill: trackColor },
    ];
  }, [fillActive, p, trackColor]);

  return (
    <div className="relative h-[138px] w-[212px] shrink-0">
      <PieChart width={CHART_W} height={CHART_H}>
        <Pie
          animationBegin={80}
          animationDuration={animationDuration}
          animationEasing="ease-out"
          data={data}
          dataKey="value"
          nameKey="key"
          cx={CHART_W / 2}
          cy={CHART_H}
          innerRadius={66}
          outerRadius={82}
          startAngle={180}
          endAngle={0}
          strokeWidth={0}
          paddingAngle={0}
          isAnimationActive
          cornerRadius={8}
        />
      </PieChart>
      <div className="pointer-events-none absolute inset-x-0 bottom-[26px] flex flex-col items-center text-center">
        <div className="text-[32px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
          {labelMain}
        </div>
        <div className="mt-2 max-w-[130px] text-[11px] font-semibold leading-snug text-slate-500">
          {labelSub}
        </div>
      </div>
    </div>
  );
}
