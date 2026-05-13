import { useEffect, useMemo, useRef, useState } from "react";
import {
  Instagram,
  Link,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Youtube,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import WorldMap from "react-svg-worldmap";
import { supabase } from "../../../../lib/supabaseClient";
import { getCountryFromPhone } from "../../../../utils/phoneNumberParser";

const FILTER_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "thisWeek", label: "This Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "mtd", label: "MTD" },
  { id: "last30", label: "Last 30d" },
];

const COUNTRY_FLAGS = {
  AR: "🇦🇷",
  BR: "🇧🇷",
  CO: "🇨🇴",
  EC: "🇪🇨",
  ES: "🇪🇸",
  MX: "🇲🇽",
  OTHER: "🌐",
  TR: "🇹🇷",
  US: "🇺🇸",
};

const performanceDataCache = new Map();
const SUPABASE_QUERY_TIMEOUT_MS = 12000;
const COUNTRY_NAME_BY_CODE = {
  AR: "Argentina",
  BO: "Bolivia",
  BR: "Brazil",
  CO: "Colombia",
  DO: "Dominican Republic",
  EC: "Ecuador",
  ES: "Spain",
  MX: "Mexico",
  TR: "Türkiye",
  US: "United States",
  VE: "Venezuela",
  OTHER: "Other",
};

const COUNTRY_CODE_BY_NAME = Object.entries(COUNTRY_NAME_BY_CODE).reduce((acc, [code, name]) => {
  acc[name.toLowerCase()] = code;
  return acc;
}, {
  "united states of america": "US",
  "usa": "US",
  "turkey": "TR",
  "türkiye": "TR",
  "venezuela": "VE",
  "dominican republic": "DO",
});

function cx ( ...classes ) {
  return classes.filter( Boolean ).join( " " );
}

function formatInt(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n || 0));
}

function formatPct(n, digits = 1) {
  const v = Number(n || 0);
  return `${v.toFixed(digits)}%`;
}

function formatUsd(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));
}

function secondsToClock(seconds) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(Number(seconds)));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function sourceIcon(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("instagram")) return Instagram;
  if (lower.includes("youtube")) return Youtube;
  if (lower.includes("meta") || lower.includes("facebook")) return Target;
  if (lower.includes("google")) return Search;
  return Link;
}

function countryFlag(code) {
  const normalized = String(code || "").toUpperCase();
  if (COUNTRY_FLAGS[normalized]) return COUNTRY_FLAGS[normalized];
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  return String.fromCodePoint(...[...normalized].map((char) => 0x1f1e6 - 65 + char.charCodeAt(0)));
}

function normalizeGaSource(rawSource) {
  const raw = String(rawSource || "Unknown");
  const lower = raw.toLowerCase();
  if (lower === "(direct)" || lower.includes("direct")) return "Direct / Referral";
  if (lower.includes("instagram") || lower === "ig") return "Instagram (Organic)";
  if (lower.includes("youtube") || lower === "yt") return "YouTube (Organic)";
  if (lower.includes("facebook") || lower.includes("meta") || lower === "fb") return "Meta Ads";
  if (lower.includes("google")) return "Google Ads";
  return raw;
}

async function fetchPerformanceData(range, timezone) {
  const cacheKey = `${range}:${timezone}`;
  const cached = performanceDataCache.get(cacheKey);

  if (cached) return cached;

  const request = buildPerformanceData(range, timezone).catch((error) => {
    performanceDataCache.delete(cacheKey);
    throw error;
  });

  performanceDataCache.set(cacheKey, request);
  return request;
}

async function fetchSectionData(section, range, timezone) {
  const data = await fetchPerformanceData(range, timezone);
  return {
    meta: data.meta,
    [section]: data[section] || null,
  };
}

