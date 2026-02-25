/**
 * GET /api/management-series?days=7
 *
 * Returns last 7 days (ending yesterday) with:
 *   - showUpRate, totalShowedUp, totalConfirmed (calls)
 *   - bookings, calls (counts)
 *
 * HOW IT'S CALCULATED (aligned with generalStats):
 *
 * 1) Date range
 *    - Each day is UTC: from = YYYY-MM-DDT00:00:00.000Z, to = YYYY-MM-DDT23:59:59.999Z.
 *    - "Last N days" = N days ending on TODAY (UTC), inclusive.
 *
 * 2) Calls (for show up rate and "calls" count)
 *    - Fetched from `calls` with call_date in [from, to] for that day.
 *    - Same reschedule dedupe as generalStats: build set of lead_ids that have is_reschedule,
 *      then keep only: (a) calls that are reschedules, or (b) calls whose lead_id is not in that set.
 *    - totalConfirmed = count of filtered calls with confirmed === true (or 'true').
 *    - totalShowedUp  = count of filtered calls with showed_up === true (or 'true').
 *    - showUpRate     = totalConfirmed > 0 ? (totalShowedUp / totalConfirmed) * 100 : null.
 *
 * 3) Purchases (for conversion rate, same as generalStats fetchPurchasesForDateRange)
 *    - From outcome_log: inner join calls via call_id (same as closerStats/utmAnalytics), purchase_date in [from, to], outcome in ('yes','refund').
 *    - Dedupe by call id (keep latest outcome_log per call), then count only outcome === 'yes' OR (outcome === 'refund' && clawback < 100%).
 *    - totalPurchased = that count.
 *
 * 4) Bookings
 *    - Count of rows in `calls` with book_date in [from, to] for that day (no filter).
 */
import { createClient } from '@supabase/supabase-js';

function getUTCDayBounds(dateStr) {
  const from = `${dateStr}T00:00:00.000Z`;
  const to = `${dateStr}T23:59:59.999Z`;
  return { from, to };
}

