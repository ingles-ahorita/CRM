import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function CloserBodyStatsShimmer({ className }) {
  return (
    <div
      className={cx(
        "w-full overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm",
        "animate-pulse",
        className,
      )}
      aria-hidden="true"
    >
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col items-center justify-center px-6 py-4 md:border-r md:border-slate-100">
          <div className="h-3 w-40 rounded bg-slate-100" />
          <div className="mt-3 h-8 w-32 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-64 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-40 rounded bg-slate-100" />
        </div>
        <div className="flex flex-col items-center justify-center px-6 py-4">
          <div className="h-3 w-36 rounded bg-slate-100" />
          <div className="mt-3 h-8 w-32 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-56 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-44 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

