import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function HeaderBlock({ className }) {
  return <div className={cx("h-[52px] flex items-center justify-center", className)} />;
}

function MetricBlock() {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <div className="h-8 w-8 rounded-lg bg-slate-100" />
      <div>
        <div className="h-3 w-28 rounded bg-slate-100" />
        <div className="mt-2 h-3 w-40 rounded bg-slate-100" />
      </div>
    </div>
  );
}

function CellBlock() {
  return (
    <div className="px-4 py-4 flex flex-col items-center justify-center text-center">
      <div className="h-5 w-20 rounded bg-slate-100" />
      <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
      <div className="mt-2 h-6 w-20 rounded-full bg-slate-100" />
    </div>
  );
}

export default function CloserMetricsTableShimmer({ className }) {
  return (
    <div
      className={cx(
        "w-full rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden animate-pulse",
        className,
      )}
      aria-hidden="true"
    >
      <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr]">
        <HeaderBlock className="bg-white" />
        <HeaderBlock className="bg-slate-50" />
        <HeaderBlock className="bg-slate-50" />
        <HeaderBlock className="bg-slate-50" />
      </div>

      <div className="divide-y divide-slate-100">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="grid grid-cols-[1.2fr_1fr_1fr_1fr]">
            <MetricBlock />
            <CellBlock />
            <CellBlock />
            <CellBlock />
          </div>
        ))}
      </div>
    </div>
  );
}

