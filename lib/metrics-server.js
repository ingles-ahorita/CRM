/**
 * Server-side metrics computation.
 * All DB queries use the service-role Supabase client.
 *
 * Pure math functions (adjustedBaseCommissionFromOffer, payoffIncrementFromOffer,
 * setterCommissionTotal) are copied verbatim from:
 *   src/lib/closerCommission.js
 *   src/lib/setterCommission.js
 * Direct import is not viable: those files import src/lib/supabaseClient.js which
 * requires process.env.SUPABASE_URL (not set) when running outside Vite.
 *
 * In-memory aggregation logic mirrors fetchStatsData() in src/pages/generalStats.jsx
 * line-for-line — same formulas, same variable names, same reschedule-dedup rules.
 */

import { createClient } from '@supabase/supabase-js';
import { getCountryFromPhone } from '../src/utils/phoneNumberParser.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// ── Pagination (same as fetchAllPages in generalStats.jsx) ────────────────────
const PAGE_SIZE = 1000;
async function fetchAllPages(buildQuery) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Date helpers (DEFAULT_TIMEZONE = 'UTC' per dateHelpers.js) ────────────────
function toUTCRange(from, to) {
  const startUTC = new Date(from);
  startUTC.setUTCHours(0, 0, 0, 0);
  const endUTC = new Date(to);
  endUTC.setUTCHours(23, 59, 59, 999);
  return { startUTC, endUTC };
}

function monthKeyToRange(monthKey) {
  const [year, monthNum] = monthKey.split('-').map(Number);
  return {
    startUTC: new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0)),
    endUTC:   new Date(Date.UTC(year, monthNum,     0, 23, 59, 59, 999)),
  };
}

// ── Pure math — verbatim from src/lib/closerCommission.js ─────────────────────
function adjustedBaseCommissionFromOffer(offer, discount) {
  if (!offer || offer.base_commission == null) return null;
  const numBase = Number(offer.base_commission);
  if (!Number.isFinite(numBase)) return null;
  if (discount == null || discount === '') return numBase;
  const d = parseFloat(String(discount).replace(/%/g, '').trim());
  if (!Number.isFinite(d)) return numBase;
  return numBase - (numBase * d) / 100;
}

function payoffIncrementFromOffer(offer, discount) {
  if (!offer || offer.payoff_commission == null) return null;
  const adj = adjustedBaseCommissionFromOffer(offer, discount);
  if (adj == null) return null;
  const payoff = Number(offer.payoff_commission);
  if (!Number.isFinite(payoff)) return null;
  return payoff - adj;
}

// ── Pure math — verbatim from src/lib/setterCommission.js ────────────────────
export const SETTER_SHOW_UP_USD = 4;
export const SETTER_PURCHASE_USD = 25;
function setterCommissionTotal(showUps, purchases) {
  return showUps * SETTER_SHOW_UP_USD + purchases * SETTER_PURCHASE_USD;
}

// ── Source helper (same logic as generalStats.jsx getAdsOrganicKey) ───────────
function getAdsOrganicKey(sourceType) {
  const s = (sourceType || 'organic').toLowerCase();
  return s.includes('ad') || s.includes('ads') ? 'ads' : 'organic';
}

// ── Purchase fetch (mirrors fetchPurchasesForDateRange in generalStats.jsx) ───
async function fetchPurchasesForDateRange(startUTC, endUTC) {
  let outcomeLogs;
  try {
    outcomeLogs = await fetchAllPages(() =>
      supabase
        .from('outcome_log')
        .select(`
          *,
          calls!closer_notes_call_id_fkey (
            *,
            closers (id, name),
            setters (id, name),
            leads (id, customer_id)
          ),
          offers!offer_id (
            id, name, installments, weekly_classes
          )
        `)
        .in('outcome', ['yes', 'refund'])
        .gte('purchase_date', startUTC.toISOString())
        .lte('purchase_date', endUTC.toISOString())
        .order('purchase_date', { ascending: false })
    );
  } catch (err) {
    console.error('[metrics-server] fetchPurchasesForDateRange error:', err);
    return [];
  }

  // Dedup by call_id — keep latest outcome_log id (same logic as generalStats.jsx)
  const latestByCallId = new Map();
  for (const ol of outcomeLogs || []) {
    if (!ol.calls?.id) continue;
    const callId = ol.calls.id;
    const existing = latestByCallId.get(callId);
    if (!existing || ol.id > existing.id) latestByCallId.set(callId, ol);
  }

  return Array.from(latestByCallId.values()).map((ol) => ({
    ...ol.calls,
    leads:                     ol.calls.leads,
    outcome_log_id:            ol.id,
    purchase_date:             ol.purchase_date,
    outcome:                   ol.outcome,
    clawback:                  ol.clawback,
    PIF:                       ol.PIF,
    paid_second_installment:   ol.paid_second_installment,
    commission:                ol.paid_second_installment ? ol.commission * 2 : ol.commission,
    offer_id:                  ol.offer_id,
    offer_name:                ol.offers?.name ?? null,
    offer_installments:        ol.offers?.installments,
    offer_weekly_classes:      ol.offers?.weekly_classes,
    discount:                  ol.discount,
    purchased_at:              ol.purchase_date,
    purchased:                 true,
  }));
}

