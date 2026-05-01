import React, { useEffect, useMemo, useState } from "react";

const SEGMENTS = [
  { key: "matias", name: "Matias", amount: 1750, color: "#2563EB", barLabel: "1750" },
  { key: "aria", name: "Aria", amount: 1285, color: "#16A34A", barLabel: "1285" },
  { key: "dalana", name: "Dalana", amount: 591, color: "#DB2777", barLabel: "591" },
  { key: "setters", name: "Setters", amount: 981, color: "#F59E0B", barLabel: "981" },
  { key: "emi", name: "Emi", amount: 165, color: "#7C3AED", barLabel: "165" },
];

function formatUsd(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CommissionOverviewSnapshot() {
  const [animate, setAnimate] = useState(false);

  const total = useMemo(() => SEGMENTS.reduce((acc, s) => acc + s.amount, 0), []);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimate(true));
    });
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-6 pt-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
      <div className="mb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-xl font-bold leading-tight tracking-tight text-neutral-900">
            Commission overview snapshot
          </h2>
          {/* <span className="-translate-y-px inline-flex rounded-full bg-sky-100 px-2 py-px text-[9px] font-extrabold uppercase tracking-[0.1em] text-sky-800 ring-1 ring-sky-200/90">
            NEW SECONDARY
          </span> */}
        </div>
        {/* <p className="mt-2.5 max-w-4xl text-[13px] font-normal leading-snug text-[#6b7280]">
          Where commission $$ went this month — stacked bar.
        </p> */}
      </div>

      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.14em] text-black">
              Commission split this month
            </h3>
            <span className="inline-flex w-fit shrink-0 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-[11px] font-bold tabular-nums tracking-tight text-[#374151]">
              TOTAL {formatUsd(total)}
            </span>
          </div>

          <div className="flex h-11 w-full overflow-hidden rounded-lg sm:h-[46px]">
            {SEGMENTS.map((s) => {
              const pct = total > 0 ? (s.amount / total) * 100 : 0;
              return (
                <div
                  key={s.key}
                  className="flex min-w-0 shrink-0 items-center justify-center overflow-hidden px-0.5 text-[11px] font-bold tabular-nums text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:text-[12px]"
                  style={{
                    width: animate ? `${pct}%` : "0%",
                    backgroundColor: s.color,
                    transition: "width 1.05s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                  title={`${s.name} ${formatUsd(s.amount)}`}
                >
                  <span className="whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.28)]">
                    {s.barLabel}
                  </span>
                </div>
              );
            })}
          </div>

          <ul className="mt-5 flex list-none flex-wrap gap-x-5 gap-y-3 sm:gap-x-8">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-[12px] text-[#374151]">
                <span
                  className="h-3 w-3 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="font-semibold whitespace-nowrap">
                  {s.name}{" "}
                  <span className="font-bold tabular-nums text-neutral-900">
                    {formatUsd(s.amount)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
