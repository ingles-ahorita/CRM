/**
 * Shared closer commission calculation - used by Closer Dashboard and Closer Stats.
 * Ensures both display identical commission values for a given month.
 *
 * Sale month (purchase_date): counts adjusted **base** commission only.
 * Payoff month (payoff_date): counts **payoff_commission − adjusted base** when a Kajabi payoff is linked.
 * If payoff_date is missing, the increment is attributed to the sale month (legacy).
 */
import { supabase } from './supabaseClient';
import * as DateHelpers from '../utils/dateHelpers';

/**
 * Same formula as Modal when PIF is off: base minus discount %.
 * @param {object|null} offer - { base_commission, payoff_commission? }
 * @param {string|number|null} discount
 * @returns {number|null}
 */
export function adjustedBaseCommissionFromOffer(offer, discount) {
  if (!offer || offer.base_commission == null) return null;
  const numBase = Number(offer.base_commission);
  if (!Number.isFinite(numBase)) return null;
  if (discount == null || discount === '') return numBase;
  const d = parseFloat(String(discount).replace(/%/g, '').trim());
  if (!Number.isFinite(d)) return numBase;
  return numBase - (numBase * d) / 100;
}

/**
 * Extra commission when payoff completes: payoff_commission − adjusted base.
 * @param {object|null} offer
 * @param {string|number|null} discount
 * @returns {number|null}
 */
export function payoffIncrementFromOffer(offer, discount) {
  if (!offer || offer.payoff_commission == null) return null;
  const adj = adjustedBaseCommissionFromOffer(offer, discount);
  if (adj == null) return null;
  const payoff = Number(offer.payoff_commission);
  if (!Number.isFinite(payoff)) return null;
  return payoff - adj;
}

/**
 * Get total commission for a closer for a given month (YYYY-MM).
 * @returns {Promise<number>} Total commission
 */
export async function getCloserCommissionForMonth(closerId, monthKey) {
  const result = await getCloserCommissionBreakdown(closerId, monthKey);
  return result.total;
}

/**
 * Get commission breakdown for a closer for a given month (YYYY-MM).
 * @returns {Promise<{ total: number, base: number, payoffIncrements: number, secondInstallments: number, refunds: number, sameMonthRefunds: number }>}
 */
export async function getCloserCommissionBreakdown(closerId, monthKey) {
  if (!closerId || !monthKey) {
    return {
      total: 0,
      base: 0,
      payoffIncrements: 0,
      secondInstallments: 0,
      refunds: 0,
      sameMonthRefunds: 0,
    };
  }

  const [base, payoffIncrements, secondInstallments, refunds, sameMonthRefunds] = await Promise.all([
    fetchBaseCommission(closerId, monthKey),
    fetchPayoffIncrementCommission(closerId, monthKey),
    fetchSecondInstallmentsCommission(closerId, monthKey),
    fetchRefundsCommission(closerId, monthKey),
    fetchSameMonthRefundsCommission(closerId, monthKey),
  ]);

  const total = base + payoffIncrements + secondInstallments + refunds + sameMonthRefunds;
  return { total, base, payoffIncrements, secondInstallments, refunds, sameMonthRefunds };
}

/** Sum adjusted base in sale month; if payoff linked but no payoff_date, add increment here too. */
async function fetchBaseCommission(closerId, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const monthDate = new Date(Date.UTC(parseInt(year, 10), parseInt(monthNum, 10) - 1, 15));
  const monthRange = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
  if (!monthRange) return 0;

  const startDateISO = monthRange.startDate.toISOString();
  const endDateISO = monthRange.endDate.toISOString();

  const { data, error } = await supabase
    .from('outcome_log')
    .select(`
      commission,
      discount,
      kajabi_payoff_id,
      payoff_date,
      offers!offer_id (
        base_commission,
        payoff_commission
      ),
      calls!inner!call_id(closer_id)
    `)
    .eq('outcome', 'yes')
    .gte('purchase_date', startDateISO)
    .lte('purchase_date', endDateISO);

  if (error) {
    console.error('Error fetching base commission:', error);
    return 0;
  }

  const filtered = (data || []).filter((x) => x.calls?.closer_id === closerId);
  let sum = 0;
  for (const row of filtered) {
    const offer = row.offers;
    if (row.kajabi_payoff_id && offer) {
      const base = adjustedBaseCommissionFromOffer(offer, row.discount);
      const inc = payoffIncrementFromOffer(offer, row.discount);
      if (base != null) sum += base;
      if (inc != null && !row.payoff_date) sum += inc;
    } else {
      sum += Number(row.commission) || 0;
    }
  }
  return sum;
}