// ── Main metrics computation (mirrors fetchStatsData in generalStats.jsx) ─────
export async function getStatsData(from, to) {
  const { startUTC, endUTC } = toUTCRange(from, to);

  // Fetch 1: calls by call_date range
  let bookedCalls;
  try {
    bookedCalls = await fetchAllPages(() =>
      supabase
        .from('calls')
        .select(`
          id, picked_up, showed_up, confirmed, purchased, purchased_at,
          is_reschedule, lead_id, phone, book_date, call_date, source_type, recovered,
          setters (id, name),
          closers (id, name),
          leads (phone, medium)
        `)
        .gte('call_date', startUTC.toISOString())
        .lte('call_date', endUTC.toISOString())
        .order('call_date', { ascending: true })
    );
  } catch (err) {
    throw new Error(`Failed to fetch booked calls: ${err.message}`);
  }

  // Fetch 2: purchased calls by purchase_date range
  const purchasedCalls = await fetchPurchasesForDateRange(startUTC, endUTC);

  // Fetch 3: bookings made in period (book_date range) — for pick-up / DQ / confirmation
  let bookingsData;
  try {
    bookingsData = await fetchAllPages(() =>
      supabase
        .from('calls')
        .select(`
          picked_up, confirmed, lead_id, book_date, source_type,
          is_reschedule, recovered, phone,
          setters (id, name),
          leads (phone, medium)
        `)
        .gte('book_date', startUTC.toISOString())
        .lte('book_date', endUTC.toISOString())
        .order('book_date', { ascending: true })
    );
  } catch (err) {
    throw new Error(`Failed to fetch bookings: ${err.message}`);
  }

  // ── Reschedule dedup for bookings (same as generalStats.jsx) ─────────────────
  const rescheduledLeadIdsFromBookings = new Set(
    (bookingsData || []).filter(b => b.is_reschedule === true || b.is_reschedule === 'true').map(b => b.lead_id)
  );
  const filteredBookings = (bookingsData || []).filter(b => {
    return b.is_reschedule === true || b.is_reschedule === 'true' || !rescheduledLeadIdsFromBookings.has(b.lead_id);
  });

  const bookingsMadeinPeriod = filteredBookings.length;
  const totalPickedUpFromBookings = filteredBookings.filter(b => b.picked_up === true).length;
  const totalRecovered = (bookingsData || []).filter(b => b.recovered === true || b.recovered === 'true').length;

  // Source pick-up counts from filteredBookings
  const bookingsBySource = { organic: { total: 0, pickedUp: 0 }, ads: { total: 0, pickedUp: 0 } };
  filteredBookings.forEach(b => {
    const sk = getAdsOrganicKey(b.source_type);
    bookingsBySource[sk].total++;
    if (b.picked_up === true) bookingsBySource[sk].pickedUp++;
  });

  // ── Reschedule dedup for booked calls (same as generalStats.jsx) ──────────────
  const calls = bookedCalls;
  const isReschedule = (c) => c?.is_reschedule === true || c?.is_reschedule === 'true';
  const rescheduledLeadIds = new Set(calls.filter(isReschedule).map(c => c.lead_id));
  const filteredCalls = calls.filter(call =>
    isReschedule(call) || !rescheduledLeadIds.has(call.lead_id)
  );

  // Calls that already happened (call_date <= now)
  const now = new Date();
  const callsThatHappened = filteredCalls.filter(c => {
    const cd = c.call_date ? new Date(c.call_date) : null;
    return cd && cd <= now;
  });

  // ── Headline totals ───────────────────────────────────────────────────────────
  const totalBooked             = filteredCalls.length;
  const totalBookedThatHappened = callsThatHappened.length;
  const totalPickedUp           = filteredCalls.filter(c => c.picked_up === true || c.picked_up === 'true').length;
  const totalShowedUp           = callsThatHappened.filter(c => c.showed_up === true || c.showed_up === 'true').length;
  const totalConfirmed          = callsThatHappened.filter(c => c.confirmed === true || c.confirmed === 'true').length;
  const totalPurchased          = purchasedCalls.length;

  // DQ rate (book_date cohort)
  const totalPickedUpByBookDate = filteredBookings.filter(b => b.picked_up === true).length;
  const totalDQ                 = filteredBookings.filter(b => b.picked_up === true && b.confirmed !== true).length;
  const dqRate                  = totalPickedUpByBookDate > 0 ? (totalDQ / totalPickedUpByBookDate) * 100 : 0;

  const totalBookingsForConfirmation = filteredBookings.length;
  const totalConfirmedBookDate       = filteredBookings.filter(b => b.confirmed === true || b.confirmed === 'true').length;

  // PIF and downsell
  const isCountedPurchase = (call) => {
    if (call.outcome === 'yes') return true;
    if (call.outcome === 'refund') return (call.clawback ?? 100) < 100;
    return false;
  };
  const totalPif      = purchasedCalls.filter(c => isCountedPurchase(c) && c.offer_installments != null && Number(c.offer_installments) === 0).length;
  const totalDownsell = purchasedCalls.filter(c => isCountedPurchase(c) && c.offer_weekly_classes != null).length;
  const pifPercent     = totalPurchased > 0 ? (totalPif / totalPurchased) * 100 : 0;
  const downsellPercent = totalPurchased > 0 ? (totalDownsell / totalPurchased) * 100 : 0;

  // ── Closer stats ──────────────────────────────────────────────────────────────
  const closerStats = {};
  callsThatHappened.forEach(call => {
    if (!call.closers) return;
    const cid = call.closers.id;
    if (!closerStats[cid]) closerStats[cid] = { id: cid, name: call.closers.name, showedUp: 0, confirmed: 0, purchased: 0, pif: 0, payoffs: 0, dontQualify: 0 };
    if (call.showed_up) closerStats[cid].showedUp++;
    if (call.confirmed === true || call.confirmed === 'true') closerStats[cid].confirmed++;
  });

  purchasedCalls.forEach(call => {
    if (!call.closers) return;
    const cid = call.closers.id;
    let shouldCount = false;
    if (call.outcome === 'yes') shouldCount = true;
    else if (call.outcome === 'refund' && (call.clawback ?? 100) < 100) shouldCount = true;
    if (!shouldCount) return;
    if (!closerStats[cid]) closerStats[cid] = { id: cid, name: call.closers.name, showedUp: 0, confirmed: 0, purchased: 0, pif: 0, payoffs: 0, dontQualify: 0 };
    closerStats[cid].purchased++;
    if (call.offer_installments != null && Number(call.offer_installments) === 0) closerStats[cid].pif++;
    // outcome_log.PIF — Paid off checkbox on the outcome row
    if (call.PIF === true || call.PIF === 'true') closerStats[cid].payoffs++;
  });

  // Fetch 4: closer DQ from outcome_log (same batched approach as generalStats.jsx)
  const callIdsForDq = callsThatHappened.map(c => c.id).filter(Boolean);
  const callByIdForDq = new Map(callsThatHappened.map(c => [String(c.id), c]));

  if (callIdsForDq.length > 0) {
    const allOutcomeRows = [];
    for (const chunk of chunkArray(callIdsForDq, 200)) {
      const { data, error } = await supabase
        .from('outcome_log')
        .select('id, outcome, call_id')
        .in('call_id', chunk);
      if (!error) allOutcomeRows.push(...(data || []));
    }
    const latestOutcomeByCallId = new Map();
    allOutcomeRows.forEach(row => {
      const k = String(row.call_id);
      const ex = latestOutcomeByCallId.get(k);
      if (!ex || row.id > ex.id) latestOutcomeByCallId.set(k, row);
    });
    latestOutcomeByCallId.forEach(log => {
      if (String(log.outcome || '').trim().toLowerCase() !== 'dont_qualify') return;
      const call = callByIdForDq.get(String(log.call_id));
      if (!call || !(call.showed_up === true || call.showed_up === 'true') || !call.closers) return;
      const cid = call.closers.id;
      if (!closerStats[cid]) closerStats[cid] = { id: cid, name: call.closers.name, showedUp: 0, confirmed: 0, purchased: 0, pif: 0, payoffs: 0, dontQualify: 0 };
      closerStats[cid].dontQualify = (closerStats[cid].dontQualify || 0) + 1;
    });
  }

  Object.values(closerStats).forEach(c => {
    c.dontQualify = c.dontQualify ?? 0;
    c.closerDqRate = c.showedUp > 0 ? (c.dontQualify / c.showedUp) * 100 : 0;
    c.conversionRate = c.showedUp > 0 ? (c.purchased / c.showedUp) * 100 : 0;
  });

  // ── Setter stats ──────────────────────────────────────────────────────────────
  const setterStats = {};
  filteredBookings.forEach(booking => {
    if (!booking.setters) return;
    const sid = booking.setters.id;
    if (!setterStats[sid]) setterStats[sid] = { id: sid, name: booking.setters.name, totalBooked: 0, totalPickedUp: 0, bookingsMadeInPeriod: 0, pickedUpFromBookings: 0, totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0 };
    setterStats[sid].bookingsMadeInPeriod++;
    if (booking.picked_up === true) setterStats[sid].pickedUpFromBookings++;
  });
  filteredCalls.forEach(call => {
    if (!call.setters) return;
    const sid = call.setters.id;
    if (!setterStats[sid]) setterStats[sid] = { id: sid, name: call.setters.name, totalBooked: 0, totalPickedUp: 0, bookingsMadeInPeriod: 0, pickedUpFromBookings: 0, totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0 };
    setterStats[sid].totalBooked++;
    if (call.picked_up === true) setterStats[sid].totalPickedUp++;
  });
  callsThatHappened.forEach(call => {
    if (!call.setters) return;
    const sid = call.setters.id;
    if (setterStats[sid]) {
      if (call.showed_up === true) setterStats[sid].totalShowedUp++;
      if (call.confirmed === true || call.confirmed === 'true') setterStats[sid].totalConfirmed++;
    }
  });
  purchasedCalls.forEach(call => {
    if (!call.setters) return;
    const sid = call.setters.id;
    if (!setterStats[sid]) setterStats[sid] = { id: sid, name: call.setters.name, totalBooked: 0, totalPickedUp: 0, totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0 };
    setterStats[sid].totalPurchased++;
  });
  Object.values(setterStats).forEach(s => {
    s.pickUpRate = s.bookingsMadeInPeriod > 0 ? (s.pickedUpFromBookings / s.bookingsMadeInPeriod) * 100 : 0;
    s.showUpRate = s.totalConfirmed > 0 ? (s.totalShowedUp / s.totalConfirmed) * 100 : 0;
  });

  // ── Source stats (ads / organic) ──────────────────────────────────────────────
  const mkSource = () => ({
    totalBooked: 0, totalBookedThatHappened: 0, totalPickedUp: 0,
    totalPickedUpByBookDate: 0, totalDQ: 0,
    bookingsMadeInPeriod: 0, pickedUpFromBookings: 0,
    bookingsForConfirmation: 0, confirmedFromBookings: 0,
    totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0, totalRescheduled: 0,
  });
  const sourceStats = { ads: mkSource(), organic: mkSource() };

  sourceStats.ads.bookingsMadeInPeriod    = bookingsBySource.ads.total;
  sourceStats.ads.pickedUpFromBookings    = bookingsBySource.ads.pickedUp;
  sourceStats.organic.bookingsMadeInPeriod = bookingsBySource.organic.total;
  sourceStats.organic.pickedUpFromBookings = bookingsBySource.organic.pickedUp;

  filteredBookings.forEach(b => {
    const sk = getAdsOrganicKey(b.source_type);
    sourceStats[sk].bookingsForConfirmation++;
    if (b.confirmed === true || b.confirmed === 'true') sourceStats[sk].confirmedFromBookings++;
    if (b.picked_up === true) {
      sourceStats[sk].totalPickedUpByBookDate++;
      if (b.confirmed !== true) sourceStats[sk].totalDQ++;
    }
  });
  filteredCalls.forEach(c => {
    const sk = getAdsOrganicKey(c.source_type);
    sourceStats[sk].totalBooked++;
    if (c.picked_up) sourceStats[sk].totalPickedUp++;
    if (c.is_reschedule) sourceStats[sk].totalRescheduled++;
  });
  callsThatHappened.forEach(c => {
    const sk = getAdsOrganicKey(c.source_type);
    sourceStats[sk].totalBookedThatHappened++;
    if (c.showed_up) sourceStats[sk].totalShowedUp++;
    if (c.confirmed) sourceStats[sk].totalConfirmed++;
  });
  purchasedCalls.forEach(c => {
    sourceStats[getAdsOrganicKey(c.source_type)].totalPurchased++;
  });
  Object.values(sourceStats).forEach(s => {
    s.pickUpRate       = s.bookingsMadeInPeriod > 0 ? (s.pickedUpFromBookings / s.bookingsMadeInPeriod) * 100 : 0;
    s.showUpRate       = s.totalBookedThatHappened > 0 ? (s.totalShowedUp / s.totalBookedThatHappened) * 100 : 0;
    s.confirmationRate = s.bookingsForConfirmation > 0 ? (s.confirmedFromBookings / s.bookingsForConfirmation) * 100 : 0;
    s.conversionRate   = s.totalShowedUp > 0 ? (s.totalPurchased / s.totalShowedUp) * 100 : 0;
    s.dqRate           = s.totalPickedUpByBookDate > 0 ? (s.totalDQ / s.totalPickedUpByBookDate) * 100 : 0;
  });

  // ── Medium stats (tiktok / instagram / other — ads only) ─────────────────────
  const mkMedium = () => ({
    bookingsMadeInPeriod: 0, pickedUpFromBookings: 0, bookingsForConfirmation: 0,
    confirmedFromBookings: 0, totalBooked: 0, totalPickedUp: 0,
    totalBookedThatHappened: 0, totalShowedUp: 0, totalConfirmed: 0,
    totalPurchased: 0, totalRescheduled: 0,
  });
  const mediumStats = { tiktok: mkMedium(), instagram: mkMedium(), other: mkMedium() };
  const getMediumKey = (lead, source) => {
    const isAds = getAdsOrganicKey(source) === 'ads';
    if (!isAds) return null;
    const m = lead?.medium?.toLowerCase();
    if (m === 'tiktok') return 'tiktok';
    if (m === 'instagram') return 'instagram';
    return 'other';
  };

  filteredBookings.forEach(b => {
    const mk = getMediumKey(b.leads, b.source_type);
    if (!mk) return;
    mediumStats[mk].bookingsMadeInPeriod++;
    if (b.picked_up === true) mediumStats[mk].pickedUpFromBookings++;
    mediumStats[mk].bookingsForConfirmation++;
    if (b.confirmed === true || b.confirmed === 'true') mediumStats[mk].confirmedFromBookings++;
  });
  filteredCalls.forEach(c => {
    const mk = getMediumKey(c.leads, c.source_type);
    if (!mk) return;
    mediumStats[mk].totalBooked++;
    if (c.picked_up) mediumStats[mk].totalPickedUp++;
    if (c.is_reschedule) mediumStats[mk].totalRescheduled++;
  });
  callsThatHappened.forEach(c => {
    const mk = getMediumKey(c.leads, c.source_type);
    if (!mk) return;
    mediumStats[mk].totalBookedThatHappened++;
    if (c.showed_up) mediumStats[mk].totalShowedUp++;
    if (c.confirmed) mediumStats[mk].totalConfirmed++;
  });
  purchasedCalls.forEach(c => {
    const mk = getMediumKey(c.leads, c.source_type);
    if (!mk) return;
    mediumStats[mk].totalPurchased++;
  });
  Object.values(mediumStats).forEach(m => {
    m.pickUpRate       = m.bookingsMadeInPeriod > 0 ? (m.pickedUpFromBookings / m.bookingsMadeInPeriod) * 100 : 0;
    m.showUpRate       = m.totalBookedThatHappened > 0 ? (m.totalShowedUp / m.totalBookedThatHappened) * 100 : 0;
    m.confirmationRate = m.bookingsForConfirmation > 0 ? (m.confirmedFromBookings / m.bookingsForConfirmation) * 100 : 0;
    m.conversionRate   = m.totalShowedUp > 0 ? (m.totalPurchased / m.totalShowedUp) * 100 : 0;
  });

  // ── Country stats ─────────────────────────────────────────────────────────────
  const countryStats = {};
  const ensureCountry = (phone) => {
    const c = getCountryFromPhone(phone);
    if (!countryStats[c]) countryStats[c] = { country: c, totalBooked: 0, totalPickedUp: 0, bookingsMadeInPeriod: 0, pickedUpFromBookings: 0, totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0 };
    return c;
  };
  filteredBookings.forEach(b => {
    const c = ensureCountry(b.phone);
    countryStats[c].bookingsMadeInPeriod++;
    if (b.picked_up === true) countryStats[c].pickedUpFromBookings++;
  });
  filteredCalls.forEach(call => {
    const c = ensureCountry(call.phone);
    countryStats[c].totalBooked++;
    if (call.picked_up) countryStats[c].totalPickedUp++;
  });
  callsThatHappened.forEach(call => {
    const c = getCountryFromPhone(call.phone);
    if (countryStats[c]) {
      if (call.showed_up) countryStats[c].totalShowedUp++;
      if (call.confirmed) countryStats[c].totalConfirmed++;
    }
  });
  purchasedCalls.forEach(call => {
    const c = ensureCountry(call.phone);
    countryStats[c].totalPurchased++;
  });
  Object.values(countryStats).forEach(c => {
    c.pickUpRate     = c.bookingsMadeInPeriod > 0 ? (c.pickedUpFromBookings / c.bookingsMadeInPeriod) * 100 : 0;
    c.showUpRate     = c.totalBooked > 0 ? (c.totalShowedUp / c.totalBooked) * 100 : 0;
    c.conversionRate = c.totalShowedUp > 0 ? (c.totalPurchased / c.totalShowedUp) * 100 : 0;
  });

  const pct = (n) => Math.round(n * 10) / 10;

  return {
    period: { from, to },
    funnel: {
      bookings_made:         bookingsMadeinPeriod,
      total_booked:          totalBooked,
      total_showed_up:       totalShowedUp,
      total_purchased:       totalPurchased,
      total_picked_up:       totalPickedUpFromBookings,
      total_dq:              totalDQ,
      total_rescheduled:     filteredCalls.filter(c => isReschedule(c)).length,
      total_recovered:       totalRecovered,
      total_pif:             totalPif,
      total_downsell:        totalDownsell,
      pick_up_rate_pct:      pct(bookingsMadeinPeriod > 0 ? (totalPickedUpFromBookings / bookingsMadeinPeriod) * 100 : 0),
      confirmation_rate_pct: pct(totalBookingsForConfirmation > 0 ? (totalConfirmedBookDate / totalBookingsForConfirmation) * 100 : 0),
      show_up_rate_pct:      pct(totalBookedThatHappened > 0 ? (totalShowedUp / totalBookedThatHappened) * 100 : 0),
      conversion_rate_pct:   pct(totalShowedUp > 0 ? (totalPurchased / totalShowedUp) * 100 : 0),
      dq_rate_pct:           pct(dqRate),
      pif_pct:               pct(pifPercent),
      downsell_pct:          pct(downsellPercent),
    },
    closers: Object.values(closerStats)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(c => ({
        name:            c.name,
        showed_up:       c.showedUp,
        purchased:       c.purchased,
        pif:             c.pif,
        dont_qualify:    c.dontQualify,
        conversion_rate_pct: pct(c.conversionRate),
        dq_rate_pct:         pct(c.closerDqRate),
      })),
    setters: Object.values(setterStats)
      .sort((a, b) => b.bookingsMadeInPeriod - a.bookingsMadeInPeriod)
      .map(s => ({
        name:                s.name,
        bookings_made:       s.bookingsMadeInPeriod,
        picked_up:           s.pickedUpFromBookings,
        showed_up:           s.totalShowedUp,
        purchased:           s.totalPurchased,
        pick_up_rate_pct:    pct(s.pickUpRate),
        show_up_rate_pct:    pct(s.showUpRate),
      })),
    source: {
      ads:     { ...sourceStats.ads,     pick_up_rate_pct: pct(sourceStats.ads.pickUpRate),     show_up_rate_pct: pct(sourceStats.ads.showUpRate),     confirmation_rate_pct: pct(sourceStats.ads.confirmationRate),     conversion_rate_pct: pct(sourceStats.ads.conversionRate),     dq_rate_pct: pct(sourceStats.ads.dqRate) },
      organic: { ...sourceStats.organic, pick_up_rate_pct: pct(sourceStats.organic.pickUpRate), show_up_rate_pct: pct(sourceStats.organic.showUpRate), confirmation_rate_pct: pct(sourceStats.organic.confirmationRate), conversion_rate_pct: pct(sourceStats.organic.conversionRate), dq_rate_pct: pct(sourceStats.organic.dqRate) },
    },
    medium: {
      tiktok:    { ...mediumStats.tiktok,    pick_up_rate_pct: pct(mediumStats.tiktok.pickUpRate),    show_up_rate_pct: pct(mediumStats.tiktok.showUpRate),    conversion_rate_pct: pct(mediumStats.tiktok.conversionRate) },
      instagram: { ...mediumStats.instagram, pick_up_rate_pct: pct(mediumStats.instagram.pickUpRate), show_up_rate_pct: pct(mediumStats.instagram.showUpRate), conversion_rate_pct: pct(mediumStats.instagram.conversionRate) },
      other:     { ...mediumStats.other,     pick_up_rate_pct: pct(mediumStats.other.pickUpRate),     show_up_rate_pct: pct(mediumStats.other.showUpRate),     conversion_rate_pct: pct(mediumStats.other.conversionRate) },
    },
    countries: Object.values(countryStats)
      .sort((a, b) => b.totalPurchased - a.totalPurchased)
      .map(c => ({
        country:          c.country,
        bookings_made:    c.bookingsMadeInPeriod,
        showed_up:        c.totalShowedUp,
        purchased:        c.totalPurchased,
        pick_up_rate_pct: pct(c.pickUpRate),
        conversion_rate_pct: pct(c.conversionRate),
      })),
  };
}

