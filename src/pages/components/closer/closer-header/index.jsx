import React from "react";
import { BarChart3, LogOut, Play } from "lucide-react";

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function CloserHeader({
  name = "Ana",
  monthLabel = "April 2026",
  lastUpdatedLabel = "Last updated: 5 min ago",
  // promoLabel = "PF - $225 commission vs Dowsell - $75 90 - Close PE: earn 3x more",
  onFullStats,
  onStartShift,
  startShiftLabel = "Start Shift",
  isShiftActive = false,
}) {
  const initials = getInitials(name);

  return (
    <div className="w-full">
      <div
        className={cx(
          "w-full",
          "rounded-xl",
          "px-4 py-3 sm:px-5 sm:py-4",
          "flex items-center justify-between gap-3",
          "shadow-[0_10px_30px_rgba(2,6,23,0.35)]",
          "border border-white/10",
          "bg-gradient-to-b from-slate-900 to-slate-950",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div className="h-11 w-11 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shadow-inner">
              {initials}
            </div>
            <div className="absolute inset-0 rounded-full ring-2 ring-white/20" />
          </div>

          <div className="min-w-0">
            <div className="text-white font-semibold text-[15px] sm:text-[16px] leading-tight truncate">
              {`Closer Dashboard: ${name}`}
            </div>
            <div className="text-slate-300 text-xs leading-tight truncate">
              <span className="text-slate-200/90">{monthLabel}</span>
              <span className="mx-2 text-slate-500">•</span>
              <span className="text-slate-300">{lastUpdatedLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* <div
            className={cx(
              "hidden md:flex items-center",
              "max-w-[540px]",
              "px-3 py-1.5",
              "rounded-lg",
              "border border-amber-400/30",
              "bg-gradient-to-r from-amber-500/35 to-orange-500/25",
              "text-amber-50 text-xs",
              "shadow-[0_8px_18px_rgba(245,158,11,0.14)]",
            )}
            title={promoLabel}
          >
            <span className="truncate">{promoLabel}</span>
          </div> */}

          <button
            type="button"
            onClick={onFullStats}
            className={cx(
              "h-9",
              "px-3",
              "rounded-lg",
              "inline-flex items-center gap-2",
              "text-xs font-semibold",
              "text-slate-100",
              "bg-white/10 hover:bg-white/15",
              "border border-white/15",
              "backdrop-blur",
              "transition",
            )}
          >
            <BarChart3 size={16} className="text-slate-200" />
            <span>Full Stats</span>
          </button>

          {/* <button
            type="button"
            onClick={onStartShift}
            className={cx(
              "h-9",
              "px-3.5",
              "rounded-lg",
              "inline-flex items-center gap-2",
              "text-xs font-semibold",
              "text-white",
              isShiftActive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-emerald-600 hover:bg-emerald-500",
              "shadow-[0_12px_24px_rgba(16,185,129,0.25)]",
              "transition",
            )}
          >
            {isShiftActive ? (
              <LogOut size={16} className="text-white/95" />
            ) : (
              <Play size={16} className="text-white/95" />
            )}
            <span>{startShiftLabel}</span>
          </button> */}
        </div>
      </div>
    </div>
  );
}