/** Sum payoff − base in the month of payoff_date (Kajabi payoff linked). */
async function fetchPayoffIncrementCommission(closerId, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const monthDate = new Date(Date.UTC(parseInt(year, 10), parseInt(monthNum, 10) - 1, 15));
  const monthRange = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
  if (!monthRange) return 0;

  const startDateISO = monthRange.startDate.toISOString();
  const endDateISO = monthRange.endDate.toISOString();

  const { data, error } = await supabase
    .from('outcome_log')
    .select(`
      discount,
      payoff_date,
      offers!offer_id (
        base_commission,
        payoff_commission
      ),
      calls!inner!call_id(closer_id)
    `)
    .eq('outcome', 'yes')
    .not('kajabi_payoff_id', 'is', null)
    .not('payoff_date', 'is', null)
    .gte('payoff_date', startDateISO)
    .lte('payoff_date', endDateISO);

  if (error) {
    console.error('Error fetching payoff increment commission:', error);
    return 0;
  }

  const filtered = (data || []).filter((x) => x.calls?.closer_id === closerId);
  let sum = 0;
  for (const row of filtered) {
    const offer = row.offers;
    const inc = payoffIncrementFromOffer(offer, row.discount);
    if (inc != null) sum += inc;
  }
  return sum;
}

async function fetchSecondInstallmentsCommission(closerId, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const prevMonthDate = new Date(parseInt(year, 10), parseInt(monthNum, 10) - 2, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth() + 1;

  const startDate = new Date(Date.UTC(prevYear, prevMonth - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(prevYear, prevMonth, 0, 23, 59, 59, 999));
  const startDateISO = startDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
  const endDateISO = endDate.toISOString().split('T')[0] + 'T23:59:59.999Z';

  const { data, error } = await supabase
    .from('outcome_log')
    .select('commission, calls!inner!call_id(closer_id)')
    .eq('outcome', 'yes')
    .eq('paid_second_installment', true)
    .gte('purchase_date', startDateISO)
    .lte('purchase_date', endDateISO);

  if (error) {
    console.error('Error fetching second installments commission:', error);
    return 0;
  }

  const filtered = (data || []).filter((x) => x.calls?.closer_id === closerId);
  return filtered.reduce((sum, x) => sum + (Number(x.commission) || 0), 0);
}

async function fetchRefundsCommission(closerId, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const startDate = new Date(Date.UTC(parseInt(year, 10), parseInt(monthNum, 10) - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parseInt(year, 10), parseInt(monthNum, 10), 0, 23, 59, 59, 999));
  const startDateISO = startDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
  const endDateISO = endDate.toISOString().split('T')[0] + 'T23:59:59.999Z';

  const { data, error } = await supabase
    .from('outcome_log')
    .select('commission, purchase_date, refund_date, calls!inner!call_id(closer_id)')
    .eq('outcome', 'refund')
    .not('refund_date', 'is', null)
    .gte('refund_date', startDateISO)
    .lte('refund_date', endDateISO);

  if (error) {
    console.error('Error fetching refunds commission:', error);
    return 0;
  }

  const filtered = (data || []).filter((x) => x.calls?.closer_id === closerId);
  const excludingSameMonth = filtered.filter(
    (x) =>
      !x.purchase_date ||
      !x.refund_date ||
      !DateHelpers.isSameMonthInTimezone(x.purchase_date, x.refund_date, DateHelpers.DEFAULT_TIMEZONE)
  );
  return excludingSameMonth.reduce((sum, x) => sum + (Number(x.commission) || 0), 0);
}

async function fetchSameMonthRefundsCommission(closerId, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const monthDate = new Date(Date.UTC(parseInt(year, 10), parseInt(monthNum, 10) - 1, 15));
  const monthRange = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
  if (!monthRange) return 0;

  const startDateISO = monthRange.startDate.toISOString();
  const endDateISO = monthRange.endDate.toISOString();

  const { data, error } = await supabase
    .from('outcome_log')
    .select('commission, calls!inner!call_id(closer_id)')
    .eq('outcome', 'refund')
    .gte('purchase_date', startDateISO)
    .lte('purchase_date', endDateISO);

  if (error) {
    console.error('Error fetching same-month refunds commission:', error);
    return 0;
  }

  const filtered = (data || []).filter((x) => x.calls?.closer_id === closerId);
  return filtered.reduce((sum, x) => sum + (Number(x.commission) || 0), 0);
}
