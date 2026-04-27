import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function BarRow() {
  return (
    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
      <div className="flex items-end gap-2 h-10">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="w-10 rounded-md bg-slate-200" style={{ height: `${(i < 4 ? 0.7 : 0.35) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={`m-${i}`} className="w-10 h-3 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export default function CloserHistoricPerformanceShimmer({ className }) {
  return (
    <div
      className={cx(
        "w-full rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden animate-pulse",
        className,
      )}
      aria-hidden="true"
    >
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="h-3 w-40 rounded bg-slate-100" />
        <div className="h-7 w-32 rounded-lg bg-slate-100" />
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="mt-2 h-7 w-20 rounded bg-slate-100" />
          <BarRow />
        </div>
        <div>
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="mt-2 h-7 w-16 rounded bg-slate-100" />
          <BarRow />
        </div>
        <div>
          <div className="h-3 w-20 rounded bg-slate-100" />
          <div className="mt-2 h-7 w-24 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-40 rounded bg-slate-100" />
          <div className="mt-4 h-3 w-28 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

