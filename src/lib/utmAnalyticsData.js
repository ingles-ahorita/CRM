import { parseISO } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { supabase } from "./supabaseClient";
import * as DateHelpers from "../utils/dateHelpers";

/** Recharts palette — management Organic tab */
export const UTM_ANALYTICS_CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#facc15",
  "#ef4444",
];

// Parse date string as UTC (matches SQL date_trunc behavior; consistent with generalStats/closerStats)
export function parseDateAsUTC(dateString) {
  if (!dateString) return null;
  const hasTimezone =
    typeof dateString === "string" &&
    (dateString.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(dateString));
  const isoString = hasTimezone ? dateString : dateString + "Z";
  return parseISO(isoString);
}

export function isAdsSource(sourceType) {
  if (!sourceType) return false;
  const lower = String(sourceType).toLowerCase();
  return lower.includes("ad") || lower.includes("ads");
}

/**
 * @param {string} startDate
 * @param {string} endDate
 * @param {{ sourceFilter?: string | null }} [options] — case-insensitive match on utm_source; empty = all
 */
export async function fetchUTMAnalytics(startDate, endDate, options = {}) {
  const sourceFilter =
    options.sourceFilter != null && String(options.sourceFilter).trim() !== ""
      ? String(options.sourceFilter).trim().toLowerCase()
      : null;

  const startDateObj = parseDateAsUTC(startDate);
  const endDateObj = parseDateAsUTC(endDate);
  if (!startDateObj || !endDateObj) {
    return {
      pieData: [],
      organicDaily: [],
      totalOrganicCalls: 0,
      totalPurchases: 0,
      mediumBySource: [],
      campaignData: [],
      conversionByPlatform: [],
      conversionByCampaign: [],
      bookingsPerDay: [],
      bookingsPerDaySourceKeys: [],
      mediumKeys: [],
    };
  }
  let startUTC;
  let endUTC;
  if (DateHelpers.DEFAULT_TIMEZONE === "UTC") {
    startUTC = new Date(startDateObj);
    startUTC.setUTCHours(0, 0, 0, 0);
    endUTC = new Date(endDateObj);
    endUTC.setUTCHours(23, 59, 59, 999);
  } else {
    const startDateNormalized = DateHelpers.normalizeToTimezone(
      startDateObj,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    const endDateNormalized = DateHelpers.normalizeToTimezone(
      endDateObj,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    const startOfDay = new Date(startDateNormalized);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(endDateNormalized);
    endOfDay.setHours(23, 59, 59, 999);
    startUTC = fromZonedTime(startOfDay, DateHelpers.DEFAULT_TIMEZONE);
    endUTC = fromZonedTime(endOfDay, DateHelpers.DEFAULT_TIMEZONE);
  }
  const startISO = startUTC.toISOString();
  const endISO = endUTC.toISOString();

  const { data: calls, error } = await supabase
    .from("calls")
    .select(`
      id,
      book_date,
      call_date,
      showed_up,
      source_type,
      utm_source,
      utm_medium,
      utm_campaign,
      is_reschedule,
      lead_id
    `)
    .gte("call_date", startISO)
    .lte("call_date", endISO);

  if (error) {
    console.error("Error fetching UTM calls:", error);
    return {
      pieData: [],
      organicDaily: [],
      totalOrganicCalls: 0,
      totalPurchases: 0,
      mediumBySource: [],
      campaignData: [],
      conversionByPlatform: [],
      conversionByCampaign: [],
      bookingsPerDay: [],
      bookingsPerDaySourceKeys: [],
      mediumKeys: [],
    };
  }

  const allCalls = calls || [];

  const rescheduledLeadIds = new Set(
    allCalls.filter((c) => c.is_reschedule === true).map((c) => c.lead_id),
  );

  const dedupedCalls = allCalls.filter((call) => {
    const keepReschedule =
      call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id);
    return keepReschedule;
  });

  const organicCalls = dedupedCalls.filter((call) => !isAdsSource(call.source_type));

  let callsForStats = organicCalls.filter((call) => {
    const sourceIsNull = call.utm_source == null || call.utm_source === undefined;
    if (sourceIsNull && call.is_reschedule === true) return false;
    return true;
  });

  if (sourceFilter) {
    callsForStats = callsForStats.filter((call) => {
      const src = (call.utm_source ?? "unknown").toLowerCase();
      return src === sourceFilter;
    });
  }

  const sourceCounts = {};
  callsForStats.forEach((call) => {
    const src = call.utm_source ?? "Unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  const totalCalls = Object.values(sourceCounts).reduce((sum, v) => sum + v, 0);

  const pieData = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      name: source,
      value: count,
      percentage: totalCalls > 0 ? (count / totalCalls) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const organicDailyMap = {};
  callsForStats.forEach((call) => {
    if (!call.book_date) return;
    const dayKey = new Date(call.book_date).toISOString().slice(0, 10);
    organicDailyMap[dayKey] = (organicDailyMap[dayKey] || 0) + 1;
  });

  const organicDaily = Object.entries(organicDailyMap)
    .map(([date, count]) => ({ date, leads: count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const totalOrganicCalls = callsForStats.length;

  const SOURCES_OF_INTEREST = ["instagram", "facebook", "tiktok", "youtube"];
  const sourceMediumCounts = {};
  const allMediums = new Set();

  callsForStats.forEach((call) => {
    const src = (call.utm_source || "").toLowerCase();
    if (!SOURCES_OF_INTEREST.includes(src)) return;
    const med = call.utm_medium || "Unknown";
    allMediums.add(med);
    if (!sourceMediumCounts[src]) sourceMediumCounts[src] = {};
    sourceMediumCounts[src][med] = (sourceMediumCounts[src][med] || 0) + 1;
  });

  const sourceOrder = ["instagram", "facebook", "tiktok", "youtube"];
  const mediumBySource = sourceOrder
    .filter((src) => sourceMediumCounts[src])
    .map((source) => {
      const mediums = sourceMediumCounts[source];
      const rowTotal = Object.values(mediums).reduce((s, v) => s + v, 0);
      const row = {
        source: source.charAt(0).toUpperCase() + source.slice(1),
        total: rowTotal,
      };
      allMediums.forEach((med) => {
        row[med] = mediums[med] || 0;
      });
      return row;
    });

  const campaignCounts = {};
  callsForStats.forEach((call) => {
    const c = call.utm_campaign || "Unknown";
    campaignCounts[c] = (campaignCounts[c] || 0) + 1;
  });
  const campaignTotal = Object.values(campaignCounts).reduce((s, v) => s + v, 0);
  const campaignData = Object.entries(campaignCounts)
    .map(([name, value]) => ({
      name: name.length > 20 ? name.slice(0, 18) + "…" : name,
      fullName: name,
      value,
      percentage: campaignTotal > 0 ? (value / campaignTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  const { data: outcomeLogs } = await supabase
    .from("outcome_log")
    .select(`
      outcome,
      clawback,
      call_id,
      calls!inner!call_id (
        id,
        utm_source,
        utm_campaign,
        source_type,
        is_reschedule
      )
    `)
    .gte("purchase_date", startISO)
    .lte("purchase_date", endISO)
    .in("outcome", ["yes", "refund"]);

  const bookingsBySource = {};
  const bookingsByCampaign = {};
  callsForStats.forEach((call) => {
    const src = call.utm_source ?? "Unknown";
    const camp = call.utm_campaign ?? "Unknown";
    bookingsBySource[src] = (bookingsBySource[src] || 0) + 1;
    bookingsByCampaign[camp] = (bookingsByCampaign[camp] || 0) + 1;
  });

  const outcomeLogsByCallId = new Map();
  (outcomeLogs || []).forEach((log) => {
    if (!log.calls?.id) return;
    const existing = outcomeLogsByCallId.get(log.calls.id);
    if (!existing || log.id > existing.id) outcomeLogsByCallId.set(log.calls.id, log);
  });

  const purchasesBySource = {};
  const purchasesByCampaign = {};
  let totalPurchases = 0;
  outcomeLogsByCallId.forEach((log) => {
    const call = log.calls;
    if (!call) return;
    if (isAdsSource(call.source_type)) return;
    const sourceIsNull = call.utm_source == null || call.utm_source === undefined;
    if (sourceIsNull && call.is_reschedule === true) return;
    if (sourceFilter) {
      const src = (call.utm_source ?? "unknown").toLowerCase();
      if (src !== sourceFilter) return;
    }
    const isPurchase =
      log.outcome === "yes" || (log.outcome === "refund" && (log.clawback ?? 100) < 100);
    if (!isPurchase) return;
    totalPurchases += 1;
    const src = call.utm_source ?? "Unknown";
    const camp = call.utm_campaign ?? "Unknown";
    purchasesBySource[src] = (purchasesBySource[src] || 0) + 1;
    purchasesByCampaign[camp] = (purchasesByCampaign[camp] || 0) + 1;
  });

  const allSources = new Set([...Object.keys(bookingsBySource), ...Object.keys(purchasesBySource)]);
  const conversionByPlatform = Array.from(allSources)
    .map((name) => {
      const bookings = bookingsBySource[name] || 0;
      const purchases = purchasesBySource[name] || 0;
      return {
        name: name.length > 18 ? name.slice(0, 16) + "…" : name,
        fullName: name,
        bookings,
        purchases,
        conversionRate: bookings > 0 ? (purchases / bookings) * 100 : 0,
      };
    })
    .sort((a, b) => b.conversionRate - a.conversionRate);

  const allCampaigns = new Set([...Object.keys(bookingsByCampaign), ...Object.keys(purchasesByCampaign)]);
  const conversionByCampaign = Array.from(allCampaigns)
    .map((name) => {
      const bookings = bookingsByCampaign[name] || 0;
      const purchases = purchasesByCampaign[name] || 0;
      return {
        name: name.length > 18 ? name.slice(0, 16) + "…" : name,
        fullName: name,
        bookings,
        purchases,
        conversionRate: bookings > 0 ? (purchases / bookings) * 100 : 0,
      };
    })
    .sort((a, b) => b.conversionRate - a.conversionRate);

  const { data: bookingCalls } = await supabase
    .from("calls")
    .select("id, book_date, utm_source, source_type, is_reschedule, lead_id")
    .gte("book_date", startISO)
    .lte("book_date", endISO);

  const organicBookingCalls = (bookingCalls || []).filter((c) => !isAdsSource(c.source_type));
  const rescheduledLeadIdsBookings = new Set(
    organicBookingCalls.filter((c) => c.is_reschedule === true).map((c) => c.lead_id),
  );
  let dedupedBookings = organicBookingCalls.filter((call) => {
    const keepReschedule =
      call.is_reschedule === true || !rescheduledLeadIdsBookings.has(call.lead_id);
    return keepReschedule;
  });
  let bookingsForChart = dedupedBookings.filter((call) => {
    const sourceIsNull = call.utm_source == null || call.utm_source === undefined;
    if (sourceIsNull && call.is_reschedule === true) return false;
    return true;
  });

  if (sourceFilter) {
    bookingsForChart = bookingsForChart.filter((call) => {
      const src = (call.utm_source ?? "unknown").toLowerCase();
      return src === sourceFilter;
    });
  }

  const tz = DateHelpers.DEFAULT_TIMEZONE;
  const dayBuckets = {};
  bookingsForChart.forEach((booking) => {
    if (!booking.book_date) return;
    const source = booking.utm_source ?? "Unknown";
    if (isAdsSource(source)) return;
    const dayKey = formatInTimeZone(
      parseISO(booking.book_date.includes("Z") ? booking.book_date : booking.book_date + "Z"),
      tz,
      "yyyy-MM-dd",
    );
    if (!dayBuckets[dayKey]) dayBuckets[dayKey] = {};
    dayBuckets[dayKey][source] = (dayBuckets[dayKey][source] || 0) + 1;
  });
  const allSourceKeys = new Set();
  Object.values(dayBuckets).forEach((b) => Object.keys(b).forEach((k) => allSourceKeys.add(k)));
  const sourceKeysSorted = Array.from(allSourceKeys).sort();
  const chartSourceKeys = sourceKeysSorted.length > 0 ? sourceKeysSorted : ["Organic"];
  const chartStart = parseISO(startISO);
  const chartEnd = parseISO(endISO);
  const allDays = [];
  const cursor = new Date(chartStart);
  while (cursor <= chartEnd) {
    const dayKey = formatInTimeZone(cursor, tz, "yyyy-MM-dd");
    allDays.push(dayKey);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const bookingsPerDay = allDays.map((date) => {
    const b = dayBuckets[date] || {};
    let total = 0;
    const row = { date };
    chartSourceKeys.forEach((source) => {
      const count =
        source === "Organic" && sourceKeysSorted.length === 0
          ? Object.values(b).reduce((s, n) => s + n, 0)
          : b[source] || 0;
      row[source] = count;
      total += count;
    });
    row.total = total;
    return row;
  });

  return {
    pieData,
    organicDaily,
    totalOrganicCalls,
    totalPurchases,
    mediumBySource,
    campaignData,
    mediumKeys: Array.from(allMediums),
    conversionByPlatform,
    conversionByCampaign,
    bookingsPerDay,
    bookingsPerDaySourceKeys: chartSourceKeys,
  };
}

export function getLast12MonthsForUtmAnalytics() {
  const now = new Date();
  const list = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    list.push({
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      year: y,
      month: m,
    });
  }
  return list;
}
