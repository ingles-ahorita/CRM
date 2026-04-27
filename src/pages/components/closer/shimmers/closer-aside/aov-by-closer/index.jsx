import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function AovByCloserShimmer({ className }) {
  return (
    <div
      className={cx(
        "rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden animate-pulse",
        className,
      )}
      aria-hidden="true"
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="h-7 w-24 rounded-lg bg-slate-100" />
        </div>
        <div className="mt-3 h-4 w-40 rounded bg-slate-100" />
      </div>

      <div className="pb-4 flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-slate-100" />
              <div className="h-8 w-8 rounded-full bg-slate-100" />
              <div>
                <div className="h-3 w-24 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-14 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-3 w-12 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

