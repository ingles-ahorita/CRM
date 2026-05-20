import React from "react";
import { Info } from "lucide-react";

/**
 * Minimal info icon (top-right of section headers). Hover/focus shows a short hint.
 */
export default function SectionInfoHint({ text, className = "" }) {
  return (
    <span
      className={`group/info relative inline-flex h-[18px] w-[18px] shrink-0 cursor-default items-center justify-center self-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus-visible:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${className}`}
      tabIndex={0}
      role="button"
      aria-label={text}
    >
      <Info size={13} strokeWidth={2.25} aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-50 mt-1 w-[11.5rem] rounded border border-slate-200/90 bg-white px-2 py-1.5 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-[0_4px_14px_rgba(15,23,42,0.1)] group-hover/info:visible group-focus-visible/info:visible"
      >
        {text}
      </span>
    </span>
  );
}