async function runSupabaseQuery(queryFactory, label) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SUPABASE_QUERY_TIMEOUT_MS);

  try {
    const result = await queryFactory().abortSignal(controller.signal);
    if (result?.error) {
      console.warn(`[performance] ${label} query failed:`, result.error);
      return [];
    }
    return result?.data || [];
  } catch (error) {
    if (error?.name === "AbortError") {
      console.warn(`[performance] ${label} query timed out after ${SUPABASE_QUERY_TIMEOUT_MS}ms`);
      return [];
    }
    console.warn(`[performance] ${label} query failed:`, error);
    return [];
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function buildPerformanceData(range, timezone) {
  const now = new Date();
  const localStartOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const localEndOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const startOfWeekMonday = (d) => {
    const copy = new Date(d);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return localStartOfDay(copy);
  };
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

  let start = localStartOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
  let end = localEndOfDay(now);
  if (range === "today") {
    start = localStartOfDay(now);
    end = localEndOfDay(now);
  } else if (range === "thisWeek") {
    start = startOfWeekMonday(now);
    end = localEndOfDay(now);
  } else if (range === "thisMonth") {
    start = startOfMonth(now);
    end = endOfMonth(now);
  } else if (range === "mtd") {
    start = startOfMonth(now);
    end = localEndOfDay(now);
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  const fetchGa = async (params) => {
    try {
      const res = await fetch(`/api/google-analytics?${new URLSearchParams({ startDate, endDate, ...params }).toString()}`);
      const json = await res.json().catch(() => ({}));
      return res.ok ? json : { rows: [] };
    } catch {
      return { rows: [] };
    }
  };

  const emptyGa = { rows: [] };
  const [
    rawCallsByDate,
    rawBookings,
    rawPurchases,
  ] = await Promise.all([
    runSupabaseQuery(
      () => supabase
        .from("calls")
        .select("id, lead_id, phone, source_type, utm_source, utm_medium, utm_campaign, showed_up, confirmed, picked_up, is_reschedule, call_date, leads(phone)")
        .gte("call_date", startIso)
        .lte("call_date", endIso)
        .order("call_date", { ascending: true })
        .limit(5000),
      "calls by call_date",
    ),
    runSupabaseQuery(
      () => supabase
        .from("calls")
        .select("id, lead_id, phone, source_type, utm_source, utm_medium, utm_campaign, picked_up, confirmed, is_reschedule, book_date, leads(phone)")
        .gte("book_date", startIso)
        .lte("book_date", endIso)
        .order("book_date", { ascending: true })
        .limit(5000),
      "calls by book_date",
    ),
    runSupabaseQuery(
      () => supabase
        .from("outcome_log")
        .select(`
          id,
          purchase_date,
          outcome,
          commission,
          offer_id,
          offers!offer_id(price, name),
          calls!inner!closer_notes_call_id_fkey (
            id,
            phone,
            source_type,
            utm_source,
            utm_medium,
            utm_campaign,
            showed_up,
            leads(phone)
          )
        `)
        .eq("outcome", "yes")
        .gte("purchase_date", startIso)
        .lte("purchase_date", endIso)
        .order("purchase_date", { ascending: true })
        .limit(5000),
      "outcome_log purchases",
    ),
  ]);

  const [
    gaFunnelSessionsResult,
    gaWebsiteViewsResult,
    gaCountryViewsResult,
    gaDeviceSessionsResult,
    gaSourceViewsResult,
    gaSourceOptInsResult,
    gaCountryOptInsResult,
    gaDeviceOptInsResult,
    gaLandingSessionsResult,
    gaOptInEventsResult,
    gaVslViewsResult,
    gaVslProgressBreakdownResult,
    gaVideoStartResult,
    gaVideoProgressTotalResult,
    gaVideoCompleteResult,
    gaAvgDurationResult,
  ] = await Promise.allSettled([
    fetchGa({ metric: "sessions", pagePaths: "/ads-new-masterclass-job,/masterclass-job,/ads-opt-in-masterclass,/pro,/" }),
    fetchGa({ pagePath: "/" }),
    fetchGa({ dimensions: "country", metricName: "screenPageViews" }),
    fetchGa({ dimensions: "deviceCategory", metricName: "sessions" }),
    fetchGa({ dimensions: "sessionSource", metricName: "screenPageViews" }),
    fetchGa({ eventName: "call_booked", dimensions: "sessionSource", metricName: "eventCount" }),
    fetchGa({ eventName: "call_booked", dimensions: "country", metricName: "eventCount" }),
    fetchGa({ eventName: "call_booked", dimensions: "deviceCategory", metricName: "eventCount" }),
    fetchGa({ dimensions: "pagePath", metricName: "sessions" }),
    fetchGa({ wholeSite: "1" }),
    fetchGa({ pagePaths: "/ads-new-masterclass-job,/masterclass-job" }),
    fetchGa({ eventName: "video_progress", dimensions: "video_percent", metricName: "eventCount", pagePaths: "/ads-new-masterclass-job,/masterclass-job" }),
    fetchGa({ eventName: "video_start", metricName: "eventCount", pagePaths: "/ads-new-masterclass-job,/masterclass-job" }),
    fetchGa({ eventName: "video_progress", metricName: "eventCount", pagePaths: "/ads-new-masterclass-job,/masterclass-job" }),
    fetchGa({ eventName: "video_complete", metricName: "eventCount", pagePaths: "/ads-new-masterclass-job,/masterclass-job" }),
    fetchGa({ dimensions: "date", metricName: "averageSessionDuration" }),
  ]);

  const resultValue = (result) => result.status === "fulfilled" ? result.value : emptyGa;
  const gaFunnelSessions = resultValue(gaFunnelSessionsResult);
  const gaWebsiteViews = resultValue(gaWebsiteViewsResult);
  const gaCountryViews = resultValue(gaCountryViewsResult);
  const gaDeviceSessions = resultValue(gaDeviceSessionsResult);
  const gaSourceViews = resultValue(gaSourceViewsResult);
  const gaSourceOptIns = resultValue(gaSourceOptInsResult);
  const gaCountryOptIns = resultValue(gaCountryOptInsResult);
  const gaDeviceOptIns = resultValue(gaDeviceOptInsResult);
  const gaLandingSessions = resultValue(gaLandingSessionsResult);
  const gaOptInEvents = resultValue(gaOptInEventsResult);
  const gaVslViews = resultValue(gaVslViewsResult);
  const gaVslProgressBreakdown = resultValue(gaVslProgressBreakdownResult);
  const gaVideoStart = resultValue(gaVideoStartResult);
  const gaVideoProgressTotal = resultValue(gaVideoProgressTotalResult);
  const gaVideoComplete = resultValue(gaVideoCompleteResult);
  const gaAvgDuration = resultValue(gaAvgDurationResult);

  const rescheduledLeadIds = new Set(rawCallsByDate.filter((call) => call.is_reschedule === true).map((call) => call.lead_id));
  const callsByDate = rawCallsByDate.filter((call) => call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id));
  const bookings = rawBookings;
  const purchases = rawPurchases
    .filter((outcomeLog) => outcomeLog.calls?.id)
    .map((outcomeLog) => ({
      ...outcomeLog.calls,
      outcome_log_id: outcomeLog.id,
      purchase_date: outcomeLog.purchase_date,
      outcome: outcomeLog.outcome,
      offer_price: outcomeLog.offers?.price,
    }));

  const sumRows = (rows, key) => (rows || []).reduce((s, r) => s + Number(r?.[key] || 0), 0);
  const sumGaMetric = (rows) => (rows || []).reduce((s, r) => s + Number(r?.metric || 0), 0);
  const sumByPath = (rows, paths) => (rows || []).reduce((total, row) => {
    const byPath = row?.byPath || {};
    return total + paths.reduce((sum, path) => sum + Number(byPath[path] || 0), 0);
  }, 0);
  const websiteViews = sumRows(gaWebsiteViews.rows, "views") || sumRows(gaVslViews.rows, "views");
  const vslWatched = sumByPath(gaFunnelSessions.rows, ["/ads-new-masterclass-job", "/masterclass-job"]);
  const optInsSessions = sumByPath(gaFunnelSessions.rows, ["/ads-opt-in-masterclass", "/pro", "/"]);
  const optInsEvents = sumRows(gaOptInEvents.rows, "eventCount");
  const optIns = optInsEvents > 0 ? optInsEvents : (optInsSessions > 0 ? optInsSessions : bookings.length);
  const optInSource = optInsEvents > 0 ? "GA call_booked" : (optInsSessions > 0 ? "GA opt-in sessions" : "CRM bookings");
  const vslProgressRanges = (gaVslProgressBreakdown.rows || [])
    .map((row) => ({
      percent: Number(String(row?.dimensions?.video_percent || "").replace(/[^0-9.]/g, "")),
      events: Number(row?.metric || 0),
    }))
    .filter((row) => Number.isFinite(row.percent) && row.percent > 0 && row.events > 0)
    .sort((a, b) => a.percent - b.percent);
  const videoStartEvents = sumRows(gaVideoStart.rows, "views");
  const videoProgressEvents = sumRows(gaVideoProgressTotal.rows, "views");
  const videoCompleteEvents = sumRows(gaVideoComplete.rows, "views");
  const vsl50PlusEvents = vslProgressRanges.reduce((sum, row) => sum + (row.percent >= 50 ? row.events : 0), 0);
  const vslCompletionPct = vslWatched > 0 && vsl50PlusEvents > 0
    ? (vsl50PlusEvents / vslWatched) * 100
    : (videoStartEvents > 0 && videoCompleteEvents > 0 ? (videoCompleteEvents / videoStartEvents) * 100 : null);
  const vslFallbackRanges = vslProgressRanges.length ? [] : [
    { label: "Started", events: videoStartEvents },
    { label: "Progress", events: videoProgressEvents },
    { label: "Completed", events: videoCompleteEvents },
  ].filter((row) => row.events > 0);

  const sourceName = (row) => {
    const raw = String(row?.utm_source || row?.source_type || "Unknown");
    return normalizeGaSource(raw);
  };
  const countryCode = (phone) => {
    const c = getCountryFromPhone(phone);
    if (!c || c === "Unknown") return "OTHER";
    return String(c).split("/")[0].toUpperCase();
  };
  const countryName = (code) => COUNTRY_NAME_BY_CODE[code] || code;
  const codeFromCountryName = (name) => {
    const normalized = String(name || "").trim().toLowerCase();
    if (!normalized || normalized === "(not set)") return "OTHER";
    return COUNTRY_CODE_BY_NAME[normalized] || "OTHER";
  };

  const sourceAgg = {};
  const countryAgg = {};
  const ensureSource = (name) => (sourceAgg[name] ||= { name, bookings: 0, shows: 0, closes: 0, revenue: 0, views: 0, gaOptIns: 0 });
  const ensureCountry = (code) => (countryAgg[code] ||= { code, country: countryName(code), crmOptIns: 0, gaOptIns: 0, bookings: 0, shows: 0, closes: 0, revenue: 0, views: 0 });

  bookings.forEach((b) => {
    const s = ensureSource(sourceName(b));
    s.bookings += 1;
    const c = ensureCountry(countryCode(b.phone || b.leads?.phone));
    c.bookings += 1;
    c.crmOptIns += 1;
  });
  callsByDate.forEach((cRow) => {
    const s = ensureSource(sourceName(cRow));
    if (cRow.showed_up) s.shows += 1;
    const c = ensureCountry(countryCode(cRow.phone || cRow.leads?.phone));
    if (cRow.showed_up) c.shows += 1;
  });
  purchases.forEach((p) => {
    const s = ensureSource(sourceName(p));
    s.closes += 1;
    s.revenue += Number(p.offer_price || 0);
    const c = ensureCountry(countryCode(p.phone || p.leads?.phone));
    c.closes += 1;
    c.revenue += Number(p.offer_price || 0);
  });

  (gaSourceViews.rows || []).forEach((r) => {
    const name = normalizeGaSource(r?.dimensions?.sessionSource);
    ensureSource(name).views += Number(r.metric || 0);
  });
  (gaSourceOptIns.rows || []).forEach((r) => {
    const name = normalizeGaSource(r?.dimensions?.sessionSource);
    ensureSource(name).gaOptIns += Number(r.metric || 0);
  });
  if (sumGaMetric(gaSourceViews.rows) === 0) {
    const adsVslViews = sumByPath(gaVslViews.rows, ["/ads-new-masterclass-job"]);
    const organicVslViews = sumByPath(gaVslViews.rows, ["/masterclass-job"]);
    if (adsVslViews > 0) ensureSource("Meta Ads").views += adsVslViews;
    if (organicVslViews > 0) ensureSource("Organic / Direct").views += organicVslViews;
  }
  (gaCountryViews.rows || []).forEach((r) => {
    const rawCountry = String(r?.dimensions?.country || "");
    const code = codeFromCountryName(rawCountry);
    const country = ensureCountry(code);
    country.country = code === "OTHER" && rawCountry ? rawCountry : countryName(code);
    country.views += Number(r.metric || 0);
  });
  (gaCountryOptIns.rows || []).forEach((r) => {
    const rawCountry = String(r?.dimensions?.country || "");
    const code = codeFromCountryName(rawCountry);
    const country = ensureCountry(code);
    country.country = code === "OTHER" && rawCountry ? rawCountry : countryName(code);
    country.gaOptIns += Number(r.metric || 0);
  });

  const hasGaCountryOptIns = sumGaMetric(gaCountryOptIns.rows) > 0;
  const countryRows = Object.values(countryAgg).sort((a, b) => (b.views || b.bookings || b.closes) - (a.views || a.bookings || a.closes)).slice(0, 8).map((r) => {
    const optIns = hasGaCountryOptIns ? r.gaOptIns : r.crmOptIns;
    const viewsToOptIn = r.views > 0 ? (optIns / r.views) * 100 : 0;
    const optInToBook = optIns > 0 ? (r.bookings / optIns) * 100 : 0;
    const bookToShow = r.bookings > 0 ? (r.shows / r.bookings) * 100 : 0;
    const showToClose = r.shows > 0 ? (r.closes / r.shows) * 100 : 0;
    const endToEnd = r.views > 0 ? (r.closes / r.views) * 100 : 0;
    const aov = r.closes > 0 ? r.revenue / r.closes : 0;
    return { ...r, optIns, optInSource: hasGaCountryOptIns ? "GA call_booked by country" : "CRM bookings by phone country", viewsToOptIn, optInToBook, bookToShow, showToClose, endToEnd, aov };
  });

  const trafficRows = Object.values(sourceAgg).sort((a, b) => (b.views || b.revenue) - (a.views || a.revenue)).slice(0, 5).map((r) => {
    const optIns = r.gaOptIns > 0 ? r.gaOptIns : r.bookings;
    return {
      ...r,
      optIns,
      optInSource: r.gaOptIns > 0 ? "GA call_booked" : "CRM bookings",
      optInRate: r.views > 0 ? (optIns / r.views) * 100 : 0,
      closeRate: r.shows > 0 ? (r.closes / r.shows) * 100 : 0,
      conversion: r.views > 0 ? (optIns / r.views) * 100 : 0,
    };
  });

  const deviceCounts = { mobile: 0, desktop: 0, other: 0 };
  const deviceOptIns = { mobile: 0, desktop: 0, other: 0 };
  (gaDeviceSessions.rows || []).forEach((r) => {
    const key = String(r?.dimensions?.deviceCategory || "").toLowerCase();
    const val = Number(r.metric || 0);
    if (key === "mobile") deviceCounts.mobile += val;
    else if (key === "desktop") deviceCounts.desktop += val;
    else deviceCounts.other += val;
  });
  (gaDeviceOptIns.rows || []).forEach((r) => {
    const key = String(r?.dimensions?.deviceCategory || "").toLowerCase();
    const val = Number(r.metric || 0);
    if (key === "mobile") deviceOptIns.mobile += val;
    else if (key === "desktop") deviceOptIns.desktop += val;
    else deviceOptIns.other += val;
  });
  const totalDevice = deviceCounts.mobile + deviceCounts.desktop + deviceCounts.other;

  const rawLanding = (gaLandingSessions.rows || [])
    .map((r) => ({ page: r?.dimensions?.pagePath || "/", sessions: Number(r.metric || 0) }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 4);
  const landingSessionsTotal = rawLanding.reduce((sum, row) => sum + Number(row.sessions || 0), 0);
  const landing = rawLanding.map((r) => ({
    ...r,
    share: landingSessionsTotal > 0 ? (Number(r.sessions || 0) / landingSessionsTotal) * 100 : 0,
  }));

  const avgTimeSec = (gaAvgDuration.rows || []).length > 0 ? sumGaMetric(gaAvgDuration.rows) / gaAvgDuration.rows.length : null;

  const allData = {
    meta: { range, timezone, startDate, endDate },
    topline: {
      websiteViews,
      vslWatched,
      optIns,
      optInSource,
      bookings: bookings.length,
      showClose: purchases.length,
      closedRevenue: purchases.reduce((s, p) => s + Number(p.offer_price || 0), 0),
      watchRate: websiteViews > 0 ? (vslWatched / websiteViews) * 100 : 0,
      optInRate: websiteViews > 0 ? (optIns / websiteViews) * 100 : 0,
      bookRate: optIns > 0 ? (bookings.length / optIns) * 100 : 0,
    },
    country: {
      rows: countryRows,
      mapRanges: [
        { label: "Low", color: "#bfdbfe" },
        { label: "Med", color: "#93c5fd" },
        { label: "High", color: "#60a5fa" },
        { label: "Top", color: "#2563eb" },
      ],
      bestCountries: countryRows.slice().sort((a, b) => (b.optInToBook + b.showToClose) - (a.optInToBook + a.showToClose)).slice(0, 3).map((r) => [r.country, `${formatPct(r.optInToBook)} book rate · ${r.closes} closes`]),
      underCountries: countryRows.slice().sort((a, b) => (a.optInToBook + a.showToClose) - (b.optInToBook + b.showToClose)).slice(0, 3).map((r) => [r.country, `${formatPct(r.optInToBook)} book · ${r.shows} shows`]),
    },
    traffic: { rows: trafficRows },
    funnel: { rows: countryRows },
    device: {
      mobilePct: totalDevice > 0 ? (deviceCounts.mobile / totalDevice) * 100 : 0,
      desktopPct: totalDevice > 0 ? (deviceCounts.desktop / totalDevice) * 100 : 0,
      otherPct: totalDevice > 0 ? (deviceCounts.other / totalDevice) * 100 : 0,
      mobileOptInRate: deviceCounts.mobile > 0 ? (deviceOptIns.mobile / deviceCounts.mobile) * 100 : 0,
      desktopOptInRate: deviceCounts.desktop > 0 ? (deviceOptIns.desktop / deviceCounts.desktop) * 100 : 0,
      otherOptInRate: deviceCounts.other > 0 ? (deviceOptIns.other / deviceCounts.other) * 100 : 0,
      deviceOptInSource: sumGaMetric(gaDeviceOptIns.rows) > 0 ? "GA call_booked by device" : "Unavailable",
      topLandingPages: landing,
    },
    engagement: {
      avgTimeSec,
      vslCompletionPct,
      vslProgressRanges,
      vslFallbackRanges,
      vslProgressUnavailable: !!gaVslProgressBreakdown.unavailable,
      vslProgressHint: gaVslProgressBreakdown.hint,
    },
  };

  return allData;
}

function useSectionData(section, initialRange = "last30") {
  const [range, setRange] = useState(initialRange);
  const [state, setState] = useState({ loading: true, data: null, error: null, meta: null });

  useEffect(() => {
    let cancelled = false;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchSectionData(section, range, timezone)
      .then((json) => {
        if (cancelled) return;
        setState({
          loading: false,
          data: json?.[section] || null,
          error: null,
          meta: json?.meta || null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ loading: false, data: null, error: error.message || "Failed to load", meta: null });
      });

    return () => {
      cancelled = true;
    };
  }, [section, range]);

  return { ...state, range, setRange };
}

function FilterDropdown({ range, setRange }) {
  return (
    <select
      value={range}
      onChange={(e) => setRange(e.target.value)}
      className="h-7 max-w-full shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
      aria-label="Section range"
    >
      {FILTER_OPTIONS.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function SectionBadge ( { children } ) {
  return (
    <span className="inline-flex h-6 min-w-0 max-w-full items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      <span className="truncate">{children}</span>
    </span>
  );
}

function ShimmerBlock({ className = "" }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

function ShimmerText({ className = "" }) {
  return <span className={cx("inline-block animate-pulse rounded bg-slate-200/80 align-middle", className)} />;
}

function TopLineCard ( { card, loading } ) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{card.label}</p>
      <div className={cx( "mt-1.5 text-[21px] font-semibold leading-none tracking-normal", card.valueClass )}>
        {loading ? <ShimmerText className="h-6 w-20" /> : card.value}
      </div>
      <div className="mt-1">
        <span className={cx( "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none", card.badgeClass )}>
          {loading ? <ShimmerText className="h-3 w-16" /> : card.badge}
        </span>
      </div>
      <p className="mt-1 truncate text-[10px] font-medium text-slate-500" title={card.note}>
        {loading ? <ShimmerText className="h-3 w-28" /> : card.note}
      </p>
    </article>
  );
}

function TopLineSection () {
  const { loading, data, range, setRange, meta } = useSectionData("topline");

  const cards = useMemo(() => {
    const source = data || {};
    return [
      {
        label: "Website views",
        value: formatInt(source.websiteViews),
        valueClass: "text-blue-600",
        badge: source.websiteViews > 0 ? `${formatPct(source.optInRate)} opt-in rate` : "—",
        badgeClass: "bg-emerald-100 text-emerald-700",
        note: `Range: ${meta?.startDate || "—"} to ${meta?.endDate || "—"}`,
      },
      {
        label: "VSL watched",
        value: formatInt(source.vslWatched),
        valueClass: "text-indigo-600",
        badge: `${formatPct(source.watchRate)}`,
        badgeClass: "bg-emerald-100 text-emerald-700",
        note: "Sessions on VSL paths",
      },
      {
        label: "Opt-ins",
        value: formatInt(source.optIns),
        valueClass: "text-violet-600",
        badge: `${formatPct(source.optInRate)}`,
        badgeClass: "bg-emerald-100 text-emerald-700",
        note: `${source.optInSource || "GA/CRM"} in selected period`,
      },
      {
        label: "Bookings",
        value: formatInt(source.bookings),
        valueClass: "text-amber-600",
        badge: `${formatPct(source.bookRate)} of opt-ins`,
        badgeClass: "bg-emerald-100 text-emerald-700",
        note: "CRM calls.book_date in selected period",
      },
      {
        label: "Show + close",
        value: formatInt(source.showClose),
        valueClass: "text-emerald-600",
        badge: `${formatUsd(source.closedRevenue)}`,
        badgeClass: "bg-emerald-100 text-emerald-700",
        note: "Closed outcomes + paid_amount",
      },
    ];
  }, [data, meta]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2">
      <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <h1 className="text-[16px] font-semibold tracking-normal text-slate-950">Global Performance</h1>
        <FilterDropdown range={range} setRange={setRange} />
      </div>

      <div className="grid grid-cols-2 gap-2">{cards.map((card) => <TopLineCard key={card.label} card={card} loading={loading} />)}</div>
    </section>
  );
}

function countryMapStyle ( { countryValue }, maxViews = 0 ) {
  if ( typeof countryValue === "undefined" ) {
    return {
      fill: "#e2e8f0",
      fillOpacity: 0.82,
      stroke: "#cbd5e1",
      strokeOpacity: 0.92,
      strokeWidth: 0.85,
      cursor: "pointer",
    };
  }

  const ratio = maxViews > 0 ? Number(countryValue || 0) / maxViews : 0;
  const fill =
    ratio >= 0.75
      ? "#2563eb"
      : ratio >= 0.45
        ? "#60a5fa"
        : ratio >= 0.18
          ? "#93c5fd"
          : "#bfdbfe";

  return {
    fill,
    fillOpacity: Math.max(0.72, Math.min(1, 0.62 + ratio * 0.38)),
    stroke: "#ffffff",
    strokeOpacity: 1,
    strokeWidth: 0.9,
    cursor: "pointer",
  };
}

function CountryTable () {
  const { loading, data, range, setRange } = useSectionData("country");
  const [ mapTooltip, setMapTooltip ] = useState( null );
  const [ mapZoom, setMapZoom ] = useState( 1 );
  const [ mapPan, setMapPan ] = useState( { x: 0, y: 0 } );
  const mapRef = useRef( null );
  const mapDragRef = useRef( null );

  const countryRows = data?.rows || [];
  const worldMapData = useMemo(
    () => countryRows.filter((row) => row.code !== "OTHER").map((row) => ({ country: String(row.code || "").toLowerCase(), value: Number(row.views || 0) })),
    [countryRows],
  );
  const maxMapViews = useMemo(
    () => Math.max(...worldMapData.map((row) => Number(row.value || 0)), 0),
    [worldMapData],
  );

  const countryLookup = useMemo(() => {
    const lookup = {};
    countryRows.forEach((row) => {
      lookup[row.country] = row;
      if (COUNTRY_NAME_BY_CODE[row.code]) lookup[COUNTRY_NAME_BY_CODE[row.code]] = row;
    });
    return lookup;
  }, [countryRows]);

  useEffect( () => {
    const mapElement = mapRef.current;
    if ( !mapElement ) return;

    const prepareMapPaths = () => {
      mapElement.querySelectorAll( "path" ).forEach( ( path ) => {
        const title = path.querySelector( "title" );
        if ( title?.textContent ) path.dataset.countryName = title.textContent;
        path.removeAttribute( "role" );
        path.removeAttribute( "tabindex" );
        path.removeAttribute( "aria-label" );
      } );
      mapElement.querySelectorAll( "title" ).forEach( ( title ) => title.remove() );
    };

    prepareMapPaths();
    const frameId = requestAnimationFrame( prepareMapPaths );
    return () => cancelAnimationFrame( frameId );
  }, [worldMapData] );

  const handleMapPointerMove = ( event ) => {
    if ( mapDragRef.current ) {
      const { startPan, startX, startY } = mapDragRef.current;
      setMapPan( { x: startPan.x + event.clientX - startX, y: startPan.y + event.clientY - startY } );
    }

    const countryName = event.target?.closest?.( "path" )?.dataset?.countryName;
    if ( !countryName ) {
      setMapTooltip( null );
      return;
    }

    const row = countryLookup[ countryName ];
    const rect = event.currentTarget.getBoundingClientRect();
    setMapTooltip( { countryName, containerWidth: rect.width, row, x: event.clientX - rect.left, y: event.clientY - rect.top } );
  };

  const handleMapPointerDown = ( event ) => {
    if ( event.target.closest( "button" ) ) return;
    mapDragRef.current = { startPan: mapPan, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture?.( event.pointerId );
  };

  const stopMapDrag = () => { mapDragRef.current = null; };

  const changeMapZoom = ( amount ) => {
    setMapZoom( ( currentZoom ) => {
      const nextZoom = Math.min( 2.5, Math.max( 1, Number( ( currentZoom + amount ).toFixed( 2 ) ) ) );
      if ( nextZoom === 1 ) setMapPan( { x: 0, y: 0 } );
      return nextZoom;
    } );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <h2 className="text-[18px] font-semibold leading-tight tracking-normal text-slate-950">Performance by Country — Geographic Breakdown</h2>
          <p className="mt-2 text-[12px] font-medium italic text-slate-500">This is the core view — tells us WHERE to spend ad-dollars next month and WHICH countries to expand into.</p>
        </div>
        <div className="flex min-w-0 max-w-full shrink flex-wrap items-center justify-end gap-2">
          <FilterDropdown range={range} setRange={setRange} />
          <div className="min-w-0 max-w-[190px]">
            <SectionBadge>Targeting Intelligence</SectionBadge>
          </div>
        </div>
      </div>

      <div className="mt-3 grid items-stretch gap-3">
          <div className="grid min-w-0 items-stretch gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] xl:grid-cols-[minmax(0,1fr)_220px] 2xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex h-full min-w-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Website Views by Country</h3>
                  <p className="mt-1 text-[12px] font-medium text-slate-500">Hover the map for country-level website views.</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {(data?.mapRanges || []).map( ( mapRange ) => (
                    <span key={mapRange.label} className="flex items-center gap-1.5">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mapRange.color }} />
                      {mapRange.label}
                    </span>
                  ) )}
                </div>
              </div>

              <div
                ref={mapRef}
                className={cx("relative mt-2 flex flex-1 items-center overflow-hidden", mapDragRef.current ? "cursor-grabbing" : "cursor-grab")}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={stopMapDrag}
                onPointerCancel={stopMapDrag}
                onMouseLeave={() => { stopMapDrag(); setMapTooltip( null ); }}
              >
                <div className="h-full min-h-[218px] w-full" style={{ transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`, transformOrigin: "center", transition: mapDragRef.current ? "none" : "transform 160ms ease-out" }}>
                  <WorldMap
                    backgroundColor="transparent"
                    borderColor="#cbd5e1"
                    color="#2563eb"
                    data={worldMapData}
                    containerClassName="management-country-map h-full w-full"
                    regionClassName="management-country-map-region"
                    size="responsive"
                    strokeOpacity={1}
                    styleFunction={(styleArgs) => countryMapStyle(styleArgs, maxMapViews)}
                    tooltipTextFunction={() => undefined}
                  />
                </div>
                <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded-lg border border-slate-200 !bg-white shadow-sm">
                  <button type="button" className="flex h-7 w-7 items-center justify-center border-0 !bg-white p-0 !text-slate-600 shadow-none transition hover:!bg-slate-50 hover:!text-blue-600 disabled:!bg-white disabled:!text-slate-300" disabled={mapZoom >= 2.5} onPointerDown={( event ) => event.stopPropagation()} onClick={( event ) => { event.stopPropagation(); changeMapZoom( 0.5 ); }} title="Zoom in">
                    <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </button>
                  <button type="button" className="flex h-7 w-7 items-center justify-center border-0 border-l border-slate-200 !bg-white p-0 !text-slate-600 shadow-none transition hover:!bg-slate-50 hover:!text-blue-600 disabled:!bg-white disabled:!text-slate-300" disabled={mapZoom <= 1} onPointerDown={( event ) => event.stopPropagation()} onClick={( event ) => { event.stopPropagation(); changeMapZoom( -0.5 ); }} title="Zoom out">
                    <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </button>
                </div>
                {mapTooltip ? (
                  <div className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 shadow-lg" style={{ left: Math.min( mapTooltip.x + 12, Math.max( mapTooltip.containerWidth - 150, 8 ) ), top: Math.max( mapTooltip.y - 38, 8 ) }}>
                    <div className="font-bold text-slate-950">{mapTooltip.row?.country || mapTooltip.countryName}</div>
                    <div className="mt-0.5 text-blue-600">{loading ? "Loading..." : `${formatInt(mapTooltip.row?.views)} views`}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col">
              <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 border-b border-dashed border-slate-200 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <div>Country</div><div className="text-right">Views</div>
              </div>

              <div className="divide-y divide-dashed divide-slate-100">
                {(countryRows.length ? countryRows : Array.from({ length: 6 }).map((_, i) => ({ country: `row-${i}`, code: "OTHER", views: 0 }))).map( ( row ) => {
                  const maxViews = Math.max(...countryRows.map((r) => Number(r.views || 0)), 1);
                  const width = Math.min(100, Math.round((Number(row.views || 0) / maxViews) * 100));
                  return (
                  <div key={row.country} className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 py-1.5">
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-slate-700" title={row.country}>
                          <span className="mr-1.5 text-[13px]" aria-hidden="true">{countryFlag(row.code)}</span>
                          <span>{String(row.country).startsWith("row-") ? "—" : row.country}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${loading ? 30 : width}%` }} />
                      </div>
                    </div>
                    <div className="text-right text-[13px] font-semibold text-slate-950">{loading ? <ShimmerText className="h-3 w-10" /> : formatInt(row.views)}</div>
                  </div>
                )})}
              </div>
            </div>
          </div>
      </div>
    </section>
  );
}

