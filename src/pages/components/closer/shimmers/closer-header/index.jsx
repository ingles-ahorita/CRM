import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function CloserHeaderShimmer({ className }) {
  return (
    <div className={cx("w-full", className)}>
      <div
        className={cx(
          "w-full",
          "rounded-xl",
          "px-4 py-3 sm:px-5 sm:py-4",
          "flex items-center justify-between gap-3",
          "bg-white border border-slate-100 shadow-sm",
          "animate-pulse",
        )}
        aria-hidden="true"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div className="h-11 w-11 rounded-full bg-slate-100" />
            <div className="absolute inset-0 rounded-full ring-2 ring-slate-100" />
          </div>

          <div className="min-w-0 flex flex-col gap-2">
            <div className="h-4 w-56 max-w-[55vw] rounded bg-slate-100" />
            <div className="flex items-center gap-2">
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="h-3 w-3 rounded-full bg-slate-100" />
              <div className="h-3 w-28 rounded bg-slate-100" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div
            className={cx(
              "hidden md:flex items-center",
              "w-[420px] max-w-[40vw]",
              "px-3 py-1.5",
              "rounded-lg",
              "border border-slate-100",
              "bg-slate-50",
            )}
          >
            <div className="h-3 w-full rounded bg-slate-100" />
          </div>

          <div className="h-9 w-[96px] rounded-lg bg-slate-100 border border-slate-100" />
          <div className="h-9 w-[110px] rounded-lg bg-slate-100 border border-slate-100" />
        </div>
      </div>
    </div>
  );
}