// ── Closer commission (mirrors getCloserCommissionBreakdown in closerCommission.js) ──
function outcomeRowMatchesCloser(row, closerId) {
  return String(row?.calls?.closer_id) === String(closerId);
}

async function fetchCloserBase(closerId, startISO, endISO) {
  const sel = `commission, discount, kajabi_payoff_id, payoff_date, offers!offer_id(base_commission, payoff_commission), calls!closer_notes_call_id_fkey(closer_id)`;
  const [{ data: yesData, error: yesErr }, { data: refundData, error: refundErr }] = await Promise.all([
    supabase.from('outcome_log').select(sel).eq('outcome', 'yes').gte('purchase_date', startISO).lte('purchase_date', endISO),
    supabase.from('outcome_log').select(sel).eq('outcome', 'refund').not('purchase_date', 'is', null).gte('purchase_date', startISO).lte('purchase_date', endISO),
  ]);
  if (yesErr || refundErr) return 0;

  let sum = 0;
  for (const row of (yesData || []).filter(x => outcomeRowMatchesCloser(x, closerId))) {
    const offer = row.offers;
    if (row.kajabi_payoff_id && offer) {
      const base = adjustedBaseCommissionFromOffer(offer, row.discount);
      const inc  = payoffIncrementFromOffer(offer, row.discount);
      if (base != null) sum += base;
      if (inc != null && !row.payoff_date) sum += inc;
    } else {
      sum += Number(row.commission) || 0;
    }
  }
  for (const row of (refundData || []).filter(x => outcomeRowMatchesCloser(x, closerId))) {
    const offer = row.offers;
    if (row.kajabi_payoff_id && offer) {
      const base = adjustedBaseCommissionFromOffer(offer, row.discount);
      const inc  = payoffIncrementFromOffer(offer, row.discount);
      let s = 0;
      if (base != null) s += base;
      if (inc != null && !row.payoff_date) s += inc;
      sum += s;
    } else if (offer && offer.base_commission != null) {
      const adj = adjustedBaseCommissionFromOffer(offer, row.discount);
      sum += adj != null ? adj : Math.abs(Number(row.commission) || 0);
    } else {
      sum += Math.abs(Number(row.commission) || 0);
    }
  }
  return sum;
}

