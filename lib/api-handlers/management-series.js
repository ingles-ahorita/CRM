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
 *    - "Last 7 days" = 7 days ending on YESTERDAY (UTC).
 *
 * 2) Calls (for show up rate and "calls" count)
 *    - Fetched from `calls` with call_date in [from, to] for that day.
 *    - Same reschedule dedupe as generalStats: build set of lead_ids that have is_reschedule,
 *      then keep only: (a) calls that are reschedules, or (b) calls whose lead_id is not in that set.
 *    - totalConfirmed = count of filtered calls with confirmed === true (or 'true').
 *    - totalShowedUp  = count of filtered calls with showed_up === true (or 'true').
 *    - showUpRate     = totalConfirmed > 0 ? (totalShowedUp / totalConfirmed) * 100 : null.
 *
 * 3) Bookings
 *    - Count of rows in `calls` with book_date in [from, to] for that day (no filter).
 */
import { createClient } from '@supabase/supabase-js';

function getUTCDayBounds(dateStr) {
  const from = `${dateStr}T00:00:00.000Z`;
  const to = `${dateStr}T23:59:59.999Z`;
  return { from, to };
}

/** Last N days in UTC, YYYY-MM-DD, oldest first. Ends at YESTERDAY (so "yesterday" is last point). */
function getLastDaysUTC(n) {
  const out = [];
  const d = new Date();
  const yesterday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, 0, 0, 0, 0));
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(yesterday);
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

  const days = Math.min(Math.max(1, parseInt(req.query?.days, 10) || 7), 31);
  const dateStrings = getLastDaysUTC(days);

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
  const series = [];

  for (const dateStr of dateStrings) {
    const { from, to } = getUTCDayBounds(dateStr);
    let showUpRate = null;
    let showUpRateOrganic = null;
    let showUpRateAds = null;
    let totalShowedUp = 0;
    let totalConfirmed = 0;
    let bookings = 0;
    let bookingsOrganic = 0;
    let bookingsAds = 0;
    let bookingsRescheduled = 0;
    let calls = 0;

    try {
      const { data: callsInDay, error: callsError } = await supabase
        .from('calls')
        .select('showed_up, confirmed, lead_id, is_reschedule, source_type')
        .gte('call_date', from)
        .lte('call_date', to);
      if (callsError) {
        console.warn('[management-series] calls error', dateStr, callsError.message);
      }
      const list = callsInDay || [];
      calls = list.length;
      const rateData = computeShowUpRate(list);
      showUpRate = rateData.showUpRate;
      totalShowedUp = rateData.totalShowedUp;
      totalConfirmed = rateData.totalConfirmed;
      const { organic: organicCalls, ads: adsCalls } = splitCallsBySource(list);
      const organicRate = computeShowUpRate(organicCalls);
      const adsRate = computeShowUpRate(adsCalls);
      showUpRateOrganic = organicRate.showUpRate;
      showUpRateAds = adsRate.showUpRate;
    } catch (e) {
      console.warn('[management-series] exception', dateStr, e.message);
    }

    try {
      const { data: bookingsData, error: bookError } = await supabase
        .from('calls')
        .select('source_type, is_reschedule')
        .gte('book_date', from)
        .lte('book_date', to);
      if (bookError) console.warn('[management-series] bookings error', dateStr, bookError.message);
      const split = splitBookings(bookingsData || []);
      bookings = split.total;
      bookingsOrganic = split.organic;
      bookingsAds = split.ads;
      bookingsRescheduled = split.rescheduled;
    } catch (_) {}

    series.push({
      date: dateStr,
      showUpRate,
      showUpRateOrganic,
      showUpRateAds,
      totalShowedUp,
      totalConfirmed,
      bookings,
      bookingsOrganic,
      bookingsAds,
      bookingsRescheduled,
      calls,
    });
  }

  return res.status(200).json({ series });
}
