/**
 * Setter “commission” matches setterStats (FortnightDashboard):
 * (showUps × $4) + (purchases × $25), attributed by calendar month in DEFAULT_TIMEZONE.
 */
import { supabase } from './supabaseClient';
import * as DateHelpers from '../utils/dateHelpers';

const PAGE_SIZE = 1000;

export const SETTER_SHOW_UP_USD = 4;
export const SETTER_PURCHASE_USD = 25;

export function setterCommissionTotal(showUps, purchases) {
  return showUps * SETTER_SHOW_UP_USD + purchases * SETTER_PURCHASE_USD;
}

async function fetchAllPaginated(buildQuery) {
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

function monthRangeForKey(monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const monthDate = new Date(Date.UTC(parseInt(year, 10), parseInt(monthNum, 10) - 1, 15));
  return DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
}

/**
 * @param {string} monthKey YYYY-MM
 * @returns {Promise<Array<{ id: string, name: string, showUps: number, purchases: number, total: number }>>}
 */
export async function getAllSettersMonthlyCommission(monthKey) {
  const monthRange = monthRangeForKey(monthKey);
  if (!monthRange) return [];

  const startDateISO = monthRange.startDate.toISOString();
  const endDateISO = monthRange.endDate.toISOString();

  const { data: setters, error: settersError } = await supabase
    .from('setters')
    .select('id, name')
    .eq('active', true)
    .order('name');

  if (settersError) {
    console.error('Error fetching setters:', settersError);
    return [];
  }

  const byId = {};
  for (const s of setters || []) {
    byId[s.id] = { id: s.id, name: s.name, showUps: 0, purchases: 0 };
  }

  let calls = [];
  try {
    calls = await fetchAllPaginated(() =>
      supabase
        .from('calls')
        .select('setter_id, showed_up, call_date')
        .eq('showed_up', true)
        .not('setter_id', 'is', null)
        .not('call_date', 'is', null)
        .gte('call_date', startDateISO)
        .lte('call_date', endDateISO)
    );
  } catch (e) {
    console.error('Error fetching calls for setter commission:', e);
  }

  for (const c of calls) {
    if (!c.setter_id || !byId[c.setter_id]) continue;
    byId[c.setter_id].showUps++;
  }

  let outcomes = [];
  try {
    outcomes = await fetchAllPaginated(() =>
      supabase
        .from('outcome_log')
        .select(
          `
          purchase_date,
          calls!inner!call_id (
            setter_id
          )
        `
        )
        .eq('outcome', 'yes')
        .not('purchase_date', 'is', null)
        .gte('purchase_date', startDateISO)
        .lte('purchase_date', endDateISO)
    );
  } catch (e) {
    console.error('Error fetching outcome_log for setter commission:', e);
  }

  for (const row of outcomes) {
    const sid = row.calls?.setter_id;
    if (!sid || !byId[sid]) continue;
    byId[sid].purchases++;
  }

  return Object.values(byId)
    .map((r) => ({
      ...r,
      total: setterCommissionTotal(r.showUps, r.purchases),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