async function fetchCloserPayoffIncrements(closerId, startISO, endISO) {
  const { data, error } = await supabase
    .from('outcome_log')
    .select(`discount, payoff_date, offers!offer_id(base_commission, payoff_commission), calls!closer_notes_call_id_fkey(closer_id)`)
    .eq('outcome', 'yes')
    .not('kajabi_payoff_id', 'is', null)
    .not('payoff_date', 'is', null)
    .gte('payoff_date', startISO)
    .lte('payoff_date', endISO);
  if (error) return 0;
  return (data || []).filter(x => outcomeRowMatchesCloser(x, closerId))
    .reduce((sum, row) => { const inc = payoffIncrementFromOffer(row.offers, row.discount); return sum + (inc ?? 0); }, 0);
}

async function fetchCloserSecondInstallments(closerId, monthKey) {
  // Same logic as fetchSecondInstallmentsCommission in closerCommission.js
  const [y, m] = monthKey.split('-').map(Number);
  const prevMonthKey = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const prev = monthKeyToRange(prevMonthKey);
  const curr = monthKeyToRange(monthKey);
  const sel = 'commission, calls!closer_notes_call_id_fkey(closer_id)';
  const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
    supabase.from('outcome_log').select(sel).eq('outcome', 'yes').eq('paid_second_installment', true).is('second_installment_pay_date', null).gte('purchase_date', prev.startUTC.toISOString()).lte('purchase_date', prev.endUTC.toISOString()),
    supabase.from('outcome_log').select(sel).eq('outcome', 'yes').eq('paid_second_installment', true).not('second_installment_pay_date', 'is', null).gte('second_installment_pay_date', curr.startUTC.toISOString()).lte('second_installment_pay_date', curr.endUTC.toISOString()),
  ]);
  if (e1 || e2) return 0;
  return [...(d1 || []), ...(d2 || [])]
    .filter(x => outcomeRowMatchesCloser(x, closerId))
    .reduce((sum, x) => sum + (Number(x.commission) || 0), 0);
}

