import { getLastDaysUTC, getDayBoundsUTC } from '../../../../utils/dateHelpers.js';
import { HIDDEN_LT_STATUSES } from '../../potential-leads/potentialLeadsListHelpers.jsx';
import { LT_STATUS } from '../../../../../lib/potentialLeadLtStatus.js';

// Triage / worklist segments shown in the insights section above the table.
// "Booked" maps to the LT4/LT5 stages the table hides by default.
export const SEGMENTS = [
  { key: 'today', label: 'New today', hint: 'hottest', tone: 'danger' },
  { key: 'd1_2', label: '1–2 days', hint: 'still hot', tone: 'warning' },
  { key: 'd3_6', label: '3–6 days', hint: 'cooling', tone: 'neutral' },
  { key: 'd7p', label: '7+ days', hint: 'decide to drop', tone: 'muted' },
  { key: 'contacted', label: 'Contacted', hint: 'follow up', tone: 'info' },
  { key: 'booked', label: 'Booked', hint: 'won', tone: 'success' },
];

export const TRIAGE_KEYS = ['today', 'd1_2', 'd3_6', 'd7p'];

const TODAY_KEY = getLastDaysUTC(1)[0];
const TODAY_START = getDayBoundsUTC(new Date()).dayStart.getTime();

export function dayKey(iso) {
  if (!iso) return null;
  try {
    return getDayBoundsUTC(iso).dayStart.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function isToday(iso) {
  return dayKey(iso) === TODAY_KEY;
}

export function ageInDays(iso) {
  if (!iso) return Infinity;
  try {
    const start = getDayBoundsUTC(iso).dayStart.getTime();
    return Math.max(0, Math.round((TODAY_START - start) / 86400000));
  } catch {
    return Infinity;
  }
}

/** Which triage/worklist segment a row belongs to. */
export function segmentForRow(row, ltStatus) {
  if (HIDDEN_LT_STATUSES.has(ltStatus)) return 'booked'; // LT4 / LT5
  if (row?.last_contact_attempt_at) return 'contacted';
  const age = ageInDays(row?.created_at);
  if (age <= 0) return 'today';
  if (age <= 2) return 'd1_2';
  if (age <= 6) return 'd3_6';
  return 'd7p';
}

/**
 * The five distribution series shown on the trend chart — same categories as
 * the status pills (LT1 / LT2 / LT3 / Other / Unassigned). Colors are hex so
 * they can drive both the Recharts lines and the toggle dots.
 */
export const LT_TREND_KEYS = [
  { key: 'lt1', label: 'LT1', color: '#64748b' },
  { key: 'lt2', label: 'LT2', color: '#0ea5e9' },
  { key: 'lt3', label: 'LT3', color: '#6366f1' },
  { key: 'other', label: 'Other', color: '#a3a3a3' },
  { key: 'unassigned', label: 'Unassigned', color: '#ef4444' },
];

/** All UTC day keys (YYYY-MM-DD) from start..end inclusive, capped at 400. */
export function enumerateDaysUTC(start, end) {
  const days = [];
  if (!start || !end) return days;
  let cur = getDayBoundsUTC(start).dayStart.getTime();
  const last = getDayBoundsUTC(end).dayStart.getTime();
  let guard = 0;
  while (cur <= last && guard < 400) {
    days.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
    guard += 1;
  }
  return days;
}

/**
 * Per-day distribution by pipeline stage across a date range, for the trend
 * chart. Booked rows (LT4/LT5) are excluded; "unassigned" is orthogonal to
 * stage (counts rows with no setter), so series are not mutually exclusive.
 */
export function buildLtTrend(rows, ltForRow, start, end, isUnassigned) {
  const unassignedFn = isUnassigned || ((r) => !r.assigned_setter_id);
  const days = start && end ? enumerateDaysUTC(start, end) : getLastDaysUTC(14);
  const byDay = Object.fromEntries(
    days.map((d) => [d, { date: d, lt1: 0, lt2: 0, lt3: 0, other: 0, unassigned: 0 }]),
  );
  (rows || []).forEach((r) => {
    const k = dayKey(r.created_at);
    if (k == null || !byDay[k]) return;
    const lt = ltForRow(r);
    if (HIDDEN_LT_STATUSES.has(lt)) return; // skip booked (LT4/LT5)
    if (lt === LT_STATUS.LT1) byDay[k].lt1 += 1;
    else if (lt === LT_STATUS.LT2) byDay[k].lt2 += 1;
    else if (lt === LT_STATUS.LT3) byDay[k].lt3 += 1;
    else byDay[k].other += 1;
    if (unassignedFn(r)) byDay[k].unassigned += 1;
  });
  const series = days.map((d) => ({
    ...byDay[d],
    label: new Date(`${d}T00:00:00.000Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
  }));
  return { series };
}

/**
 * Headline KPIs for a (date- and setter-scoped) row set. Contact rate is the
 * share of the scoped rows that have a logged contact attempt, so it tracks
 * whatever date range is currently selected.
 */
export function buildInsights(rows, ltForRow) {
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s.key, 0]));
  let receivedToday = 0;
  let contactedToday = 0;

  (rows || []).forEach((r) => {
    const seg = segmentForRow(r, ltForRow(r));
    counts[seg] = (counts[seg] || 0) + 1;

    if (isToday(r.created_at)) receivedToday += 1;
    if (isToday(r.last_contact_attempt_at)) contactedToday += 1;
  });

  const total = rows?.length ?? 0;
  const uncontacted = TRIAGE_KEYS.reduce((sum, k) => sum + (counts[k] || 0), 0);
  // Contact rate counts contacted (non-booked) leads only — booked calls are excluded.
  const contactRate = total > 0 ? Math.round(((counts.contacted || 0) / total) * 100) : 0;

  return { counts, uncontacted, receivedToday, contactedToday, contactRate };
}
