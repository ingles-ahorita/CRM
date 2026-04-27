import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function RecoveredLeadsShimmer({ className }) {
  return (
    <div className={cx("rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden animate-pulse", className)} aria-hidden="true">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="h-3 w-32 rounded bg-slate-100" />
        <div className="h-6 w-28 rounded-lg bg-slate-100" />
      </div>

      <div className="px-4 pb-3">
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center justify-center py-2">
              <div className="h-5 w-8 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-12 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="mt-3 h-9 rounded-xl bg-slate-100" />
      </div>

      <div className="px-4 divide-y divide-slate-100">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-3">
            <div>
              <div className="h-3 w-32 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-16 rounded bg-slate-100" />
            </div>
            <div className="h-7 w-20 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

