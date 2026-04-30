import React, { useEffect, useState } from "react";

const PICKUP_DATA = [
  { name: "Malte", value: 89.7 },
  { name: "Nilda", value: 83.7 },
  { name: "Jenn", value: 79.7 },
  { name: "Marleen", value: 79.2 },
];

const SHOWUP_DATA = [
  { name: "Marleen", value: 66.7 },
  { name: "Nilda", value: 58.6 },
  { name: "Malte", value: 57.1 },
  { name: "Jenn", value: 47.9 },
];

function BarChartRow({ name, value, colorClass, delayMs }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Smoothly animate the bar from 0 to target value on mount
    const timer = setTimeout(() => {
      setWidth(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return (
    <div className="group flex items-center gap-2 py-1.5 transition-colors hover:bg-slate-50/50 -mx-2 px-2 rounded-lg">
      <div className="w-[60px] text-[13px] font-semibold text-slate-700">
        {name}
      </div>
      <div className="relative flex-1 h-[14px] bg-slate-100 rounded-full overflow-hidden shadow-inner">
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${colorClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="w-[42px] text-right text-[13.5px] font-bold text-slate-800">
        {value.toFixed(1)}%
      </div>
    </div>
  );
}

function BarChartCard({ title, data, colorClass }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
      <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-600/90">
        {title}
      </h3>
      <div className="flex flex-col gap-1">
        {data.map((item, idx) => (
          <BarChartRow
            key={item.name}
            name={item.name}
            value={item.value}
            colorClass={colorClass}
            delayMs={100 + idx * 100}
          />
        ))}
      </div>
    </div>
  );
}

export default function Setter() {
  return (
    <div className="w-full max-w-[1400px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header Area */}
      <div className="mb-4 flex flex-col items-start gap-1">
        <div className="flex items-center gap-3">
          <h2 className="text-[20px] font-bold tracking-tight text-[#0f172a]">
            Setter performance snapshot
          </h2>
          {/* <div className="flex items-center rounded-full bg-[#ebf5ff] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#2563eb] shadow-sm ring-1 ring-inset ring-[#2563eb]/20 mt-2">
            New Secondary
          </div> */}
        </div>
        {/* <p className="text-[13px] font-medium text-slate-500">
          Spot a struggling setter without leaving this page.
        </p> */}
      </div>

      {/* Dashed Container Area */}
      <div className="relative mt-5">
        {/* Outer Dashed Box */}
        <div className="rounded-[16px] border-[2px] border-dashed border-slate-300/80 bg-slate-50/50 p-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Left Chart */}
            <BarChartCard
              title="Pick-up rate by setter"
              data={PICKUP_DATA}
              colorClass="bg-[#3b82f6] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1),0_2px_8px_rgba(59,130,246,0.4)]"
            />

            {/* Right Chart */}
            <BarChartCard
              title="Show-up rate by setter"
              data={SHOWUP_DATA}
              colorClass="bg-[#22c55e] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1),0_2px_8px_rgba(34,197,94,0.4)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