/** Last N days in UTC, YYYY-MM-DD, oldest first. Ends at TODAY (includes today). */
function getLastDaysUTC(n) {
  const out = [];
  const d = new Date();
  const today = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(today);
    x.setUTCDate(x.getUTCDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

/** Same as generalStats: treat truthy/string 'true' as true. */
function isTrue(v) {
  return v === true || v === 'true';
}

/** Bookings split: organic / ads / rescheduled (same as generalStats). */
function splitBookings(bookingsList) {
  let organic = 0, ads = 0, rescheduled = 0;
  (bookingsList || []).forEach((b) => {
    if (isTrue(b.is_reschedule)) {
      rescheduled++;
    } else {
      const source = (b.source_type || 'organic').toLowerCase();
      if (source.includes('ad')) ads++;
      else organic++;
    }
  });
  return { organic, ads, rescheduled, total: organic + ads + rescheduled };
}

/**
 * Show up rate for calls: (showed_up / confirmed) * 100.
 * Uses same filter as generalStats: keep reschedule calls OR calls whose lead_id is not in
 * the set of leads that have a reschedule (dedupe so we count one call per lead when mixed).
 */
function computeShowUpRate(calls) {
  const rescheduledLeadIds = new Set(
    (calls || []).filter((c) => isTrue(c.is_reschedule)).map((c) => c.lead_id)
  );
  const filtered = (calls || []).filter(
    (call) => isTrue(call.is_reschedule) || !rescheduledLeadIds.has(call.lead_id)
  );
  const totalConfirmed = filtered.filter((c) => isTrue(c.confirmed)).length;
  const totalShowedUp = filtered.filter((c) => isTrue(c.showed_up)).length;
  if (totalConfirmed === 0) return { showUpRate: null, totalShowedUp: 0, totalConfirmed: 0 };
  return {
    showUpRate: (totalShowedUp / totalConfirmed) * 100,
    totalShowedUp,
    totalConfirmed,
  };
}

/** Same source split as generalStats: organic vs ads (by source_type). */
function splitCallsBySource(calls) {
  const organic = (calls || []).filter((c) => {
    const s = (c.source_type || 'organic').toLowerCase();
    return !s.includes('ad');
  });
  const ads = (calls || []).filter((c) => {
    const s = (c.source_type || 'organic').toLowerCase();
    return s.includes('ad');
  });
  return { organic, ads };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const days = Math.min(Math.max(1, parseInt(req.query?.days, 10) || 7), 90);
  const dateStrings = getLastDaysUTC(days);
  const rangeFrom = `${dateStrings[0]}T00:00:00.000Z`;
  const rangeTo = `${dateStrings[dateStrings.length - 1]}T23:59:59.999Z`;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[management-series] Missing Supabase env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
    return res.status(200).json({
      series: dateStrings.map((d) => ({
        date: d,
        showUpRate: null,
        showUpRateOrganic: null,
        showUpRateAds: null,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        bookings: 0,
        bookingsOrganic: 0,
        bookingsAds: 0,
        bookingsRescheduled: 0,
        calls: 0,
      })),
      error: 'Missing Supabase config',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Batch fetch: one query per data type for the full range, then group by day in memory
  let callsInRange = [];
  let outcomeLogsInRange = [];
  let bookingsInRange = [];

  try {
    const [callsRes, outcomeRes, bookingsRes] = await Promise.all([
      supabase
        .from('calls')
        .select('call_date, showed_up, confirmed, lead_id, is_reschedule, source_type')
        .gte('call_date', rangeFrom)
        .lte('call_date', rangeTo),
      supabase
        .from('outcome_log')
        .select('id, outcome, clawback, purchase_date, calls!inner!call_id(id)')
        .in('outcome', ['yes', 'refund'])
        .gte('purchase_date', rangeFrom)
        .lte('purchase_date', rangeTo),
      supabase
        .from('calls')
        .select('book_date, source_type, is_reschedule')
        .gte('book_date', rangeFrom)
        .lte('book_date', rangeTo),
    ]);

    if (callsRes.error) console.warn('[management-series] calls error', callsRes.error.message);
    else callsInRange = callsRes.data || [];
    if (outcomeRes.error) console.warn('[management-series] purchases error', outcomeRes.error.message);
    else outcomeLogsInRange = outcomeRes.data || [];
    if (bookingsRes.error) console.warn('[management-series] bookings error', bookingsRes.error.message);
    else bookingsInRange = bookingsRes.data || [];
  } catch (e) {
    console.warn('[management-series] batch fetch exception', e?.message);
  }

  // Group calls by UTC date (YYYY-MM-DD)
  const callsByDay = {};
  callsInRange.forEach((c) => {
    const d = c.call_date ? String(c.call_date).slice(0, 10) : null;
    if (!d) return;
    if (!callsByDay[d]) callsByDay[d] = [];
    callsByDay[d].push(c);
  });

  // Group outcome_log by UTC date; per day dedupe by call_id and count with clawback rule
  const purchasesByDay = {};
  outcomeLogsInRange.forEach((row) => {
    const d = row.purchase_date ? String(row.purchase_date).slice(0, 10) : null;
    if (!d) return;
    if (!purchasesByDay[d]) purchasesByDay[d] = [];
    purchasesByDay[d].push(row);
  });
  const totalPurchasedByDay = {};
  Object.keys(purchasesByDay).forEach((d) => {
    const list = purchasesByDay[d];
    const byCallId = new Map();
    list.forEach((row) => {
      const callId = row.calls?.id;
      if (callId == null) return;
      const existing = byCallId.get(callId);
      if (!existing || row.id > existing.id) byCallId.set(callId, row);
    });
    totalPurchasedByDay[d] = Array.from(byCallId.values()).filter((row) => {
      if (row.outcome === 'yes') return true;
      if (row.outcome === 'refund') return (row.clawback ?? 100) < 100;
      return false;
    }).length;
  });

  // Group bookings by UTC date
  const bookingsByDay = {};
  bookingsInRange.forEach((b) => {
    const d = b.book_date ? String(b.book_date).slice(0, 10) : null;
    if (!d) return;
    if (!bookingsByDay[d]) bookingsByDay[d] = [];
    bookingsByDay[d].push(b);
  });

  const series = dateStrings.map((dateStr) => {
    const list = callsByDay[dateStr] || [];
    const rateData = computeShowUpRate(list);
    const { organic: organicCalls, ads: adsCalls } = splitCallsBySource(list);
    const organicRate = computeShowUpRate(organicCalls);
    const adsRate = computeShowUpRate(adsCalls);
    const split = splitBookings(bookingsByDay[dateStr] || []);
    return {
      date: dateStr,
      showUpRate: rateData.showUpRate,
      showUpRateOrganic: organicRate.showUpRate,
      showUpRateAds: adsRate.showUpRate,
      totalShowedUp: rateData.totalShowedUp,
      totalConfirmed: rateData.totalConfirmed,
      totalPurchased: totalPurchasedByDay[dateStr] ?? 0,
      bookings: split.total,
      bookingsOrganic: split.organic,
      bookingsAds: split.ads,
      bookingsRescheduled: split.rescheduled,
      calls: list.length,
    };
  });

  return res.status(200).json({ series });
}
