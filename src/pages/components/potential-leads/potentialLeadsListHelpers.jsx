import React from 'react';
import { LT_STATUS, LT_STATUS_LIST, LT_STATUS_UI } from '../../../../lib/potentialLeadLtStatus.js';

export const HIDDEN_LT_STATUSES = new Set([LT_STATUS.LT4, LT_STATUS.LT5]);
export const VISIBLE_LT_STATUS_UI = LT_STATUS_UI.filter((s) => !HIDDEN_LT_STATUSES.has(s.value));

export const POTENTIAL_LEADS_PAGE_SIZE = 20;

export function buildPotentialLeadStats(items, ltForRow, { countUnassigned = true } = {}) {
  const by = Object.fromEntries(LT_STATUS_LIST.map((k) => [k, 0]));
  let unassigned = 0;
  let noStage = 0;

  (items || []).forEach((r) => {
    const lt = ltForRow(r);
    if (lt && by[lt] != null) by[lt] += 1;
    else noStage += 1;
    if (countUnassigned && !r.assigned_setter_id) unassigned += 1;
  });

  return {
    by,
    unassigned,
    noStage,
    total: items?.length ?? 0,
  };
}

export function paginateItems(items, page, pageSize = POTENTIAL_LEADS_PAGE_SIZE) {
  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    total,
    items: (items || []).slice(start, start + pageSize),
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, total),
  };
}

export function PotentialLeadsPagination({ pagination, onPageChange }) {
  const { page, totalPages, total, rangeStart, rangeEnd } = pagination;
  if (total === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
      <span>
        Showing {rangeStart}–{rangeEnd} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="potential-leads-btn rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
        >
          Previous
        </button>
        <span className="tabular-nums text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="potential-leads-btn rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}