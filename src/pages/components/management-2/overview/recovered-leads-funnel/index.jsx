import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

const TRACK = "#f3f4f6";

const FUNNEL_STEPS = [
  { key: "noshow", label: "No-shows", count: 12, color: "#8e9aaf" },
  { key: "contacted", label: "Contacted", count: 8, color: "#3b82f6" },
  { key: "rebooked", label: "Rebooked", count: 4, color: "#8b5cf6" },
  { key: "showed", label: "Showed up", count: 2, color: "#f59e0b" },
  { key: "closed", label: "Closed", count: 1, color: "#10b981" },
];

const CLOSERS = [
  { name: "Ana", count: 1 },
  { name: "Matias", count: 0 },
  { name: "Daiana", count: 0 },
  { name: "Emiliano", count: 0 },
];

/** Label column width matches left/right panels so bar tracks line up visually. */
const LABEL_COL =
  "w-[104px] shrink-0 pt-0.5 text-left text-[12px] font-semibold leading-snug text-[#374151] sm:w-[98px]";
const METRICS_COL =
  "flex w-[46px] shrink-0 flex-col items-end justify-center text-right sm:w-[52px]";
const BAR_H = "min-h-[20px]";
const BAR_INNER_PAD = "pr-2 sm:pr-2.5";

function FunnelBarRow({ label, count, pctLabel, color, widthPct, animate }) {
  return (
    <div className={`flex items-stretch`}>
      <div className={LABEL_COL}>{label}</div>
      <div className={`relative ${BAR_H} min-w-0 flex-1 self-center`}>
        <div className="absolute inset-0 rounded-md" style={{ backgroundColor: TRACK }} />
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-md transition-[width] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: animate ? `${widthPct}%` : "0%",
            backgroundColor: color,
            maxWidth: "100%",
          }}
        >
          <div
            className={`flex h-full min-w-0 items-center justify-end ${BAR_INNER_PAD} text-white`}
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.22)" }}
          >
            <span className="text-[12px] font-bold tabular-nums leading-none">{count}</span>
          </div>
        </div>
      </div>
      <div
        className={`${METRICS_COL} self-center pt-0.5 text-[12px] font-bold tabular-nums leading-none text-[#374151]`}
      >
        {pctLabel}
      </div>
    </div>
  );
}

function CloserRow({ name, count, maxCount, animate }) {
  const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const hasSale = count > 0;

  return (
    <div className="flex items-stretch">
      <div className={LABEL_COL}>{name}</div>
      <div className={`relative h-[12px] min-w-0 flex-1 self-center`}>
        <div className="absolute inset-0 rounded-md" style={{ backgroundColor: TRACK }} />
        {hasSale ? (
          <div
            className="absolute inset-y-0 left-0 overflow-hidden rounded-md bg-[#10b981] transition-[width] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: animate ? `${widthPct}%` : "0%", maxWidth: "100%" }}
          />
        ) : null}
      </div>
      <div className={`${METRICS_COL} self-center pt-0.5 text-[#374151]`}>
        {hasSale ? (
          <>
            <span className="text-[12px] font-bold tabular-nums leading-none">{count}</span>
            <span className="mt-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-black">
              closed
            </span>
          </>
        ) : (
          <span className="text-[12px] font-bold tabular-nums leading-none text-[#6b7280]">0</span>
        )}
      </div>
    </div>
  );
}

export default function RecoveredLeadsFunnel() {
  const base = FUNNEL_STEPS[0]?.count ?? 12;
  const [range, setRange] = useState("last_week");
  const [animateBars, setAnimateBars] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimateBars(true));
    });
    return () => cancelAnimationFrame(t);
  }, []);

  const closerMax = Math.max(...CLOSERS.map((c) => c.count), 1);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-6 pt-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
      <div className="mb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-xl font-bold leading-tight tracking-tight text-neutral-900">
           
            Recovered leads funnel
          </h2>
          {/* <span className="-translate-y-px inline-flex rounded-full bg-[#ede9fe] px-2 py-px text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#8b5cf6] ring-1 ring-[#ddd6fe]">
            CURRENT
          </span> */}
        </div>
        {/* <p className="mt-2.5 max-w-4xl text-[13px] font-normal leading-snug text-[#6b7280]">
          Replaces the 5-number row with a proper funnel showing drop-off at each step.
        </p> */}
      </div>

      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left — RECOVERY FUNNEL */}
          <section className="min-w-0 border bg-white p-4 rounded-xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-[14px] font-bold uppercase tracking-[0.14em] text-[#374151]">
                Recovery funnel
              </h3>
              <div className="relative shrink-0">
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  aria-label="Funnel period"
                  className="h-7 cursor-pointer appearance-none rounded-full border border-slate-200/90 bg-[#f3f4f6] py-1 pl-3 pr-7 text-[10px] font-bold uppercase tracking-wide text-[#4b5563] !outline-none transition-colors hover:bg-[#eceff2]"
                >
                  <option value="last_week">LAST WEEK</option>
                  <option value="this_week">THIS WEEK</option>
                  <option value="mtd">MTD</option>
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
              </div>
            </div>
            <div className="flex flex-col gap-[8px]">
              {FUNNEL_STEPS.map((step) => {
                const pct = base > 0 ? Math.round((step.count / base) * 100) : 0;
                const widthPct = base > 0 ? (step.count / base) * 100 : 0;
                return (
                  <FunnelBarRow
                    key={step.key}
                    label={step.label}
                    count={step.count}
                    pctLabel={`${pct}%`}
                    color={step.color}
                    widthPct={widthPct}
                    animate={animateBars}
                  />
                );
              })}
            </div>
          </section>

          {/* Right — CLOSED-FROM-RECOVERY BY CLOSER */}
          <section className="min-w-0 border bg-white p-4 rounded-xl">
            <h3 className="mb-5 text-[14px] font-bold uppercase tracking-[0.12em] text-black">
              Closed-from-recovery by closer
            </h3>
            <div className="flex flex-col gap-[8px]">
              {CLOSERS.map((c) => (
                <CloserRow
                  key={c.name}
                  name={c.name}
                  count={c.count}
                  maxCount={closerMax}
                  animate={animateBars}
                />
              ))}
            </div>
            <p className="mt-4 text-[11px] font-normal leading-relaxed tracking-tight text-[#9ca3af]">
              Recovered = no-shows that converted to a closed deal.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