async function fetchCloserRefunds(closerId, startISO, endISO) {
  const { data, error } = await supabase
    .from('outcome_log')
    .select('commission, purchase_date, refund_date, calls!closer_notes_call_id_fkey(closer_id)')
    .eq('outcome', 'refund')
    .not('refund_date', 'is', null)
    .gte('refund_date', startISO)
    .lte('refund_date', endISO);
  if (error) return 0;
  return (data || [])
    .filter(x => outcomeRowMatchesCloser(x, closerId))
    .filter(x => {
      // Exclude same-month refunds (those are in base) — same logic as closerCommission.js
      if (!x.purchase_date || !x.refund_date) return true;
      const pd = new Date(x.purchase_date), rd = new Date(x.refund_date);
      return !(pd.getUTCFullYear() === rd.getUTCFullYear() && pd.getUTCMonth() === rd.getUTCMonth());
    })
    .reduce((sum, x) => sum + (Number(x.commission) || 0), 0);
}

async function fetchCloserSameMonthRefunds(closerId, startISO, endISO) {
  const { data, error } = await supabase
    .from('outcome_log')
    .select('commission, calls!closer_notes_call_id_fkey(closer_id)')
    .eq('outcome', 'refund')
    .gte('purchase_date', startISO)
    .lte('purchase_date', endISO);
  if (error) return 0;
  return (data || []).filter(x => outcomeRowMatchesCloser(x, closerId))
    .reduce((sum, x) => sum + (Number(x.commission) || 0), 0);
}

