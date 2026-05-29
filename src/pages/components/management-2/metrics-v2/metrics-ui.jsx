/* eslint-disable react-refresh/only-export-components */
import { cx } from "./metricTransforms";

export function Panel({ title, kicker, action, children, className = "" }) {
  return (
    <section className={cx("flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-2", className)}>
      <div className="mb-2 flex min-h-8 items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold leading-tight text-slate-950">{title}</h3>
          {kicker && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kicker}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export function SectionBadge({ children }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

export function Select({ value, onChange, children, className = "", ...props }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className={cx("h-8 max-w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function ShimmerBlock({ className = "", style }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} style={style} />;
}

export function PanelSkeleton({ rows = 5, chart = false }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {chart ? (
        <div className="flex h-[230px] items-end gap-2">
          {[48, 76, 42, 88, 60, 72, 54, 82, 66, 44].map((height, index) => (
            <ShimmerBlock key={index} className="w-full" style={{ height }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1fr_56px] items-center gap-3">
              <div>
                <ShimmerBlock className="h-3 w-3/4" />
                <ShimmerBlock className="mt-1.5 h-2.5 w-1/2" />
              </div>
              <ShimmerBlock className="h-4 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LoadingCover({ show }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[1px]">
      <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 shadow-sm">
        Loading metrics...
      </div>
    </div>
  );
}

const TONE_TEXT = {
  blue: "text-blue-700",
  emerald: "text-emerald-700",
  purple: "text-purple-700",
  pink: "text-pink-700",
  slate: "text-slate-600",
  amber: "text-amber-700",
  rose: "text-rose-700",
  cyan: "text-cyan-700",
  indigo: "text-indigo-700",
};

export function toneText(tone) {
  return TONE_TEXT[tone] || TONE_TEXT.slate;
}
