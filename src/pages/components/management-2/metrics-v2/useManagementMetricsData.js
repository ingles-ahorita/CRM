import { useCallback, useEffect, useMemo, useState } from "react";
import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "../../../../lib/supabaseClient";
import {
  fetchCustomer as fetchKajabiCustomer,
  fetchOffer,
  fetchPurchases as fetchKajabiPurchases,
  fetchTransaction,
  fetchTransactions,
  listCustomers,
  listOffers,
} from "../../../../lib/kajabiApi";
import { getSpecialOfferKajabiIds } from "../../../../lib/specialOffers";
import { getCountryFromPhone } from "../../../../utils/phoneNumberParser";
import * as DateHelpers from "../../../../utils/dateHelpers";
import {
  emptyStatsBlock,
  finalizeRates,
  pct,
  round1,
  sourceBucket,
} from "./metricTransforms";

const PAGE_SIZE = 1000;
const SUCCESS_STATES = new Set(["paid", "successful", "success", "complete", "completed", "succeeded"]);

function parseDateAsUTC(dateString) {
  const value = String(dateString || "");
  const hasTimezone = value.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(value);
  return parseISO(hasTimezone ? value : `${value}Z`);
}

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

function normalizeRange(startDate, endDate) {
  const startDateObj = parseDateAsUTC(startDate);
  const endDateObj = parseDateAsUTC(endDate);

  if (DateHelpers.DEFAULT_TIMEZONE === "UTC") {
    const startUTC = new Date(startDateObj);
    const endUTC = new Date(endDateObj);
    startUTC.setUTCHours(0, 0, 0, 0);
    endUTC.setUTCHours(23, 59, 59, 999);
    return { startUTC, endUTC };
  }

  const startDateNormalized = DateHelpers.normalizeToTimezone(startDateObj, DateHelpers.DEFAULT_TIMEZONE);
  const endDateNormalized = DateHelpers.normalizeToTimezone(endDateObj, DateHelpers.DEFAULT_TIMEZONE);
  const startOfDayNormalized = new Date(startDateNormalized);
  const endOfDayNormalized = new Date(endDateNormalized);
  startOfDayNormalized.setHours(0, 0, 0, 0);
  endOfDayNormalized.setHours(23, 59, 59, 999);
  return {
    startUTC: DateHelpers.fromZonedTime(startOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE),
    endUTC: DateHelpers.fromZonedTime(endOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE),
  };
}

function isTrue(value) {
  return value === true || value === "true";
}

function isCountedPurchase(call) {
  if (call.outcome === "yes") return true;
  if (call.outcome === "refund") return (call.clawback ?? 100) < 100;
  return false;
}

