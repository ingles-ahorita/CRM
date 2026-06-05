import React from 'react';
import { LT_STATUS_LOOKUP } from '../../../../lib/potentialLeadLtStatus.js';

export default function LtStatusBadge({ value }) {
  const opt = LT_STATUS_LOOKUP[value];
  if (!opt) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-300">
        {value || '—'}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${opt.cls}`}
      title={opt.description}
    >
      {opt.label}
    </span>
  );
}
