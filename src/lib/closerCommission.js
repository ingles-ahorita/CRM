/**
 * Shared closer commission calculation - used by Closer Dashboard and Closer Stats.
 * Ensures both display identical commission values for a given month.
 */
import { supabase } from './supabaseClient';
import * as DateHelpers from '../utils/dateHelpers';

/**
 * Get total commission for a closer for a given month (YYYY-MM).
 * Matches the calculation in Closer Stats exactly.
 * @returns {Promise<number>} Total commission
 */
export async function getCloserCommissionForMonth(closerId, monthKey) {
  const result = await getCloserCommissionBreakdown(closerId, monthKey);
  return result.total;
}

/**
 * Get commission breakdown for a closer for a given month (YYYY-MM).
 * @returns {Promise<{ total: number, base: number, secondInstallments: number, refunds: number, sameMonthRefunds: number }>}
 */
export async function getCloserCommissionBreakdown(closerId, monthKey) {
  if (!closerId || !monthKey) {
    return { total: 0, base: 0, secondInstallments: 0, refunds: 0, sameMonthRefunds: 0 };
  }

  const [base, secondInstallments, refunds, sameMonthRefunds] = await Promise.all([
    fetchBaseCommission(closerId, monthKey),
    fetchSecondInstallmentsCommission(closerId, monthKey),
    fetchRefundsCommission(closerId, monthKey),
    fetchSameMonthRefundsCommission(closerId, monthKey),
  ]);

  const total = base + secondInstallments + refunds + sameMonthRefunds;
  return { total, base, secondInstallments, refunds, sameMonthRefunds };
}

async function fetchBaseCommission(closerId, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const monthDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 15));
  const monthRange = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
  if (!monthRange) return 0;

  const startDateISO = monthRange.startDate.toISOString();
  const endDateISO = monthRange.endDate.toISOString();

  const { data, error } = await supabase
    .from('outcome_log')
    .select('commission, calls!inner!call_id(closer_id)')
    .eq('outcome', 'yes')
    .gte('purchase_date', startDateISO)
    .lte('purchase_date', endDateISO);

  if (error) {
    console.error('Error fetching base commission:', error);
    return 0;
  }

  const filtered = (data || []).filter((x) => x.calls?.closer_id === closerId);
  return filtered.reduce((sum, x) => sum + (Number(x.commission) || 0), 0);
}

async function fetchSecondInstallmentsCommission(closerId, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const prevMonthDate = new Date(parseInt(year), parseInt(monthNum) - 2, 1);
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
  const startDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999));
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
  const monthDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 15));
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
