import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function PayoffOpportunitiesShimmer({ className }) {
  return (
    <div className={cx("rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden animate-pulse", className)} aria-hidden="true">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="h-3 w-40 rounded bg-slate-100" />
        <div className="h-3 w-36 rounded bg-slate-100" />
      </div>

      <div className="px-4 divide-y divide-slate-100">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-100" />
              <div>
                <div className="h-3 w-28 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-40 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-8 w-24 rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="px-4 py-3">
        <div className="h-3 w-56 mx-auto rounded bg-slate-100" />
      </div>
    </div>
  );
}