function CountryInsights () {
  const { loading, data, range, setRange } = useSectionData("country");

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <div className="flex items-center justify-end"><FilterDropdown range={range} setRange={setRange} /></div>
      <CountryInsightCard title="Best-Performing Countries" Icon={TrendingUp} rows={loading ? [] : (data?.bestCountries || [])} action="Increase spend where book/show/close are strongest." tone="good" />
      <CountryInsightCard title="Under-Performing Countries" Icon={TrendingDown} rows={loading ? [] : (data?.underCountries || [])} action="Improve localization and follow-up before scaling spend." tone="bad" />
    </div>
  );
}

function CountryInsightCard ( { title, Icon, rows, action, tone } ) {
  const isGood = tone === "good";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{Icon ? <Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2.2} /> : null}{title}</h3>

      <div className="mt-2 divide-y divide-dashed divide-slate-100">
        {rows.map( ( [ country, detail ] ) => (
          <div key={country} className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[12px] font-medium text-slate-700">{country}</span>
            <span className="text-right text-[12px] font-semibold text-slate-950">{detail}</span>
          </div>
        ) )}
      </div>

      <div className={cx("mt-2 rounded-md px-2.5 py-2 text-[11px] font-medium", isGood ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
        <span className="font-semibold">Action:</span> {action}
      </div>
    </section>
  );
}