export async function getCloserCommissionBreakdown(closerId, monthKey) {
  if (!closerId || !monthKey) return { total: 0, base: 0, payoff_increments: 0, second_installments: 0, refunds: 0, same_month_refunds: 0 };
  const { startUTC, endUTC } = monthKeyToRange(monthKey);
  const startISO = startUTC.toISOString();
  const endISO   = endUTC.toISOString();
  const [base, payoffIncrements, secondInstallments, refunds, sameMonthRefunds] = await Promise.all([
    fetchCloserBase(closerId, startISO, endISO),
    fetchCloserPayoffIncrements(closerId, startISO, endISO),
    fetchCloserSecondInstallments(closerId, monthKey),
    fetchCloserRefunds(closerId, startISO, endISO),
    fetchCloserSameMonthRefunds(closerId, startISO, endISO),
  ]);
  const total = base + payoffIncrements + secondInstallments + refunds + sameMonthRefunds;
  return { total, base, payoff_increments: payoffIncrements, second_installments: secondInstallments, refunds, same_month_refunds: sameMonthRefunds };
}

// ── Setter commission (mirrors getAllSettersMonthlyCommission in setterCommission.js) ─
export async function getAllSettersMonthlyCommission(monthKey) {
  const { startUTC, endUTC } = monthKeyToRange(monthKey);
  const startISO = startUTC.toISOString();
  const endISO   = endUTC.toISOString();

  const { data: setters, error: settersError } = await supabase
    .from('setters').select('id, name').eq('active', true).order('name');
  if (settersError) return [];

  const byId = {};
  for (const s of setters || []) byId[s.id] = { id: s.id, name: s.name, show_ups: 0, purchases: 0 };

  const [calls, outcomes] = await Promise.all([
    fetchAllPages(() =>
      supabase.from('calls').select('setter_id, showed_up, call_date')
        .eq('showed_up', true).not('setter_id', 'is', null).not('call_date', 'is', null)
        .gte('call_date', startISO).lte('call_date', endISO)
    ),
    fetchAllPages(() =>
      supabase.from('outcome_log')
        .select('purchase_date, calls!closer_notes_call_id_fkey(setter_id)')
        .eq('outcome', 'yes').not('purchase_date', 'is', null)
        .gte('purchase_date', startISO).lte('purchase_date', endISO)
    ),
  ]);

  for (const c of calls)    { if (c.setter_id && byId[c.setter_id]) byId[c.setter_id].show_ups++; }
  for (const r of outcomes) { const sid = r.calls?.setter_id; if (sid && byId[sid]) byId[sid].purchases++; }

  return Object.values(byId)
    .map(r => ({ ...r, total: setterCommissionTotal(r.show_ups, r.purchases) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