function addBookingsPerDay(bookingsData, startUTC, endUTC) {
  const tz = DateHelpers.DEFAULT_TIMEZONE;
  const buckets = {};
  const add = (dayKey, key) => {
    if (!buckets[dayKey]) buckets[dayKey] = { organic: 0, ads: 0, rescheduled: 0 };
    buckets[dayKey][key] += 1;
  };

  (bookingsData || []).forEach((booking) => {
    if (!booking.book_date) return;
    const date = parseISO(booking.book_date.includes("Z") ? booking.book_date : `${booking.book_date}Z`);
    const dayKey = formatInTimeZone(date, tz, "yyyy-MM-dd");
    if (isTrue(booking.is_reschedule)) add(dayKey, "rescheduled");
    else add(dayKey, sourceBucket(booking.source_type));
  });

  const rows = [];
  const cursor = new Date(startUTC);
  while (cursor <= endUTC) {
    const date = formatInTimeZone(cursor, tz, "yyyy-MM-dd");
    const row = buckets[date] || { organic: 0, ads: 0, rescheduled: 0 };
    rows.push({ date, ...row, total: row.organic + row.ads + row.rescheduled });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

async function fetchPurchasesForDateRange(startDate, endDate) {
  const { startUTC, endUTC } = normalizeRange(startDate, endDate);
  const outcomeLogs = await fetchAllPages(() =>
    supabase
      .from("outcome_log")
      .select(`
        *,
        calls!inner!closer_notes_call_id_fkey (
          *,
          closers (id, name),
          setters (id, name),
          leads (id, customer_id, medium)
        ),
        offers!offer_id (id, name, installments, weekly_classes)
      `)
      .in("outcome", ["yes", "refund"])
      .gte("purchase_date", startUTC.toISOString())
      .lte("purchase_date", endUTC.toISOString())
      .order("purchase_date", { ascending: false })
  );

  const latestByCallId = new Map();
  (outcomeLogs || []).forEach((row) => {
    if (!row.calls?.id) return;
    const existing = latestByCallId.get(row.calls.id);
    if (!existing || row.id > existing.id) latestByCallId.set(row.calls.id, row);
  });

  return Array.from(latestByCallId.values()).map((row) => ({
    ...row.calls,
    leads: row.calls.leads,
    outcome_log_id: row.id,
    purchase_date: row.purchase_date,
    outcome: row.outcome,
    clawback: row.clawback,
    PIF: row.PIF,
    paid_second_installment: row.paid_second_installment,
    commission: row.paid_second_installment ? row.commission * 2 : row.commission,
    offer_id: row.offer_id,
    offer_name: row.offers?.name || null,
    offer_installments: row.offers?.installments,
    offer_weekly_classes: row.offers?.weekly_classes,
    discount: row.discount,
    purchased_at: row.purchase_date,
    purchased: true,
  }));
}

function ensureBlock(map, key) {
  if (!map[key]) map[key] = emptyStatsBlock();
  return map[key];
}

function createCountrySourceStats() {
  return {};
}

function ensureCountryPair(countrySourceStats, country) {
  if (!countrySourceStats[country]) {
    countrySourceStats[country] = {
      ads: emptyStatsBlock(),
      organic: emptyStatsBlock(),
    };
  }
  return countrySourceStats[country];
}

async function fetchStatsData(startDate, endDate) {
  const { startUTC, endUTC } = normalizeRange(startDate, endDate);
  const [bookedCalls, purchasedCalls, bookingsData] = await Promise.all([
    fetchAllPages(() =>
      supabase
        .from("calls")
        .select(`
          id, picked_up, showed_up, confirmed, purchased, purchased_at, is_reschedule,
          lead_id, phone, book_date, call_date, source_type, recovered,
          setters (id, name),
          closers (id, name),
          leads (phone, medium)
        `)
        .gte("call_date", startUTC.toISOString())
        .lte("call_date", endUTC.toISOString())
        .order("call_date", { ascending: true })
    ),
    fetchPurchasesForDateRange(startDate, endDate),
    fetchAllPages(() =>
      supabase
        .from("calls")
        .select(`
          id, picked_up, confirmed, lead_id, book_date, source_type, is_reschedule,
          recovered, phone,
          setters (id, name),
          closers (id, name),
          leads (phone, medium)
        `)
        .gte("book_date", startUTC.toISOString())
        .lte("book_date", endUTC.toISOString())
        .order("book_date", { ascending: true })
    ),
  ]);

  const rescheduledLeadIdsFromBookings = new Set(
    (bookingsData || []).filter((b) => isTrue(b.is_reschedule)).map((b) => b.lead_id)
  );
  const filteredBookings = (bookingsData || []).filter(
    (b) => isTrue(b.is_reschedule) || !rescheduledLeadIdsFromBookings.has(b.lead_id)
  );

  const isReschedule = (c) => isTrue(c?.is_reschedule);
  const rescheduledLeadIds = new Set((bookedCalls || []).filter(isReschedule).map((c) => c.lead_id));
  const filteredCalls = (bookedCalls || []).filter((call) => isReschedule(call) || !rescheduledLeadIds.has(call.lead_id));
  const now = new Date();
  const callsThatHappened = filteredCalls.filter((c) => c.call_date && new Date(c.call_date) <= now);

  const headline = emptyStatsBlock();
  headline.bookingsMadeInPeriod = filteredBookings.length;
  headline.pickedUpFromBookings = filteredBookings.filter((b) => b.picked_up === true).length;
  headline.totalPickedUpByBookDate = filteredBookings.filter((b) => b.picked_up === true).length;
  headline.totalDQ = filteredBookings.filter((b) => b.picked_up === true && b.confirmed !== true).length;
  headline.bookingsForConfirmation = filteredBookings.length;
  headline.confirmedFromBookings = filteredBookings.filter((b) => isTrue(b.confirmed)).length;
  headline.totalBooked = filteredCalls.length;
  headline.totalBookedThatHappened = callsThatHappened.length;
  headline.totalPickedUp = filteredCalls.filter((c) => isTrue(c.picked_up)).length;
  headline.totalShowedUp = callsThatHappened.filter((c) => isTrue(c.showed_up)).length;
  headline.totalConfirmed = callsThatHappened.filter((c) => isTrue(c.confirmed)).length;
  headline.totalPurchased = purchasedCalls.length;
  headline.totalRescheduled = filteredCalls.filter(isReschedule).length;
  headline.totalRecovered = (bookingsData || []).filter((b) => isTrue(b.recovered)).length;
  headline.totalNoShows = callsThatHappened.filter((c) => !isTrue(c.showed_up)).length;
  headline.totalPif = purchasedCalls.filter((c) => isCountedPurchase(c) && c.offer_installments != null && Number(c.offer_installments) === 0).length;
  headline.totalDownsell = purchasedCalls.filter((c) => isCountedPurchase(c) && c.offer_weekly_classes != null).length;
  finalizeRates(headline);
  headline.pifPercent = pct(headline.totalPif, headline.totalPurchased);
  headline.downsellPercent = pct(headline.totalDownsell, headline.totalPurchased);

  const sourceStats = { ads: emptyStatsBlock(), organic: emptyStatsBlock() };
  const mediumStats = { tiktok: emptyStatsBlock(), instagram: emptyStatsBlock(), other: emptyStatsBlock() };
  const countryStats = {};
  const countrySourceStats = createCountrySourceStats();
  const closerStats = {};
  const setterStats = {};

  const getMediumKey = (lead, sourceType) => {
    if (sourceBucket(sourceType) !== "ads") return null;
    const medium = String(lead?.medium || "").toLowerCase();
    if (medium === "tiktok") return "tiktok";
    if (medium === "instagram") return "instagram";
    return "other";
  };

  filteredBookings.forEach((b) => {
    const source = sourceBucket(b.source_type);
    const country = getCountryFromPhone(b.phone);
    const blocks = [
      sourceStats[source],
      ensureBlock(countryStats, country),
      ensureCountryPair(countrySourceStats, country)[source],
    ];
    const mediumKey = getMediumKey(b.leads, b.source_type);
    if (mediumKey) blocks.push(mediumStats[mediumKey]);
    blocks.forEach((block) => {
      block.bookingsMadeInPeriod += 1;
      block.bookingsForConfirmation += 1;
      if (b.picked_up === true) {
        block.pickedUpFromBookings += 1;
        block.totalPickedUpByBookDate += 1;
        if (b.confirmed !== true) block.totalDQ += 1;
      }
      if (isTrue(b.confirmed)) block.confirmedFromBookings += 1;
      if (isTrue(b.recovered)) block.totalRecovered += 1;
    });

    if (b.closers && isTrue(b.recovered)) {
      const cid = b.closers.id;
      if (!closerStats[cid]) {
        closerStats[cid] = { id: cid, name: b.closers.name, showedUp: 0, confirmed: 0, purchased: 0, pif: 0, payoffs: 0, dontQualify: 0, noShows: 0, recovered: 0 };
      }
      closerStats[cid].recovered += 1;
    }

    if (b.setters) {
      const sid = b.setters.id;
      if (!setterStats[sid]) setterStats[sid] = { id: sid, name: b.setters.name, totalBooked: 0, totalPickedUp: 0, bookingsMadeInPeriod: 0, pickedUpFromBookings: 0, totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0 };
      setterStats[sid].bookingsMadeInPeriod += 1;
      if (b.picked_up === true) setterStats[sid].pickedUpFromBookings += 1;
    }
  });

  filteredCalls.forEach((c) => {
    const source = sourceBucket(c.source_type);
    const country = getCountryFromPhone(c.phone);
    const blocks = [
      sourceStats[source],
      ensureBlock(countryStats, country),
      ensureCountryPair(countrySourceStats, country)[source],
    ];
    const mediumKey = getMediumKey(c.leads, c.source_type);
    if (mediumKey) blocks.push(mediumStats[mediumKey]);
    blocks.forEach((block) => {
      block.totalBooked += 1;
      if (isTrue(c.picked_up)) block.totalPickedUp += 1;
      if (isReschedule(c)) block.totalRescheduled += 1;
    });

    if (c.setters) {
      const sid = c.setters.id;
      if (!setterStats[sid]) setterStats[sid] = { id: sid, name: c.setters.name, totalBooked: 0, totalPickedUp: 0, bookingsMadeInPeriod: 0, pickedUpFromBookings: 0, totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0 };
      setterStats[sid].totalBooked += 1;
      if (c.picked_up === true) setterStats[sid].totalPickedUp += 1;
    }
  });

  callsThatHappened.forEach((c) => {
    const source = sourceBucket(c.source_type);
    const country = getCountryFromPhone(c.phone);
    const blocks = [
      sourceStats[source],
      ensureBlock(countryStats, country),
      ensureCountryPair(countrySourceStats, country)[source],
    ];
    const mediumKey = getMediumKey(c.leads, c.source_type);
    if (mediumKey) blocks.push(mediumStats[mediumKey]);
    blocks.forEach((block) => {
      block.totalBookedThatHappened += 1;
      if (isTrue(c.showed_up)) block.totalShowedUp += 1;
      else block.totalNoShows += 1;
      if (isTrue(c.confirmed)) block.totalConfirmed += 1;
    });

    if (c.closers) {
      const cid = c.closers.id;
      if (!closerStats[cid]) closerStats[cid] = { id: cid, name: c.closers.name, showedUp: 0, confirmed: 0, purchased: 0, pif: 0, payoffs: 0, dontQualify: 0, noShows: 0, recovered: 0 };
      if (isTrue(c.showed_up)) closerStats[cid].showedUp += 1;
      else closerStats[cid].noShows += 1;
      if (isTrue(c.confirmed)) closerStats[cid].confirmed += 1;
    }
    if (c.setters && setterStats[c.setters.id]) {
      if (isTrue(c.showed_up)) setterStats[c.setters.id].totalShowedUp += 1;
      if (isTrue(c.confirmed)) setterStats[c.setters.id].totalConfirmed += 1;
    }
  });

  purchasedCalls.forEach((c) => {
    const source = sourceBucket(c.source_type);
    const country = getCountryFromPhone(c.phone);
    const blocks = [
      sourceStats[source],
      ensureBlock(countryStats, country),
      ensureCountryPair(countrySourceStats, country)[source],
    ];
    const mediumKey = getMediumKey(c.leads, c.source_type);
    if (mediumKey) blocks.push(mediumStats[mediumKey]);
    blocks.forEach((block) => {
      block.totalPurchased += 1;
    });

    if (c.closers && isCountedPurchase(c)) {
      const cid = c.closers.id;
      if (!closerStats[cid]) closerStats[cid] = { id: cid, name: c.closers.name, showedUp: 0, confirmed: 0, purchased: 0, pif: 0, payoffs: 0, dontQualify: 0, noShows: 0, recovered: 0 };
      closerStats[cid].purchased += 1;
      if (c.offer_installments != null && Number(c.offer_installments) === 0) closerStats[cid].pif += 1;
      if (isTrue(c.PIF)) closerStats[cid].payoffs += 1;
    }
    if (c.setters) {
      const sid = c.setters.id;
      if (!setterStats[sid]) setterStats[sid] = { id: sid, name: c.setters.name, totalBooked: 0, totalPickedUp: 0, bookingsMadeInPeriod: 0, pickedUpFromBookings: 0, totalShowedUp: 0, totalConfirmed: 0, totalPurchased: 0 };
      setterStats[sid].totalPurchased += 1;
    }
  });

  const callIdsForDq = callsThatHappened.map((c) => c.id).filter(Boolean);
  if (callIdsForDq.length > 0) {
    const allRows = [];
    for (let i = 0; i < callIdsForDq.length; i += 200) {
      const { data } = await supabase.from("outcome_log").select("id, outcome, call_id").in("call_id", callIdsForDq.slice(i, i + 200));
      allRows.push(...(data || []));
    }
    const latest = new Map();
    allRows.forEach((row) => {
      const key = String(row.call_id);
      const existing = latest.get(key);
      if (!existing || row.id > existing.id) latest.set(key, row);
    });
    const callsById = new Map(callsThatHappened.map((c) => [String(c.id), c]));
    latest.forEach((row) => {
      if (String(row.outcome || "").trim().toLowerCase() !== "dont_qualify") return;
      const call = callsById.get(String(row.call_id));
      if (!call || !isTrue(call.showed_up) || !call.closers) return;
      const cid = call.closers.id;
      if (!closerStats[cid]) closerStats[cid] = { id: cid, name: call.closers.name, showedUp: 0, confirmed: 0, purchased: 0, pif: 0, payoffs: 0, dontQualify: 0, noShows: 0, recovered: 0 };
      closerStats[cid].dontQualify += 1;
    });
  }

  Object.values(sourceStats).forEach(finalizeRates);
  Object.values(mediumStats).forEach(finalizeRates);
  Object.values(countryStats).forEach(finalizeRates);
  Object.values(countrySourceStats).forEach((pair) => {
    finalizeRates(pair.ads);
    finalizeRates(pair.organic);
  });

  const closers = Object.values(closerStats).map((c) => ({
    ...c,
    conversionRate: pct(c.purchased, c.showedUp),
    showUpRate: pct(c.showedUp, c.confirmed),
    pifRate: pct(c.pif, c.purchased),
    closerDqRate: pct(c.dontQualify, c.showedUp),
    recoveryRate: pct(c.recovered, c.noShows),
  }));
  const setters = Object.values(setterStats).map((s) => ({
    ...s,
    pickUpRate: pct(s.pickedUpFromBookings, s.bookingsMadeInPeriod),
    showUpRate: pct(s.totalShowedUp, s.totalConfirmed),
    conversionRate: pct(s.totalPurchased, s.totalShowedUp),
  }));

  return {
    startUTC,
    endUTC,
    headline,
    bookingsPerDay: addBookingsPerDay(bookingsData, startUTC, endUTC),
    closers,
    setters,
    countries: Object.values(countryStats).sort((a, b) => b.totalPurchased - a.totalPurchased),
    sourceStats,
    mediumStats,
    countrySourceStats,
    raw: { bookedCalls, purchasedCalls, bookingsData },
  };
}

async function fetchRevenueSummary(startDate, endDate) {
  const { startUTC, endUTC } = normalizeRange(startDate, endDate);
  const rows = await fetchAllPages(() =>
    supabase
      .from("kajabi_transactions")
      .select("amount_in_cents, action, state, created_at_kajabi")
      .gte("created_at_kajabi", startUTC.toISOString())
      .lte("created_at_kajabi", endUTC.toISOString())
  );

  return rows.reduce(
    (acc, row) => {
      const action = String(row.action || (Number(row.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
      const state = String(row.state || "").toLowerCase();
      const isFailed = action === "dispute" || (row.state != null && !SUCCESS_STATES.has(state));
      const amount = Math.abs(Number(row.amount_in_cents || 0));
      if (isFailed) return acc;
      if (action === "refund" || Number(row.amount_in_cents || 0) < 0) acc.refundsCents += amount;
      else acc.grossCents += amount;
      acc.netCents = acc.grossCents - acc.refundsCents;
      return acc;
    },
    { grossCents: 0, refundsCents: 0, netCents: 0 }
  );
}

function comparisonRow(label, data) {
  const h = data?.headline || {};
  const organic = data?.sourceStats?.organic || {};
  const ads = data?.sourceStats?.ads || {};
  return {
    period: label,
    bookingsMade: h.bookingsMadeInPeriod || 0,
    booked: h.totalBooked || 0,
    showedUp: h.totalShowedUp || 0,
    purchased: h.totalPurchased || 0,
    pickUpRate: round1(h.pickUpRate || 0),
    confirmationRate: round1(h.confirmationRate || 0),
    showUpRate: round1(h.showUpRateConfirmed || h.showUpRate || 0),
    conversionRate: round1(h.conversionRate || 0),
    successRate: round1(h.successRate || 0),
    dqRate: round1(h.dqRate || 0),
    recoveryRate: round1(h.recoveryRate || 0),
    organic: {
      bookingsMade: organic.bookingsMadeInPeriod || 0,
      showedUp: organic.totalShowedUp || 0,
      purchased: organic.totalPurchased || 0,
      pickUpRate: round1(organic.pickUpRate || 0),
      confirmationRate: round1(organic.confirmationRate || 0),
      showUpRate: round1(organic.showUpRateConfirmed || organic.showUpRate || 0),
      conversionRate: round1(organic.conversionRate || 0),
      successRate: round1(organic.successRate || 0),
      dqRate: round1(organic.dqRate || 0),
      recoveryRate: round1(organic.recoveryRate || 0),
    },
    ads: {
      bookingsMade: ads.bookingsMadeInPeriod || 0,
      showedUp: ads.totalShowedUp || 0,
      purchased: ads.totalPurchased || 0,
      pickUpRate: round1(ads.pickUpRate || 0),
      confirmationRate: round1(ads.confirmationRate || 0),
      showUpRate: round1(ads.showUpRateConfirmed || ads.showUpRate || 0),
      conversionRate: round1(ads.conversionRate || 0),
      successRate: round1(ads.successRate || 0),
      dqRate: round1(ads.dqRate || 0),
      recoveryRate: round1(ads.recoveryRate || 0),
    },
  };
}

async function fetchComparisonSeries(kind, dailyDays = 30) {
  const ranges = [];
  const now = new Date();
  if (kind === "daily") {
    DateHelpers.getLastDaysUTC(dailyDays).forEach((dateStr) => {
      const { dayStart, dayEnd } = DateHelpers.getDayBoundsUTC(dateStr);
      ranges.push({
        label: dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }),
        start: DateHelpers.formatDateUTCStart(dayStart),
        end: DateHelpers.formatDateUTCEnd(dayEnd),
      });
    });
  } else if (kind === "weekly") {
    const { weekStart: currentWeek } = DateHelpers.getWeekBoundsUTC(now);
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(currentWeek);
      d.setUTCDate(d.getUTCDate() - i * 7);
      const { weekStart, weekEnd } = DateHelpers.getWeekBoundsUTC(d);
      ranges.push({
        label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        start: DateHelpers.formatDateUTCStart(weekStart),
        end: DateHelpers.formatDateUTCEnd(weekEnd),
      });
    }
  } else {
    const startYear = 2024;
    const startMonth = 6;
    const totalMonths = (now.getUTCFullYear() - startYear) * 12 + (now.getUTCMonth() - startMonth) + 1;
    for (let i = Math.max(0, totalMonths - 12); i < totalMonths; i += 1) {
      const year = startYear + Math.floor((startMonth + i) / 12);
      const month = (startMonth + i) % 12;
      const monthDate = new Date(Date.UTC(year, month, 15));
      const range = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
      ranges.push({
        label: monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
        start: DateHelpers.formatDateUTCStart(range.startDate),
        end: DateHelpers.formatDateUTCEnd(range.endDate),
      });
    }
  }

  const results = await Promise.all(ranges.map((range) => fetchStatsData(range.start, range.end).catch(() => null)));
  return results.map((data, index) => comparisonRow(ranges[index].label, data));
}

async function fetchTeamLists() {
  const [settersRes, closersRes] = await Promise.all([
    supabase.from("setters").select("id, name").eq("active", true).order("name"),
    supabase.from("closers").select("id, name").eq("active", true).order("name"),
  ]);
  return {
    setters: settersRes.data || [],
    closers: closersRes.data || [],
  };
}

async function fetchKajabiPurchasesForDateRange(startDate, endDate) {
  const { lockInKajabiId, payoffKajabiId } = await getSpecialOfferKajabiIds();
  const { startUTC, endUTC } = normalizeRange(startDate, endDate);
  const createdAtGt = startUTC.toISOString();
  const createdAtLt = new Date(endUTC.getTime() + 1).toISOString();

  const allInRange = [];
  let page = 1;
  while (page <= 50) {
    const result = await fetchKajabiPurchases({ page, perPage: 200, sort: "-created_at", createdAtGt, createdAtLt });
    const data = result.data || [];
    allInRange.push(...data);
    if (data.length < 200) break;
    page += 1;
  }
  if (allInRange.length === 0) return { purchases: [], lockInKajabiId, payoffKajabiId };

  const customerIds = [...new Set(allInRange.map((p) => p.relationships?.customer?.data?.id).filter(Boolean).map(String))];
  const offerIds = [...new Set(allInRange.map((p) => p.relationships?.offer?.data?.id).filter(Boolean).map(String))];
  const purchaseIds = allInRange.map((p) => String(p.id));

  const offerMap = {};
  const { data: offersList } = await listOffers({ page: 1, perPage: 100 }).catch(() => ({ data: [] }));
  (offersList || []).forEach((offer) => {
    if (offer?.id) offerMap[String(offer.id)] = offer.internal_title ?? offer.id;
  });
  await Promise.all(
    offerIds.filter((id) => !offerMap[id]).map(async (id) => {
      const offer = await fetchOffer(id).catch(() => null);
      offerMap[id] = offer?.internal_title ?? offer?.attributes?.internal_title ?? id;
    })
  );

  const customerMap = {};
  const { data: customersList } = await listCustomers({ page: 1, perPage: 500, sort: "-created_at" }).catch(() => ({ data: [] }));
  (customersList || []).forEach((customer) => {
    if (customer?.id) customerMap[String(customer.id)] = { name: customer.name ?? null, email: customer.email ?? null, contact_id: customer.contact_id ?? null };
  });
  await Promise.all(
    customerIds.filter((id) => !customerMap[id]).map(async (id) => {
      const customer = await fetchKajabiCustomer(id).catch(() => ({ name: null, email: null, contact_id: null }));
      customerMap[id] = customer;
    })
  );

  const purchaseToTxIds = {};
  const allTxIds = new Set();
  allInRange.forEach((purchase) => {
    const ids = (purchase.relationships?.transactions?.data || []).map((tx) => tx.id).filter(Boolean).map(String);
    purchaseToTxIds[String(purchase.id)] = ids;
    ids.forEach((id) => allTxIds.add(id));
  });
  const txById = {};
  const { data: txList } = await fetchTransactions({ page: 1, perPage: 200, sort: "-created_at" }).catch(() => ({ data: [] }));
  (txList || []).forEach((tx) => {
    if (!tx?.id) return;
    txById[String(tx.id)] = { amount_in_cents: tx.amount_in_cents ?? tx.attributes?.amount_in_cents, currency: tx.currency || tx.attributes?.currency || "USD" };
  });
  await Promise.all(
    [...allTxIds].filter((id) => !txById[id]).map(async (id) => {
      const tx = await fetchTransaction(id).catch(() => null);
      if (tx) txById[id] = { amount_in_cents: tx.amount_in_cents, currency: tx.currency || "USD" };
    })
  );

  const [overrideRes, outcomeRes, leadsRes] = await Promise.all([
    supabase.from("purchase_treatment_override").select("kajabi_purchase_id, treatment").in("kajabi_purchase_id", purchaseIds),
    supabase
      .from("outcome_log")
      .select("id, outcome, purchase_date, closer_id, setter_id, call_id, kajabi_purchase_id, kajabi_payoff_id, PIF, closers(id, name), setters(id, name), calls!closer_notes_call_id_fkey(lead_id)")
      .or(`kajabi_purchase_id.in.(${purchaseIds.join(",")}),kajabi_payoff_id.in.(${purchaseIds.join(",")})`),
    customerIds.length ? supabase.from("leads").select("id, customer_id").in("customer_id", customerIds) : Promise.resolve({ data: [] }),
  ]);

  const overrides = {};
  (overrideRes.data || []).forEach((row) => {
    if (row.kajabi_purchase_id && ["purchase", "lock_in", "payoff"].includes(row.treatment)) overrides[String(row.kajabi_purchase_id)] = row.treatment;
  });
  const leadByCustomer = {};
  (leadsRes.data || []).forEach((row) => {
    if (row.customer_id != null) leadByCustomer[String(row.customer_id)] = row.id;
  });
  const outcomeByPurchase = {};
  (outcomeRes.data || []).forEach((row) => {
    const payload = {
      outcome_log_id: row.id,
      outcome: row.outcome,
      closer_id: row.closer_id ?? row.closers?.id ?? null,
      closer_name: row.closers?.name ?? "x",
      setter_id: row.setter_id ?? row.setters?.id ?? null,
      setter_name: row.setters?.name ?? "x",
      lead_id: row.calls?.lead_id ?? null,
      PIF: row.PIF,
    };
    if (row.kajabi_purchase_id != null) outcomeByPurchase[String(row.kajabi_purchase_id)] = payload;
    if (row.kajabi_payoff_id != null) outcomeByPurchase[String(row.kajabi_payoff_id)] = payload;
  });

  const formatAmount = (cents, currency = "USD") => {
    if (cents == null) return "—";
    const value = (Number(cents || 0) / 100).toFixed(2);
    return currency === "USD" ? `$${value}` : `${value} ${currency}`;
  };

  const purchases = allInRange.map((purchase) => {
    const attrs = purchase.attributes || {};
    const purchaseId = String(purchase.id);
    const customerId = purchase.relationships?.customer?.data?.id;
    const offerId = purchase.relationships?.offer?.data?.id;
    const txId = purchaseToTxIds[purchaseId]?.[0];
    const tx = txId ? txById[txId] : null;
    const customer = customerId ? customerMap[String(customerId)] : null;
    const outcome = outcomeByPurchase[purchaseId];
    const amount = tx?.amount_in_cents ?? attrs.amount_in_cents ?? 0;
    const currency = tx?.currency || attrs.currency || "USD";
    const treatment = overrides[purchaseId] || null;
    const linked =
      treatment === "lock_in" ||
      (treatment === "payoff" ? outcome?.PIF === true : treatment === "purchase" ? outcome?.outcome === "yes" : outcome?.outcome === "yes");

    return {
      _rowKey: purchaseId,
      purchase_id: purchaseId,
      customer_id: customerId,
      contact_id: customer?.contact_id ?? null,
      name: customer?.name ?? "—",
      email: customer?.email ?? "—",
      purchase_date: attrs.created_at,
      offer_id: offerId,
      offer_name: offerId ? offerMap[String(offerId)] ?? offerId : "—",
      amount_in_cents: amount,
      currency,
      amount_formatted: formatAmount(amount, currency),
      closer_id: outcome?.closer_id ?? null,
      closer_name: outcome?.closer_name ?? "x",
      setter_id: outcome?.setter_id ?? null,
      setter_name: outcome?.setter_name ?? "x",
      lead_id: outcome?.lead_id ?? (customerId ? leadByCustomer[String(customerId)] : null) ?? null,
      treatment_override: treatment,
      isLinkedToOutcome: linked,
    };
  });

  purchases.sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date));
  return { purchases, lockInKajabiId, payoffKajabiId };
}