function TrafficSources () {
  const { loading, data, range, setRange } = useSectionData("traffic");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold tracking-normal text-slate-950">Traffic Sources</h2>
          <FilterDropdown range={range} setRange={setRange} />
        </div>
        <p className="mt-1 text-[11px] font-medium text-slate-500">Channel performance</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Top sources</h3>

          <div className="mt-2 divide-y divide-dashed divide-slate-100">
            {((data?.rows?.length ? data.rows : Array.from({ length: 5 }).map((_, i) => ({ name: `source-${i}`, views: 0, optIns: 0, conversion: 0, revenue: 0 })))) .map( ( source ) => {
              const Icon = sourceIcon(source.name);
              const meta = `${formatInt(source.views)} views · ${formatInt(source.optIns)} opt-ins · ${formatPct(source.optInRate ?? source.conversion)} opt-in`;
              const detailTitle = `${meta}${source.closeRate != null ? ` · ${formatPct(source.closeRate)} close/show` : ""}${source.optInSource ? ` · opt-ins from ${source.optInSource}` : ""}`;
              return (
              <div key={source.name} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50"><Icon className="h-4 w-4 text-indigo-600" strokeWidth={2.2} /></span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2"><div className="truncate text-[12px] font-semibold text-slate-950">{String(source.name).startsWith("source-") ? "—" : source.name}</div></div>
                  <div className="min-w-0"><div className="mt-0.5 truncate text-[10px] font-medium text-slate-500" title={detailTitle}>{loading ? <ShimmerText className="h-3 w-36" /> : meta}</div></div>
                </div>
                <div className="text-right text-[12px] font-semibold text-slate-950">{loading ? <ShimmerText className="h-3 w-14" /> : formatUsd(source.revenue)}</div>
              </div>
            )})}
          </div>
      </div>
    </section>
  );
}

