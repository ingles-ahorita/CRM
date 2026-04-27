import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function ShowUpLeaderboardShimmer({ className }) {
  return (
    <div className={cx("rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden animate-pulse", className)} aria-hidden="true">
      <div className="px-4 pt-4 pb-3">
        <div className="h-3 w-40 rounded bg-slate-100" />
      </div>
      <div className="px-3 pb-4 flex flex-col gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-slate-100 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-6 rounded bg-slate-100" />
              <div className="h-8 w-8 rounded-full bg-slate-100" />
              <div>
                <div className="h-3 w-28 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-32 rounded bg-slate-100" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-10 rounded bg-slate-100" />
              <div className="h-4 w-10 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

