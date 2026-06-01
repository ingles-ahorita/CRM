/**
 * iClosed lead statuses — single source of truth.
 * @see https://docs.iclosed.io/en/articles/9825606-lead-statuses-explained
 */

export const ICLOSED_STATUS = {
  POTENTIAL: 'potential',
  QUALIFIED: 'qualified',
  DISQUALIFIED: 'disqualified',
  STRATEGY_CALL: 'strategy_call',
  DISCOVERY_CALL: 'discovery_call',
};

/** Potential Leads tab — Potential + Qualified only (booked handled via Zapier). */
export const ICLOSED_POTENTIAL_LEADS_TAB_UI = [
  {
    value: ICLOSED_STATUS.POTENTIAL,
    label: 'Potential',
    cls: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  {
    value: ICLOSED_STATUS.QUALIFIED,
    label: 'Qualified',
    cls: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
];

export const ICLOSED_POTENTIAL_LEADS_TAB_STATUSES = new Set(
  ICLOSED_POTENTIAL_LEADS_TAB_UI.map((s) => s.value),
);

export const ICLOSED_POTENTIAL_LEADS_TAB_LOOKUP = Object.fromEntries(
  ICLOSED_POTENTIAL_LEADS_TAB_UI.map((s) => [s.value, s]),
);

export function isPotentialLeadsTabStatus(status) {
  return status != null && ICLOSED_POTENTIAL_LEADS_TAB_STATUSES.has(status);
}

/** All iClosed statuses (reference / webhook normalization). */
export const ICLOSED_STATUS_UI = [
  {
    value: ICLOSED_STATUS.POTENTIAL,
    label: 'Potential',
    cls: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  {
    value: ICLOSED_STATUS.QUALIFIED,
    label: 'Qualified',
    cls: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
  {
    value: ICLOSED_STATUS.DISQUALIFIED,
    label: 'Disqualified',
    cls: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  {
    value: ICLOSED_STATUS.STRATEGY_CALL,
    label: 'Strategy call',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  {
    value: ICLOSED_STATUS.DISCOVERY_CALL,
    label: 'Discovery call',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
];

export const ICLOSED_STATUS_LOOKUP = Object.fromEntries(
  ICLOSED_STATUS_UI.map((s) => [s.value, s]),
);

/** Default rows ingested via webhook into potential_leads. */
export const ICLOSED_INGEST_STATUSES = new Set([
  ICLOSED_STATUS.POTENTIAL,
  ICLOSED_STATUS.QUALIFIED,
]);

export const ICLOSED_BOOKED_STATUSES = new Set([
  ICLOSED_STATUS.STRATEGY_CALL,
  ICLOSED_STATUS.DISCOVERY_CALL,
]);

/** Tab filter "Open" = not yet booked (iClosed Potential + Qualified). */
export const ICLOSED_OPEN_STATUSES = new Set([
  ICLOSED_STATUS.POTENTIAL,
  ICLOSED_STATUS.QUALIFIED,
]);

export function normalizeIclosedStatus(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

  if (
    s === 'potential' ||
    s === 'potential_1' ||
    s === 'potential_2' ||
    s === 'potentials'
  ) {
    return ICLOSED_STATUS.POTENTIAL;
  }
  if (
    s === 'qualified' ||
    s === 'lead_qualified' ||
    s === 'qualified_lead'
  ) {
    return ICLOSED_STATUS.QUALIFIED;
  }
  if (s === 'disqualified') return ICLOSED_STATUS.DISQUALIFIED;

  if (
    s === 'strategy_call' ||
    s === 'strategy_call_booked' ||
    s === 'strategy' ||
    (s.includes('strategy') && s.includes('book'))
  ) {
    return ICLOSED_STATUS.STRATEGY_CALL;
  }
  if (
    s === 'discovery_call' ||
    s === 'discovery_call_booked' ||
    s === 'discovery' ||
    (s.includes('discovery') && s.includes('book'))
  ) {
    return ICLOSED_STATUS.DISCOVERY_CALL;
  }

  if (s === 'booked' || s === 'call_booked') {
    return ICLOSED_STATUS.STRATEGY_CALL;
  }

  return null;
}

export function iclosedStatusLabel(value) {
  return ICLOSED_STATUS_LOOKUP[value]?.label ?? value ?? '—';
}

/** Read status from a potential_leads row (prefers iclosed_status). */
export function rowIclosedStatus(row) {
  return normalizeIclosedStatus(row?.iclosed_status || row?.status) || null;
}