function FunnelDrilldown () {
  const { loading, data, range, setRange } = useSectionData("funnel");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-[220px] flex-1 text-[18px] font-semibold leading-tight tracking-normal text-slate-950">Funnel Performance by Country (Drill-down)</h2>
        <div className="flex min-w-0 max-w-full shrink flex-wrap items-center justify-end gap-2">
          <FilterDropdown range={range} setRange={setRange} />
          <div className="min-w-0 max-w-[190px]">
            <SectionBadge>Conversion Comparison</SectionBadge>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="grid grid-cols-[100px_repeat(4,minmax(80px,1fr))_64px_58px] items-end gap-2 border-b border-slate-200 pb-3 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          <div>Country</div><div className=" leading-tight"><span className="block">Views</span><span className="ml-3 block">↓</span><span className="block">Opt-in</span></div><div className=" leading-tight"><span className="block">Opt-in</span><span className="ml-3 block">↓</span><span className="block">Book</span></div><div className=" leading-tight"><span className="block">Book</span><span className="ml-3 block">↓</span><span className="block">Show</span></div><div className=" leading-tight"><span className="block">Show</span><span className="ml-3 block">↓</span><span className="block">Close</span></div><div className=" leading-tight"><span className="block">End</span><span className="block">to end</span></div><div className="">Avg AOV</div>
        </div>

          <div className="divide-y divide-slate-100">
            {((data?.rows?.length ? data.rows : Array.from({ length: 6 }).map((_, i) => ({ country: `row-${i}`, code: "OTHER", optIns: 0, viewsToOptIn: 0, bookings: 0, optInToBook: 0, shows: 0, bookToShow: 0, closes: 0, showToClose: 0, endToEnd: 0, aov: 0 })))) .map( ( row ) => {
              const endClass = row.endToEnd >= 0.08 ? "bg-emerald-100 text-emerald-700" : row.endToEnd >= 0.04 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
              return (
              <div key={row.country} className="grid grid-cols-[100px_repeat(4,minmax(80px,1fr))_64px_58px] items-center gap-2 py-3">
                <div className="min-w-0 truncate text-[11px] font-medium text-slate-700"><span className="mr-1.5 text-[12px]" aria-hidden="true">{countryFlag(row.code)}</span>{String(row.country).startsWith("row-") ? "—" : row.country}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.optIns)}(${formatPct(row.viewsToOptIn)})`}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.bookings)}(${formatPct(row.optInToBook)})`}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.shows)}(${formatPct(row.bookToShow)})`}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.closes)}(${formatPct(row.showToClose)})`}</div>
                <div><span className={cx( "inline-flex rounded-full px-1.5 py-1 text-[9px] font-semibold", endClass )}>{loading ? <ShimmerText className="h-3 w-10" /> : formatPct(row.endToEnd, 3)}</span></div>
                <div className="text-[11px] font-medium text-slate-700">{loading ? <ShimmerText className="h-3 w-10" /> : formatUsd(row.aov)}</div>
              </div>
            )})}
          </div>
      </div>
    </section>
  );
}

