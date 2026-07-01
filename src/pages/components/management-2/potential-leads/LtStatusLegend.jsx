import React from 'react';
import { Info } from 'lucide-react';
import { LT_STATUS_UI } from '../../../../../lib/potentialLeadLtStatus.js';
import LtStatusBadge from '../../potential-leads/LtStatusBadge.jsx';

/** Info icon that reveals a compact LT0–LT5 stage guide on hover. */
export default function LtStatusLegend() {
  return (
    <div className="group relative inline-flex">
      <Info
        size={14}
        className="cursor-help text-slate-400 transition hover:text-slate-600"
        aria-label="LT0–LT5 guide"
      />
      <div className="pointer-events-none absolute right-0 top-6 z-30 w-[260px] origin-top-right scale-95 rounded-lg border border-slate-200 bg-white p-2.5 opacity-0 shadow-lg transition-all duration-150 group-hover:scale-100 group-hover:opacity-100">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Pipeline stages
        </div>
        <ul className="flex flex-col gap-1.5">
          {LT_STATUS_UI.map((s) => (
            <li key={s.value} className="flex items-center gap-2">
              <span className="w-9 shrink-0">
                <LtStatusBadge value={s.value} />
              </span>
              <span className="text-[12px] leading-tight text-slate-600">{s.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