export function getRangePresetDates(preset) {
  const now = new Date();
  if (preset === "today") {
    const { dayStart, dayEnd } = DateHelpers.getDayBoundsUTC(now);
    return { start: DateHelpers.formatDateUTCStart(dayStart), end: DateHelpers.formatDateUTCEnd(dayEnd) };
  }
  if (preset === "thisWeek") {
    const { weekStart } = DateHelpers.getWeekBoundsUTC(now);
    return { start: DateHelpers.formatDateUTCStart(weekStart), end: DateHelpers.formatDateUTCEnd(now) };
  }
  if (preset === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: DateHelpers.formatDateUTCStart(weekStart), end: DateHelpers.formatDateUTCEnd(weekEnd) };
  }
  if (preset === "lastMonth") {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const range = DateHelpers.getMonthRangeInTimezone(prev, DateHelpers.DEFAULT_TIMEZONE);
    return { start: DateHelpers.formatDateUTCStart(range.startDate), end: DateHelpers.formatDateUTCEnd(range.endDate) };
  }
  if (preset === "mtd") {
    const range = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
    return { start: DateHelpers.formatDateUTCStart(range.startDate), end: DateHelpers.formatDateUTCEnd(now) };
  }
  return null;
}

export function getQuickRangeDates(preset) {
  const now = new Date();
  if (preset === "last7" || preset === "last14" || preset === "last30" || preset === "last90") {
    const days = DateHelpers.getLastDaysUTC(Number(preset.replace("last", "")));
    const { dayStart } = DateHelpers.getDayBoundsUTC(days[0]);
    return { start: DateHelpers.formatDateUTCStart(dayStart), end: DateHelpers.formatDateUTCEnd(now) };
  }
  if (preset === "previousMonth") return getRangePresetDates("lastMonth");
  if (preset === "currentMonth") return getRangePresetDates("mtd");
  if (preset === "thisWeek" || preset === "lastWeek") return getRangePresetDates(preset);
  return null;
}