function DevicePagePerformance () {
  const deviceState = useSectionData("device");
  const engagementState = useSectionData("engagement");
  const loading = deviceState.loading || engagementState.loading;

  const device = deviceState.data || {};
  const engagement = engagementState.data || {};
  const deviceSegments = [
    {
      label: "Mobile",
      pct: Number(device.mobilePct || 0),
      optInRate: Number(device.mobileOptInRate || 0),
      className: "bg-blue-600",
      dotClassName: "bg-blue-600",
    },
    {
      label: "Desktop",
      pct: Number(device.desktopPct || 0),
      optInRate: Number(device.desktopOptInRate || 0),
      className: "bg-violet-600",
      dotClassName: "bg-violet-600",
    },
    {
      label: "Other",
      pct: Number(device.otherPct || 0),
      optInRate: Number(device.otherOptInRate || 0),
      className: "bg-slate-400",
      dotClassName: "bg-slate-400",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2">
      <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[18px] font-semibold tracking-normal text-slate-950">Device &amp; Page Performance</h2>
          <FilterDropdown range={deviceState.range} setRange={(r) => { deviceState.setRange(r); engagementState.setRange(r); }} />
        </div>
        <p className="mt-1 text-[12px] font-medium text-slate-500">UX signals</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Device Split</h3>
          <div className="mt-3 flex h-8 overflow-visible rounded-md bg-slate-100">
            {deviceSegments.map((segment) => {
              const width = Math.max(segment.pct, segment.pct > 0 ? 3 : 0);
              return (
                <div
                  key={segment.label}
                  className={cx("group relative flex h-full min-w-0 items-center justify-center px-1 text-[10px] font-bold text-white first:rounded-l-md last:rounded-r-md", segment.className)}
                  style={{ width: `${width}%` }}
                >
                  {loading ? <ShimmerText className="h-3 w-8" /> : <span className="truncate">{formatPct(segment.pct, 0)}</span>}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[190px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] font-semibold leading-snug text-slate-700 shadow-lg group-hover:block">
                    {loading ? "Loading..." : (
                      <>
                        <div className="text-slate-950">{segment.label}</div>
                        <div className="mt-0.5 font-medium text-slate-500">Traffic: {formatPct(segment.pct, 1)}</div>
                        {segment.optInRate == null ? null : (
                          <div className="font-medium text-slate-500">Opt-in: {formatPct(segment.optInRate, 1)}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium text-slate-500">
            {deviceSegments.map((segment) => (
              <span key={segment.label} className="inline-flex items-center gap-1.5">
                <span className={cx("h-2.5 w-2.5 rounded-full", segment.dotClassName)} />
                <span>{segment.label}: </span>
                <span className="font-semibold text-slate-700">{loading ? <ShimmerText className="h-3 w-10" /> : formatPct(segment.pct, 1)}</span>
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Top Landing Pages</h3>
            <div className="mt-3 divide-y divide-dashed divide-slate-100">
              {(device.topLandingPages?.length ? device.topLandingPages : Array.from({ length: 4 }).map((_, i) => ({ page: `page-${i}`, sessions: 0, share: 0 }))).map((page) => (
                <div key={page.page} className="flex items-center justify-between gap-4 py-2">
                  <span className="truncate text-[13px] font-medium text-slate-700">{String(page.page).startsWith("page-") ? "—" : page.page}</span>
                  <span className="shrink-0 text-right text-[12px] font-semibold leading-tight text-slate-950">
                    {loading ? <ShimmerText className="h-3 w-14" /> : (
                      <>
                        <span className="block">{formatInt(page.sessions)} sessions</span>
                        <span className="block text-[10px] font-medium text-slate-500">{formatPct(page.share)} share</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Avg Time on Page</h3>
          <div className="mt-3 text-[28px] font-semibold leading-none text-blue-600">{loading ? <ShimmerText className="h-8 w-16" /> : secondsToClock(engagement.avgTimeSec)}</div>
          <p className="mt-2 text-[12px] font-medium text-slate-500">VSL 50%+ watched: {loading ? <ShimmerText className="h-3 w-12" /> : (engagement.vslCompletionPct == null ? "—" : formatPct(engagement.vslCompletionPct, 0))}</p>
          <div className="mt-3 space-y-1.5">
            {loading ? (
              <>
                <ShimmerBlock className="h-4 w-full" />
                <ShimmerBlock className="h-4 w-4/5" />
                <ShimmerBlock className="h-4 w-3/5" />
              </>
            ) : (engagement.vslProgressRanges?.length ? engagement.vslProgressRanges : []).map((range) => (
              <div key={range.percent} className="flex items-center justify-between gap-3 text-[11px] font-medium">
                <span className="text-slate-500">{formatPct(range.percent, 0)} watched</span>
                <span className="font-semibold text-slate-950">{formatInt(range.events)} events</span>
              </div>
            ))}
            {!loading && !engagement.vslProgressRanges?.length && engagement.vslFallbackRanges?.length ? engagement.vslFallbackRanges.map((range) => (
              <div key={range.label} className="flex items-center justify-between gap-3 text-[11px] font-medium">
                <span className="text-slate-500">{range.label}</span>
                <span className="font-semibold text-slate-950">{formatInt(range.events)} events</span>
              </div>
            )) : null}
            {!loading && !engagement.vslProgressRanges?.length && !engagement.vslFallbackRanges?.length ? (
              <div className="text-[11px] font-medium text-slate-400">
                {engagement.vslProgressUnavailable ? "Video percent is not exposed in GA Data API" : "No VSL video events found"}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

export default function Performance () {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <TopLineSection />
          <DevicePagePerformance />
        </div>

        <div className="col-span-4 flex flex-col gap-3">
          <CountryTable />
          <div className="">
            <FunnelDrilldown />
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-3">
          <TrafficSources />
          <CountryInsights />
        </div>
      </div>
    </div>
  );
}
