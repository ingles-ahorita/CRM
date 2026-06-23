import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Minimal multi-select dropdown matching the CRM filter UI.
 * - `selected` is an array of option values; an empty array means "all".
 * - `onChange(nextArray)` is called on every toggle / clear.
 */
export default function MultiSelect({ placeholder, options, selected, onChange, minWidth = 180 }) {
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

  const toggle = (value) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const display = selectedLabels.length === 0 ? placeholder : selectedLabels.join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium !outline-none transition ${
          selected.length > 0
            ? 'border-indigo-300 text-slate-800'
            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="max-w-[150px] truncate">{display}</span>
        {selected.length > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-100 px-1 text-[10px] font-bold text-indigo-700">
            {selected.length}
          </span>
        )}
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div
          className="absolute left-0 z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
          style={{ minWidth }}
        >
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-400">No options</div>
          ) : (
            options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  title={o.title || undefined}
                  className="flex w-full items-center gap-2 rounded-md bg-white px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="whitespace-nowrap">{o.label}</span>
                </button>
              );
            })
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md bg-white px-2 py-1.5 text-left text-[11px] font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
