import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Single-select status filter. Each option shows the status as a colored badge
 * plus its description, so the dropdown doubles as the LT/status legend.
 */
export default function StatusSelect({ options, value, onChange, minWidth = 230 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium !outline-none transition ${
          value !== 'all' ? 'border-indigo-300 text-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="max-w-[150px] truncate">{selected.label}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div
          className="absolute left-0 z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
          style={{ minWidth }}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition hover:bg-slate-50 ${
                  active ? 'bg-slate-50' : 'bg-white'
                }`}
              >
                {o.value === 'all' ? (
                  <span className="text-[11px] font-medium text-slate-700">{o.label}</span>
                ) : (
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${o.cls}`}>
                    {o.label}
                  </span>
                )}
                {o.desc && <span className="flex-1 truncate text-[10px] text-slate-500">{o.desc}</span>}
                {o.count != null && (
                  <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">{o.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