export function useManagementMetricsData() {
  const initialRange = useMemo(() => getRangePresetDates("mtd"), []);
  const [rangePreset, setRangePreset] = useState("mtd");
  const [quickPreset, setQuickPreset] = useState("currentMonth");
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [stats, setStats] = useState(null);
  const [revenueSummary, setRevenueSummary] = useState({ grossCents: 0, refundsCents: 0, netCents: 0 });
  const [purchases, setPurchases] = useState([]);
  const [specialOfferIds, setSpecialOfferIds] = useState({ lockInKajabiId: null, payoffKajabiId: null });
  const [teamLists, setTeamLists] = useState({ setters: [], closers: [] });
  const [comparisonKind, setComparisonKind] = useState("daily");
  const [comparisonDays, setComparisonDays] = useState(30);
  const [comparisonSeries, setComparisonSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState("");

  const periodLabel = useMemo(() => {
    const fmt = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parseDateAsUTC(value));
    const s = fmt(startDate);
    const e = fmt(endDate);
    return s === e ? s : `${s} - ${e}`;
  }, [startDate, endDate]);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextStats, nextRevenue] = await Promise.all([
        fetchStatsData(startDate, endDate),
        fetchRevenueSummary(startDate, endDate),
      ]);
      setStats(nextStats);
      setRevenueSummary(nextRevenue);
    } catch (err) {
      console.error("[management metrics] failed to load stats", err);
      setError(err?.message || "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const loadPurchases = useCallback(async () => {
    setPurchaseLoading(true);
    try {
      const result = await fetchKajabiPurchasesForDateRange(startDate, endDate);
      setPurchases(result.purchases || []);
      setSpecialOfferIds({ lockInKajabiId: result.lockInKajabiId, payoffKajabiId: result.payoffKajabiId });
    } catch (err) {
      console.error("[management metrics] failed to load purchases", err);
      setPurchases([]);
    } finally {
      setPurchaseLoading(false);
    }
  }, [startDate, endDate]);

  const loadComparison = useCallback(async () => {
    setComparisonLoading(true);
    try {
      setComparisonSeries(await fetchComparisonSeries(comparisonKind, comparisonDays));
    } catch (err) {
      console.error("[management metrics] failed to load comparison", err);
      setComparisonSeries([]);
    } finally {
      setComparisonLoading(false);
    }
  }, [comparisonKind, comparisonDays]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  useEffect(() => {
    fetchTeamLists().then(setTeamLists).catch(() => setTeamLists({ setters: [], closers: [] }));
  }, []);

  const applyRangePreset = useCallback((preset) => {
    const range = getRangePresetDates(preset);
    setRangePreset(preset);
    if (range) {
      setStartDate(range.start);
      setEndDate(range.end);
      setQuickPreset(preset === "mtd" ? "currentMonth" : "");
    }
  }, []);

  const applyQuickPreset = useCallback((preset) => {
    const range = getQuickRangeDates(preset);
    setQuickPreset(preset);
    setRangePreset("custom");
    if (range) {
      setStartDate(range.start);
      setEndDate(range.end);
    }
  }, []);

  const applyMonth = useCallback((monthKey) => {
    if (!monthKey) return;
    const [year, month] = monthKey.split("-").map(Number);
    const range = DateHelpers.getMonthRangeInTimezone(new Date(Date.UTC(year, month - 1, 15)), DateHelpers.DEFAULT_TIMEZONE);
    setQuickPreset("month");
    setRangePreset("custom");
    setStartDate(DateHelpers.formatDateUTCStart(range.startDate));
    setEndDate(DateHelpers.formatDateUTCEnd(range.endDate));
  }, []);

  const shiftWeek = useCallback((offset) => {
    const currentStart = parseDateAsUTC(startDate);
    const { weekStart } = DateHelpers.getWeekBoundsUTC(currentStart);
    weekStart.setUTCDate(weekStart.getUTCDate() + offset * 7);
    const { weekStart: nextStart, weekEnd: nextEnd } = DateHelpers.getWeekBoundsUTC(weekStart);
    setRangePreset("custom");
    setQuickPreset("");
    setStartDate(DateHelpers.formatDateUTCStart(nextStart));
    setEndDate(DateHelpers.formatDateUTCEnd(nextEnd));
  }, [startDate]);

  const setCustomStart = useCallback((value) => {
    setRangePreset("custom");
    setQuickPreset("");
    setStartDate(`${value}T00:00:00.000Z`);
  }, []);

  const setCustomEnd = useCallback((value) => {
    setRangePreset("custom");
    setQuickPreset("");
    setEndDate(`${value}T23:59:59.999Z`);
  }, []);

  const saveTreatmentOverride = useCallback(async (purchaseId, treatment) => {
    if (!purchaseId) return;
    if (treatment == null) await supabase.from("purchase_treatment_override").delete().eq("kajabi_purchase_id", String(purchaseId));
    else await supabase.from("purchase_treatment_override").upsert({ kajabi_purchase_id: String(purchaseId), treatment }, { onConflict: "kajabi_purchase_id" });
    await loadPurchases();
  }, [loadPurchases]);

  return {
    comparisonDays,
    comparisonKind,
    comparisonLoading,
    comparisonSeries,
    endDate,
    error,
    loading,
    periodLabel,
    purchaseLoading,
    purchases,
    quickPreset,
    rangePreset,
    revenueSummary,
    specialOfferIds,
    startDate,
    stats,
    teamLists,
    actions: {
      applyMonth,
      applyQuickPreset,
      applyRangePreset,
      loadComparison,
      refresh: () => {
        loadCore();
        loadPurchases();
      },
      saveTreatmentOverride,
      setComparisonDays,
      setComparisonKind,
      setCustomEnd,
      setCustomStart,
      shiftWeek,
    },
  };
}
