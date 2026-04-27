import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function Row() {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="h-3 w-40 rounded bg-slate-100" />
        <div className="mt-2 h-3 w-56 rounded bg-slate-100" />
      </div>
      <div className="hidden lg:flex items-center gap-5 flex-shrink-0">
        <div className="h-3 w-28 rounded bg-slate-100" />
        <div className="h-3 w-14 rounded bg-slate-100" />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-5 w-20 rounded-full bg-slate-100" />
        ))}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="h-8 w-16 rounded-lg bg-slate-100" />
        <div className="h-8 w-8 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

export default function CloserTodaysLeadsShimmer({ className }) {
  return (
    <div
      className={cx(
        "w-full rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden animate-pulse",
        className,
      )}
      aria-hidden="true"
    >
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="h-3 w-28 rounded bg-slate-100" />
        <div className="h-7 w-[420px] rounded-lg bg-slate-100" />
      </div>
      <div className="divide-y divide-slate-100">
        {[0, 1, 2].map((i) => (
          <Row key={i} />
        ))}
      </div>
    </div>
  );
}

