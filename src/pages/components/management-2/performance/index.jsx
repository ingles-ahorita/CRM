import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
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
import * as DateHelpers from "../../../../utils/dateHelpers";
import SegmentedTabs from "../segmented-tabs";

const FILTER_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "lastWeek", label: "Last wk" },
  { id: "mtd", label: "MTD" },
  { id: "lastMonth", label: "Last mo" },
  { id: "custom", label: "Custom" },
];

const ARM_FILTER_ITEMS = [
  { id: "all", label: "All" },
  { id: "organic", label: "Organic" },
  { id: "ads", label: "Ads" },
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

/** Canonical funnel paths — same as GoogleAnalyticsPage.jsx */
const ADS_VSL_PATH = "/ads-new-masterclass-job";
const ADS_OPT_IN_PATH = "/ads-opt-in-masterclass";
const ORGANIC_VSL_PATH = "/masterclass-job";
const ORGANIC_OPT_IN_PATHS = "/pro,/";
const FUNNEL_LANDING_PATHS = [ADS_VSL_PATH, ADS_OPT_IN_PATH, ORGANIC_VSL_PATH, "/pro", "/"];
const ADS_PAGE_PREFIX = "/ads";

const COUNTRY_NAME_BY_CODE = {
  AR: "Argentina",
  BO: "Bolivia",
  BR: "Brazil",
  CL: "Chile",
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

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatInt(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n || 0));
}

function formatPct(n, digits = 1) {
  const v = Number(n || 0);
  return `${v.toFixed(digits)}%`;
}

function funnelPct(numerator, denominator) {
  const num = Number(numerator || 0);
  const den = Number(denominator || 0);
  if (den <= 0) return 0;
  return Math.min(100, (num / den) * 100);
}

function isShowedUp(row) {
  return row?.showed_up === true || row?.showed_up === "true";
}

function mapCountryMetrics(row, hasGaCountryOptIns) {
  const optIns = hasGaCountryOptIns ? row.gaOptIns : row.crmOptIns;
  return {
    ...row,
    optIns,
    optInSource: hasGaCountryOptIns ? "GA call_booked by country" : "CRM bookings by phone country",
    viewsToOptIn: funnelPct(optIns, row.views),
    optInToBook: funnelPct(row.bookings, optIns),
    bookToShow: funnelPct(row.shows, row.bookings),
    showToClose: funnelPct(row.closes, row.shows),
    endToEnd: funnelPct(row.closes, row.views),
    aov: row.closes > 0 ? row.revenue / row.closes : 0,
  };
}

function countryInsightRow(row) {
  const code = String(row.code || "OTHER");
  const name = COUNTRY_NAME_BY_CODE[code] || row.country || code;
  return { code, name, flag: countryFlag(code) };
}

/** Insights use all countries with CRM data — not only the top-8-by-views table rows. */
function buildCountryInsights(allCountryRows) {
  const bestCountries = allCountryRows
    .filter((r) => r.bookings >= 2 && r.shows > 0 && r.closes > 0)
    .sort((a, b) => b.showToClose - a.showToClose || b.closes - a.closes)
    .slice(0, 3)
    .map((r) => ({
      ...countryInsightRow(r),
      metric: formatPct(r.showToClose),
      metricLabel: "close / show",
      sub: pluralCount(r.closes, "close"),
    }));

  // Any country with ≥1 booking; worst show-up first (0% with 0 shows included).
  const underCountries = allCountryRows
    .filter((r) => r.bookings >= 1)
    .sort((a, b) => {
      if (a.bookToShow !== b.bookToShow) return a.bookToShow - b.bookToShow;
      if (a.shows !== b.shows) return a.shows - b.shows;
      return b.bookings - a.bookings;
    })
    .slice(0, 3)
    .map((r) => ({
      ...countryInsightRow(r),
      metric: formatPct(r.bookToShow),
      metricLabel: "show-up",
      sub: `${pluralCount(r.shows, "show")} / ${pluralCount(r.bookings, "booking")}`,
      zeroShows: r.shows === 0,
    }));

  return { bestCountries, underCountries };
}

function pluralCount(count, singular, plural = `${singular}s`) {
  const n = Number(count || 0);
  return `${formatInt(n)} ${n === 1 ? singular : plural}`;
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

function formatRangeBoundsLabel(start, end) {
  if (!start || !end) return "—";
  const fmt = (d) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  const startStr = fmt(start);
  const endStr = fmt(end);
  if (startStr === endStr) return startStr;
  return `${startStr} – ${endStr}`;
}

/** Mirrors `metrics/index.jsx` MetricInfo — same sizing and hover panel. */
function MetricInfo({ title, body }) {
  return (
    <span className="group relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold leading-none text-slate-500 cursor-default">
      i
      <span className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1 w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium leading-snug text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.14)] group-hover:visible">
        <span className="block text-[9px] font-semibold text-slate-900">{title}</span>
        <span className="block">{body}</span>
      </span>
    </span>
  );
}

function GaUnavailableNotice({ className = "" }) {
  return (
    <p className={cx("rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-medium leading-snug text-slate-600", className)}>
      Website stats unavailable. Connect Google Analytics (GA4_PROPERTY_ID + service account) for live funnel numbers.
    </p>
  );
}

function formatMetricValue(value, unavailable) {
  if (unavailable) return "—";
  if (value == null || Number.isNaN(Number(value))) return "—";
  return formatInt(value);
}

/** Per-arm GA funnel snapshot — aligned with GoogleAnalyticsPage.jsx chart pairs */
function buildArmSnapshot(vslViews, optInPageViews, vslSessions, optInSessions, bookingRate, vslConversion, callBooked) {
  const vslWatched = Number(vslSessions || 0);
  const optInsSessions = Number(optInSessions || 0);
  return {
    vslPageViews: Number(vslViews || 0),
    optInPageViews: Number(optInPageViews || 0),
    vslWatched,
    optInsSessions,
    callBooked: Number(callBooked || 0),
    bookingRate,
    vslConversion,
    watchRate: optInsSessions > 0 ? (vslWatched / optInsSessions) * 100 : 0,
  };
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/** Same range keys as management metrics */
function getPerformanceRangeBounds(range, customStart = null, customEnd = null) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);

  if (range === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart, end: weekEnd };
  }
  if (range === "lastMonth") {
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const monthRange = DateHelpers.getMonthRangeInTimezone(previousMonth, DateHelpers.DEFAULT_TIMEZONE);
    return { start: monthRange.startDate, end: monthRange.endDate };
  }
  if (range === "custom") {
    return normalizeCustomBounds(customStart, customEnd);
  }
  if (range === "mtd") {
    const monthRange = DateHelpers.getMonthRangeInTimezone(now, DateHelpers.DEFAULT_TIMEZONE);
    return { start: monthRange.startDate, end: now };
  }
  return { start: todayStart, end: todayEnd };
}

function normalizeCustomBounds(startDateText, endDateText) {
  const fallback = getPerformanceRangeBounds("mtd");
  if (!startDateText || !endDateText) return fallback;
  const start = new Date(`${startDateText}T00:00:00.000Z`);
  const end = new Date(`${endDateText}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fallback;
  if (start > end) return fallback;
  return { start, end };
}

function isAdsSource(row) {
  const source = String(row?.source_type || "").toLowerCase();
  return source.includes("ad") || source.includes("ads");
}

function matchesArmFilter(row, armFilter) {
  if (armFilter === "all") return true;
  const isAd = isAdsSource(row);
  return armFilter === "ads" ? isAd : !isAd;
}

function pickArmMetric(organicVal, adsVal, armFilter) {
  if (armFilter === "organic") return organicVal;
  if (armFilter === "ads") return adsVal;
  return organicVal + adsVal;
}

/**
 * Maps an arm filter to GA page-path filter params so country / device / event
 * breakdowns are restricted to that arm's funnel pages.
 *   ads     → pagePath=/ads        (CONTAINS — matches /ads, /ads-*, etc.)
 *   organic → excludePagePath=/ads (CONTAINS — everything outside the ads funnel)
 *   all     → {} (whole property)
 */
function getArmPagePathParams(armFilter) {
  if (armFilter === "ads") return { pagePath: ADS_PAGE_PREFIX };
  if (armFilter === "organic") return { excludePagePath: ADS_PAGE_PREFIX };
  return {};
}

function gaRows(payload) {
  if (!payload || payload.mock) return [];
  return payload.rows || [];
}

async function fetchGaJson(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return { rows: [], mock: false, failed: true, error: "Invalid GA response" };
    }
    if (!res.ok) {
      return {
        rows: [],
        mock: !!json.mock,
        failed: true,
        error: json.error || json.details || res.statusText,
      };
    }
    if (json.mock) {
      return { rows: [], mock: true };
    }
    return { ...json, rows: json.rows || [], mock: false };
  } catch (err) {
    return { rows: [], mock: false, failed: true, error: err?.message || "GA request failed" };
  }
}

function gaApiUrl(startDate, endDate, params) {
  return `/api/google-analytics?${new URLSearchParams({ startDate, endDate, ...params }).toString()}`;
}

function isGaConfigured(payloads) {
  return payloads.some((payload) => payload && !payload.mock);
}

function sumGaDailyMetric(payload, field) {
  return sumGaRows(payload, field);
}

function sumGaRows(payload, field) {
  return gaRows(payload).reduce((sum, row) => sum + Number(row?.[field] || 0), 0);
}

function sumGaByPath(payload, paths) {
  return gaRows(payload).reduce((total, row) => {
    const byPath = row?.byPath || {};
    return total + paths.reduce((sum, path) => sum + Number(byPath[path] || 0), 0);
  }, 0);
}

function sumGaMetricRows(payload) {
  return gaRows(payload).reduce((sum, row) => sum + Number(row?.metric || 0), 0);
}

function sumGaEventRows(payload) {
  return gaRows(payload).reduce(
    (sum, row) => sum + Number(row?.eventCount ?? row?.views ?? row?.metric ?? 0),
    0,
  );
}

function collectFunnelLandingPages(...payloads) {
  const counts = new Map();
  const addSessions = (rows) => {
    (rows || []).forEach((row) => {
      const daily = Number(row?.sessions || 0);
      const byPath = row?.byPath;
      if (byPath && Object.keys(byPath).length > 0) {
        Object.entries(byPath).forEach(([path, val]) => {
          if (!FUNNEL_LANDING_PATHS.includes(path)) return;
          counts.set(path, (counts.get(path) || 0) + Number(val || 0));
        });
      } else if (row?.pagePath && FUNNEL_LANDING_PATHS.includes(row.pagePath)) {
        counts.set(row.pagePath, (counts.get(row.pagePath) || 0) + daily);
      }
    });
  };
  payloads.forEach((payload) => addSessions(gaRows(payload)));
  const sorted = [...counts.entries()]
    .map(([page, sessions]) => ({ page, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
  const total = sorted.reduce((sum, row) => sum + row.sessions, 0);
  return sorted.map((row) => ({
    ...row,
    share: total > 0 ? (row.sessions / total) * 100 : 0,
  }));
}

function weightedAvgSessionDuration(durationPayload, sessionsPayload) {
  const durationRows = gaRows(durationPayload);
  const sessionsRows = gaRows(sessionsPayload);
  const sessionsByDate = {};
  sessionsRows.forEach((row) => {
    const date = row?.dimensions?.date || row?.date;
    if (!date) return;
    sessionsByDate[date] = (sessionsByDate[date] || 0) + Number(row?.metric ?? row?.sessions ?? 0);
  });
  let weightedSum = 0;
  let totalSessions = 0;
  durationRows.forEach((row) => {
    const date = row?.dimensions?.date || row?.date;
    const avgSec = Number(row?.metric ?? row?.averageSessionDuration ?? 0);
    const sessions = sessionsByDate[date] || 0;
    if (sessions > 0 && avgSec > 0) {
      weightedSum += avgSec * sessions;
      totalSessions += sessions;
    }
  });
  if (totalSessions > 0) return weightedSum / totalSessions;
  if (durationRows.length > 0) {
    return durationRows.reduce((s, r) => s + Number(r?.metric || 0), 0) / durationRows.length;
  }
  return null;
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

function isAdsTrafficSource(name) {
  const normalized = normalizeGaSource(name);
  return normalized === "Meta Ads" || normalized === "Google Ads";
}

function matchesTrafficArm(name, armFilter) {
  if (armFilter === "all") return true;
  const isAd = isAdsTrafficSource(name);
  return armFilter === "ads" ? isAd : !isAd;
}

async function fetchPerformanceData(range, timezone, customStart = null, customEnd = null, armFilter = "all", countryFilterGa = "") {
  const cacheKey = `${range}:${timezone}:${customStart || ""}:${customEnd || ""}:${armFilter}:${countryFilterGa || ""}`;
  const cached = performanceDataCache.get(cacheKey);

  if (cached) return cached;

  const request = buildPerformanceData(range, timezone, customStart, customEnd, armFilter, countryFilterGa).catch((error) => {
    performanceDataCache.delete(cacheKey);
    throw error;
  });

  performanceDataCache.set(cacheKey, request);
  return request;
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

/** GA `country` dimension value (e.g. "Mexico") must match exactly. */
function gaRowMatchesCountryFilter(row, countryFilterGa) {
  if (!countryFilterGa) return true;
  return String(row?.dimensions?.country ?? "").trim() === countryFilterGa;
}

function sumGaCountryMetric(payload, countryFilterGa) {
  if (!countryFilterGa) return 0;
  return gaRows(payload).reduce((sum, r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return sum;
    return sum + (Number(r.metric || 0) || 0);
  }, 0);
}

function computeTopCountryFilterChoices(gaCountryViewsPayload) {
  const totals = new Map();
  for (const r of gaRows(gaCountryViewsPayload)) {
    const name = String(r?.dimensions?.country ?? "").trim();
    if (!name || name === "(not set)") continue;
    totals.set(name, (totals.get(name) || 0) + (Number(r.metric || 0) || 0));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, views]) => ({ value, label: `${value} (${formatInt(views)})` }));
}

function isOptInPagePathForViews(p) {
  const path = String(p || "").trim();
  if (!path) return false;
  if (path === ADS_OPT_IN_PATH) return true;
  if (path === "/pro" || path === "/") return true;
  return false;
}

function sumOptInPathViewsFromPageCountry(payload, countryFilterGa) {
  return gaRows(payload).reduce((sum, r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return sum;
    const path = String(r?.dimensions?.pagePath ?? "").trim();
    if (!isOptInPagePathForViews(path)) return sum;
    return sum + (Number(r.metric || 0) || 0);
  }, 0);
}

function filterCrmRowsByGaCountry(rows, countryFilterGa, getPhone) {
  if (!countryFilterGa || !rows?.length) return rows;
  const key = String(countryFilterGa).trim().toLowerCase();
  const targetCode =
    COUNTRY_CODE_BY_NAME[key] ||
    Object.entries(COUNTRY_NAME_BY_CODE).find(([, n]) => String(n).toLowerCase() === key)?.[0];
  if (!targetCode || targetCode === "OTHER") return rows;
  return rows.filter((row) => {
    const c = getCountryFromPhone(getPhone(row));
    const code = !c || c === "Unknown" ? "OTHER" : String(c).split("/")[0].toUpperCase();
    return code === targetCode;
  });
}

async function buildPerformanceData(range, timezone, customStart = null, customEnd = null, armFilter = "all", countryFilterGa = "") {
  const { start, end } = getPerformanceRangeBounds(range, customStart, customEnd);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const startDate = isoDay(start);
  const endDate = isoDay(end);

  const armPathParams = getArmPagePathParams(armFilter);
  const gaErrors = [];
  const sessionsParams = { metric: "sessions" };
  const vslPathsParam = `${ADS_VSL_PATH},${ORGANIC_VSL_PATH}`;
  // Arm-specific VSL path(s) for video-event queries so that completion %
  // and event counts only reflect the currently selected funnel arm.
  const armVslPathsParam =
    armFilter === "organic" ? ORGANIC_VSL_PATH
    : armFilter === "ads" ? ADS_VSL_PATH
    : vslPathsParam;

  let [rawCallsByDate, rawBookings, rawPurchases] = await Promise.all([
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
        .select("id, lead_id, phone, source_type, utm_source, utm_medium, utm_campaign, picked_up, confirmed, is_reschedule, showed_up, book_date, leads(phone)")
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

  rawCallsByDate = filterCrmRowsByGaCountry(rawCallsByDate, countryFilterGa, (r) => r.phone || r.leads?.phone);
  rawBookings = filterCrmRowsByGaCountry(rawBookings, countryFilterGa, (r) => r.phone || r.leads?.phone);
  rawPurchases = filterCrmRowsByGaCountry(rawPurchases, countryFilterGa, (r) => r.calls?.phone || r.calls?.leads?.phone);

  const [
    gaAdsSiteViews,
    gaOrganicSiteViews,
    gaAdsSiteSessions,
    gaOrganicSiteSessions,
    gaAdsVslViews,
    gaOrganicVslViews,
    gaAdsOptInViews,
    gaOrganicOptInViews,
    gaAdsVslSessions,
    gaOrganicVslSessions,
    gaAdsOptInSessions,
    gaOrganicOptInSessions,
    gaCountryViews,
    gaCountrySessions,
    gaDeviceSessions,
    gaSourceViews,
    gaSourceOptIns,
    gaCountryOptIns,
    gaDeviceOptIns,
    gaOptInEvents,
    gaVideoStart,
    gaVideoProgressTotal,
    gaVideoComplete,
    gaAvgDuration,
    gaSessionsByDate,
    gaPagePathCountryViews,
  ] = await Promise.all([
    fetchGaJson(gaApiUrl(startDate, endDate, { pagePath: ADS_PAGE_PREFIX })),
    fetchGaJson(gaApiUrl(startDate, endDate, { excludePagePath: ADS_PAGE_PREFIX })),
    fetchGaJson(gaApiUrl(startDate, endDate, { ...sessionsParams, pagePath: ADS_PAGE_PREFIX })),
    fetchGaJson(gaApiUrl(startDate, endDate, { ...sessionsParams, excludePagePath: ADS_PAGE_PREFIX })),
    fetchGaJson(gaApiUrl(startDate, endDate, { pagePath: ADS_VSL_PATH })),
    fetchGaJson(gaApiUrl(startDate, endDate, { pagePath: ORGANIC_VSL_PATH })),
    fetchGaJson(gaApiUrl(startDate, endDate, { pagePath: ADS_OPT_IN_PATH })),
    fetchGaJson(gaApiUrl(startDate, endDate, { pagePaths: ORGANIC_OPT_IN_PATHS })),
    fetchGaJson(gaApiUrl(startDate, endDate, { ...sessionsParams, pagePath: ADS_VSL_PATH })),
    fetchGaJson(gaApiUrl(startDate, endDate, { ...sessionsParams, pagePath: ORGANIC_VSL_PATH })),
    fetchGaJson(gaApiUrl(startDate, endDate, { ...sessionsParams, pagePath: ADS_OPT_IN_PATH })),
    fetchGaJson(gaApiUrl(startDate, endDate, { ...sessionsParams, pagePaths: ORGANIC_OPT_IN_PATHS })),
    // Country views: arm-aware via pagePath/excludePagePath
    fetchGaJson(gaApiUrl(startDate, endDate, { dimensions: "country", metricName: "screenPageViews", ...armPathParams })),
    fetchGaJson(gaApiUrl(startDate, endDate, { dimensions: "country", metricName: "sessions", ...armPathParams })),
    // Device sessions: arm-aware + country (aggregated client-side)
    fetchGaJson(gaApiUrl(startDate, endDate, { dimensions: "deviceCategory,country", metricName: "sessions", ...armPathParams })),
    // Source views: sessionSource + country (aggregated client-side)
    fetchGaJson(gaApiUrl(startDate, endDate, { dimensions: "sessionSource,country", metricName: "screenPageViews" })),
    // Source opt-ins (call_booked); whole-site; sessionSource + country
    fetchGaJson(gaApiUrl(startDate, endDate, { eventName: "call_booked", dimensions: "sessionSource,country", metricName: "eventCount" })),
    // Country opt-ins (call_booked): arm-aware
    fetchGaJson(gaApiUrl(startDate, endDate, { eventName: "call_booked", dimensions: "country", metricName: "eventCount", ...armPathParams })),
    // Device opt-ins (call_booked): arm-aware + country
    fetchGaJson(gaApiUrl(startDate, endDate, { eventName: "call_booked", dimensions: "deviceCategory,country", metricName: "eventCount", ...armPathParams })),
    // Whole-site call_booked totals (for "all" arm in TopLine "Call booked" card)
    fetchGaJson(gaApiUrl(startDate, endDate, { wholeSite: "1" })),
    // VSL video aggregates only (no video_percent breakdown — GA4 often rejects that dimension in Data API).
    fetchGaJson(gaApiUrl(startDate, endDate, { eventName: "video_start", metricName: "eventCount", pagePaths: armVslPathsParam })),
    fetchGaJson(gaApiUrl(startDate, endDate, { eventName: "video_progress", metricName: "eventCount", pagePaths: armVslPathsParam })),
    fetchGaJson(gaApiUrl(startDate, endDate, { eventName: "video_complete", metricName: "eventCount", pagePaths: armVslPathsParam })),
    // Avg session duration and session-by-date are arm-aware so "Avg Time on Page"
    // reflects the selected funnel arm rather than the whole property.
    fetchGaJson(gaApiUrl(startDate, endDate, { dimensions: "date", metricName: "averageSessionDuration", ...armPathParams })),
    fetchGaJson(gaApiUrl(startDate, endDate, { dimensions: "date", metricName: "sessions", ...armPathParams })),
    // Page path × country views (arm-aware) for detailed "Page views by path" table
    fetchGaJson(gaApiUrl(startDate, endDate, { dimensions: "pagePath,country", metricName: "screenPageViews", ...armPathParams })),
  ]);

  [
    gaAdsSiteViews,
    gaOrganicSiteViews,
    gaAdsSiteSessions,
    gaOrganicSiteSessions,
    gaAdsVslViews,
    gaOrganicVslViews,
    gaAdsOptInViews,
    gaOrganicOptInViews,
    gaAdsVslSessions,
    gaOrganicVslSessions,
    gaAdsOptInSessions,
    gaOrganicOptInSessions,
    gaCountryViews,
    gaCountrySessions,
    gaDeviceSessions,
    gaSourceViews,
    gaSourceOptIns,
    gaCountryOptIns,
    gaDeviceOptIns,
    gaOptInEvents,
    gaVideoStart,
    gaVideoProgressTotal,
    gaVideoComplete,
    gaAvgDuration,
    gaSessionsByDate,
    gaPagePathCountryViews,
  ].forEach((payload) => {
    if (payload?.failed && payload?.error) gaErrors.push(payload.error);
  });

  const coreGaPayloads = [
    gaAdsSiteViews,
    gaOrganicSiteViews,
    gaAdsVslViews,
    gaOrganicVslViews,
    gaAdsOptInViews,
    gaOrganicOptInViews,
    gaOptInEvents,
  ];
  const gaUnavailable = !isGaConfigured(coreGaPayloads);
  const countryFilterChoices = !gaUnavailable ? computeTopCountryFilterChoices(gaCountryViews) : [];

  const rescheduledLeadIds = new Set(rawCallsByDate.filter((call) => call.is_reschedule === true).map((call) => call.lead_id));
  const callsByDateAll = rawCallsByDate.filter((call) => call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id));
  const bookingsAll = (rawBookings || []).filter((call) => call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id));
  const purchasesAll = rawPurchases
    .filter((outcomeLog) => outcomeLog.calls?.id)
    .map((outcomeLog) => ({
      ...outcomeLog.calls,
      outcome_log_id: outcomeLog.id,
      purchase_date: outcomeLog.purchase_date,
      outcome: outcomeLog.outcome,
      offer_price: outcomeLog.offers?.price,
    }));

  const bookings = bookingsAll.filter((row) => matchesArmFilter(row, armFilter));
  const purchases = purchasesAll.filter((row) => matchesArmFilter(row, armFilter));
  const adsBookings = bookingsAll.filter(isAdsSource);
  const organicBookings = bookingsAll.filter((call) => !isAdsSource(call));
  const adsPurchases = purchasesAll.filter(isAdsSource);
  const organicPurchases = purchasesAll.filter((row) => !isAdsSource(row));

  const adsSiteViews = sumGaDailyMetric(gaAdsSiteViews, "views");
  const organicSiteViews = sumGaDailyMetric(gaOrganicSiteViews, "views");
  const adsSiteSessions = sumGaDailyMetric(gaAdsSiteSessions, "sessions");
  const organicSiteSessions = sumGaDailyMetric(gaOrganicSiteSessions, "sessions");
  const websiteViews = pickArmMetric(organicSiteViews, adsSiteViews, armFilter);
  const websiteSessions = pickArmMetric(organicSiteSessions, adsSiteSessions, armFilter);

  const adsVslViews = sumGaDailyMetric(gaAdsVslViews, "views");
  const organicVslViews = sumGaDailyMetric(gaOrganicVslViews, "views");
  const adsOptInViews = sumGaDailyMetric(gaAdsOptInViews, "views");
  const organicOptInViews = sumGaByPath(gaOrganicOptInViews, ["/pro", "/"]) || sumGaDailyMetric(gaOrganicOptInViews, "views");
  const optInPageViews = pickArmMetric(organicOptInViews, adsOptInViews, armFilter);

  const adsVslSessions = sumGaDailyMetric(gaAdsVslSessions, "sessions");
  const organicVslSessions = sumGaDailyMetric(gaOrganicVslSessions, "sessions");
  const adsOptInSessions = sumGaDailyMetric(gaAdsOptInSessions, "sessions");
  const organicOptInSessions = sumGaByPath(gaOrganicOptInSessions, ["/pro", "/"]) || sumGaDailyMetric(gaOrganicOptInSessions, "sessions");
  const vslWatched = pickArmMetric(organicVslSessions, adsVslSessions, armFilter);
  const optInsSessions = pickArmMetric(organicOptInSessions, adsOptInSessions, armFilter);

  const adsVslCallBooked = sumGaDailyMetric(gaAdsVslViews, "eventCount");
  const organicVslCallBooked = sumGaDailyMetric(gaOrganicVslViews, "eventCount");
  const adsBookingRate = adsVslViews > 0 ? (adsVslCallBooked / adsVslViews) * 100 : null;
  const organicBookingRate = organicVslViews > 0 ? (organicVslCallBooked / organicVslViews) * 100 : null;
  const adsVslConversion = adsOptInSessions > 0 ? (adsVslSessions / adsOptInSessions) * 100 : null;
  const organicVslConversion = organicOptInSessions > 0 ? (organicVslSessions / organicOptInSessions) * 100 : null;

  const optInsEvents = sumGaRows(gaOptInEvents, "eventCount");
  const armGaCallBooked = countryFilterGa
    ? gaRows(gaDeviceOptIns).reduce(
        (s, r) => (gaRowMatchesCountryFilter(r, countryFilterGa) ? s + (Number(r.metric || 0) || 0) : s),
        0,
      )
    : sumGaMetricRows(gaDeviceOptIns);
  const armCallBooked = pickArmMetric(organicVslCallBooked, adsVslCallBooked, armFilter);
  const optIns = gaUnavailable
    ? bookings.length
    : (armFilter === "all" && optInsEvents > 0
      ? optInsEvents
      : (armCallBooked > 0 ? armCallBooked : (optInsSessions > 0 ? optInsSessions : bookings.length)));

  let websiteViewsForTop = websiteViews;
  let websiteSessionsForTop = websiteSessions;
  let optInPageViewsForTop = optInPageViews;
  let optInsForTop = optIns;
  if (countryFilterGa && !gaUnavailable) {
    const cv = sumGaCountryMetric(gaCountryViews, countryFilterGa);
    if (cv > 0) websiteViewsForTop = cv;
    const cs = sumGaCountryMetric(gaCountrySessions, countryFilterGa);
    if (cs > 0) websiteSessionsForTop = cs;
    const ov = sumOptInPathViewsFromPageCountry(gaPagePathCountryViews, countryFilterGa);
    if (ov > 0) optInPageViewsForTop = ov;
    const co = sumGaCountryMetric(gaCountryOptIns, countryFilterGa);
    optInsForTop = co > 0 ? co : bookings.length;
  }

  const optInSource = gaUnavailable
    ? "CRM bookings (GA unavailable)"
    : (armFilter === "all" && optInsEvents > 0
      ? "GA call_booked (whole site)"
      : (armCallBooked > 0 ? `GA call_booked on ${armFilter === "ads" ? ADS_VSL_PATH : ORGANIC_VSL_PATH}` : (optInsSessions > 0 ? "GA opt-in page sessions" : "CRM bookings")));
  // Percent-watched buckets from GA (video_percent dim) removed — Data API often errors; ratio uses complete/start below.
  const vslProgressRanges = [];
  const videoStartEvents = sumGaEventRows(gaVideoStart);
  const videoProgressEvents = sumGaEventRows(gaVideoProgressTotal);
  const videoCompleteEvents = sumGaEventRows(gaVideoComplete);
  const vslCompletionPct = videoStartEvents > 0 && videoCompleteEvents > 0
    ? (videoCompleteEvents / videoStartEvents) * 100
    : null;
  const vslFallbackRanges = [
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
    if (isShowedUp(b)) {
      s.shows += 1;
      c.shows += 1;
    }
  });
  purchases.forEach((p) => {
    const s = ensureSource(sourceName(p));
    s.closes += 1;
    s.revenue += Number(p.offer_price || 0);
    const c = ensureCountry(countryCode(p.phone || p.leads?.phone));
    c.closes += 1;
    c.revenue += Number(p.offer_price || 0);
  });

  gaRows(gaSourceViews).forEach((r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return;
    const name = normalizeGaSource(r?.dimensions?.sessionSource);
    if (!matchesTrafficArm(name, armFilter)) return;
    ensureSource(name).views += Number(r.metric || 0);
  });
  gaRows(gaSourceOptIns).forEach((r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return;
    const name = normalizeGaSource(r?.dimensions?.sessionSource);
    if (!matchesTrafficArm(name, armFilter)) return;
    ensureSource(name).gaOptIns += Number(r.metric || 0);
  });

  // Country GA views/opt-ins are arm-aware via pagePath filter (see armPathParams).
  gaRows(gaCountryViews).forEach((r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return;
    const rawCountry = String(r?.dimensions?.country || "");
    const code = codeFromCountryName(rawCountry);
    const country = ensureCountry(code);
    country.country = code === "OTHER" && rawCountry ? rawCountry : countryName(code);
    country.views += Number(r.metric || 0);
  });
  gaRows(gaCountryOptIns).forEach((r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return;
    const rawCountry = String(r?.dimensions?.country || "");
    const code = codeFromCountryName(rawCountry);
    const country = ensureCountry(code);
    country.country = code === "OTHER" && rawCountry ? rawCountry : countryName(code);
    country.gaOptIns += Number(r.metric || 0);
  });

  const hasGaCountryOptIns =
    !gaUnavailable &&
    (countryFilterGa
      ? sumGaCountryMetric(gaCountryOptIns, countryFilterGa) > 0
      : sumGaMetricRows(gaCountryOptIns) > 0);
  const allCountryRows = Object.values(countryAgg).map((r) => mapCountryMetrics(r, hasGaCountryOptIns));
  const totalCountryViews = allCountryRows.reduce((sum, r) => sum + Number(r.views || 0), 0);
  const countryRows = allCountryRows
    .sort((a, b) => (b.views || b.bookings || b.closes) - (a.views || a.bookings || a.closes))
    .slice(0, 8);
  const { bestCountries, underCountries } = buildCountryInsights(allCountryRows);

  const trafficRows = Object.values(sourceAgg)
    .sort((a, b) => {
      if (gaUnavailable) return (b.bookings || b.revenue) - (a.bookings || a.revenue);
      const viewDiff = (b.views || 0) - (a.views || 0);
      if (viewDiff !== 0) return viewDiff;
      return (b.revenue || 0) - (a.revenue || 0);
    })
    .slice(0, 5)
    .map((r) => {
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
  gaRows(gaDeviceSessions).forEach((r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return;
    const key = String(r?.dimensions?.deviceCategory || "").toLowerCase();
    const val = Number(r.metric || 0);
    if (key === "mobile") deviceCounts.mobile += val;
    else if (key === "desktop") deviceCounts.desktop += val;
    else deviceCounts.other += val;
  });
  gaRows(gaDeviceOptIns).forEach((r) => {
    if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return;
    const key = String(r?.dimensions?.deviceCategory || "").toLowerCase();
    const val = Number(r.metric || 0);
    if (key === "mobile") deviceOptIns.mobile += val;
    else if (key === "desktop") deviceOptIns.desktop += val;
    else deviceOptIns.other += val;
  });
  const totalDevice = deviceCounts.mobile + deviceCounts.desktop + deviceCounts.other;

  const pathCountryRows = [];
  if (!gaUnavailable && !gaPagePathCountryViews?.failed && !gaPagePathCountryViews?.unavailable) {
    gaRows(gaPagePathCountryViews).forEach((r) => {
      if (!gaRowMatchesCountryFilter(r, countryFilterGa)) return;
      const path = String(r?.dimensions?.pagePath ?? "").trim() || "(not set)";
      const country = String(r?.dimensions?.country ?? "").trim() || "(not set)";
      const views = Number(r.metric || 0);
      if (views > 0) pathCountryRows.push({ path, country, views });
    });
  }
  const pathViewsByPath = new Map();
  for (const row of pathCountryRows) {
    pathViewsByPath.set(row.path, (pathViewsByPath.get(row.path) || 0) + row.views);
  }
  const pathViewsTotal = [...pathViewsByPath.values()].reduce((a, b) => a + b, 0);
  const topPathsForCard = [...pathViewsByPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, views]) => ({
      path,
      views,
      share: pathViewsTotal > 0 ? (views / pathViewsTotal) * 100 : 0,
    }));
  const pageViewsDetail = {
    pathCountryRows,
    topPaths: topPathsForCard,
    totalViews: pathCountryRows.reduce((s, r) => s + r.views, 0),
    error: gaPagePathCountryViews?.failed
      ? gaPagePathCountryViews.error
      : gaPagePathCountryViews?.unavailable
        ? gaPagePathCountryViews.reason || "GA page path report unavailable"
        : null,
  };

  const funnelLanding = collectFunnelLandingPages(
    ...(armFilter === "ads"
      ? [gaAdsVslSessions, gaAdsOptInSessions]
      : armFilter === "organic"
        ? [gaOrganicVslSessions, gaOrganicOptInSessions]
        : [gaAdsVslSessions, gaOrganicVslSessions, gaAdsOptInSessions, gaOrganicOptInSessions]),
  );
  const landing = funnelLanding.length > 0
    ? funnelLanding.slice(0, 4)
    : FUNNEL_LANDING_PATHS.map((page) => ({ page, sessions: 0, share: 0 }));

  const avgTimeSec = gaUnavailable ? null : weightedAvgSessionDuration(gaAvgDuration, gaSessionsByDate);

  const watchRate = optInsSessions > 0 ? (vslWatched / optInsSessions) * 100 : 0;
  const optInRate = optInPageViewsForTop > 0 ? (optInsForTop / optInPageViewsForTop) * 100 : 0;

  return {
    meta: {
      range,
      timezone,
      startDate,
      endDate,
      rangeStart: start,
      rangeEnd: end,
      gaUnavailable,
      gaMock: gaUnavailable,
      gaError: gaErrors.length > 0 ? gaErrors[0] : null,
      armFilter,
      countryFilter: countryFilterGa || "",
      countryFilterChoices,
    },
    topline: {
      gaUnavailable,
      arms: {
        ads: buildArmSnapshot(adsVslViews, adsOptInViews, adsVslSessions, adsOptInSessions, adsBookingRate, adsVslConversion, adsVslCallBooked),
        organic: buildArmSnapshot(organicVslViews, organicOptInViews, organicVslSessions, organicOptInSessions, organicBookingRate, organicVslConversion, organicVslCallBooked),
      },
      wholeSiteCallBooked:
        countryFilterGa && !gaUnavailable ? optInsForTop : armFilter === "all" ? optInsEvents : armGaCallBooked,
      armFilter,
      websiteViews: websiteViewsForTop,
      websiteSessions: websiteSessionsForTop,
      adsSiteViews,
      organicSiteViews,
      adsSiteSessions,
      organicSiteSessions,
      optInPageViews: optInPageViewsForTop,
      vslWatched,
      optIns: optInsForTop,
      optInSource,
      optInsSessions,
      bookings: bookings.length,
      adsBookings: adsBookings.length,
      organicBookings: organicBookings.length,
      showClose: purchases.length,
      closedRevenue: purchases.reduce((s, p) => s + Number(p.offer_price || 0), 0),
      adsShowClose: adsPurchases.length,
      organicShowClose: organicPurchases.length,
      adsClosedRevenue: adsPurchases.reduce((s, p) => s + Number(p.offer_price || 0), 0),
      organicClosedRevenue: organicPurchases.reduce((s, p) => s + Number(p.offer_price || 0), 0),
      watchRate,
      optInRate,
      bookRate: optInsForTop > 0 ? (bookings.length / optInsForTop) * 100 : 0,
      adsVslViews,
      organicVslViews,
      adsOptInViews,
      organicOptInViews,
      adsVslSessions,
      organicVslSessions,
      adsOptInSessions,
      organicOptInSessions,
      adsBookingRate,
      organicBookingRate,
      adsVslConversion,
      organicVslConversion,
    },
    country: {
      rows: countryRows,
      totalViews: totalCountryViews,
      websiteViews: websiteViewsForTop,
      mapRanges: [
        { label: "Low", color: "#bfdbfe" },
        { label: "Med", color: "#93c5fd" },
        { label: "High", color: "#60a5fa" },
        { label: "Top", color: "#2563eb" },
      ],
      bestCountries,
      underCountries,
    },
    traffic: { rows: trafficRows },
    device: {
      mobilePct: totalDevice > 0 ? (deviceCounts.mobile / totalDevice) * 100 : 0,
      desktopPct: totalDevice > 0 ? (deviceCounts.desktop / totalDevice) * 100 : 0,
      otherPct: totalDevice > 0 ? (deviceCounts.other / totalDevice) * 100 : 0,
      mobileOptInRate: deviceCounts.mobile > 0 ? (deviceOptIns.mobile / deviceCounts.mobile) * 100 : 0,
      desktopOptInRate: deviceCounts.desktop > 0 ? (deviceOptIns.desktop / deviceCounts.desktop) * 100 : 0,
      otherOptInRate: deviceCounts.other > 0 ? (deviceOptIns.other / deviceCounts.other) * 100 : 0,
      deviceOptInSource:
        !gaUnavailable &&
        (countryFilterGa
          ? gaRows(gaDeviceOptIns).some((r) => gaRowMatchesCountryFilter(r, countryFilterGa) && Number(r.metric || 0) > 0)
          : sumGaMetricRows(gaDeviceOptIns) > 0)
          ? "GA call_booked by device"
          : "Unavailable",
      topLandingPages: landing,
    },
    engagement: {
      avgTimeSec,
      vslCompletionPct,
      vslProgressRanges,
      vslFallbackRanges,
    },
    pageViewsDetail,
  };
}

/** Single page-wide data hook. All sections subscribe to the same payload. */
function usePerformanceData(range, customStart, customEnd, armFilter, countryFilterGa) {
  const [state, setState] = useState({ loading: true, data: null, error: null, meta: null });

  useEffect(() => {
    let cancelled = false;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchPerformanceData(
      range,
      timezone,
      range === "custom" ? customStart : null,
      range === "custom" ? customEnd : null,
      armFilter,
      countryFilterGa || "",
    )
      .then((json) => {
        if (cancelled) return;
        setState({ loading: false, data: json, error: null, meta: json?.meta || null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ loading: false, data: null, error: error?.message || "Failed to load", meta: null });
      });

    return () => {
      cancelled = true;
    };
  }, [range, customStart, customEnd, armFilter, countryFilterGa]);

  return state;
}

function SectionBadge({ children }) {
  return (
    <span className="inline-flex h-6 min-w-0 max-w-full shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      <span className="truncate">{children}</span>
    </span>
  );
}

function PerformanceSectionHeader({
  title,
  titleAs: TitleTag = "h2",
  titleClassName = "text-[16px] font-semibold tracking-normal text-slate-950",
  subtitle,
  badge,
  tabs,
  bordered = true,
  className = "",
}) {
  const topRight = badge ? <SectionBadge>{badge}</SectionBadge> : tabs ? (
    <SegmentedTabs
      size="xs"
      className="!w-fit shrink-0"
      items={tabs.items}
      activeId={tabs.activeId}
      onChange={tabs.onChange}
    />
  ) : null;

  return (
    <div
      className={cx(
        bordered && "rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TitleTag className={titleClassName}>{title}</TitleTag>
          {subtitle ? (
            typeof subtitle === "string" ? (
              <p className="mt-1 text-[12px] font-medium italic leading-snug text-slate-500">{subtitle}</p>
            ) : (
              <div className="mt-1 text-[11px] font-medium leading-snug text-slate-500">{subtitle}</div>
            )
          ) : null}
        </div>
        {topRight}
      </div>
      {badge && tabs ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SegmentedTabs
            size="xs"
            className="!w-fit shrink-0"
            items={tabs.items}
            activeId={tabs.activeId}
            onChange={tabs.onChange}
          />
        </div>
      ) : null}
    </div>
  );
}

function ShimmerBlock({ className = "" }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

function ShimmerText({ className = "" }) {
  return <span className={cx("inline-block animate-pulse rounded bg-slate-200/80 align-middle", className)} />;
}

function TopLineCard({ card, loading }) {
  return (
    <article className="flex min-h-[92px] flex-col rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500 leading-tight">{card.label}</p>
        {card.infoBody ? <MetricInfo title={card.infoTitle || card.label} body={card.infoBody} /> : <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      </div>
      <div className="mt-auto flex flex-1 flex-col justify-end pt-2">
        <p className="text-[16px] font-semibold leading-none tracking-normal text-slate-900 tabular-nums">
          {loading ? <ShimmerText className="h-5 w-16" /> : card.value}
        </p>
        <div className="mt-1.5 min-h-[18px]">
          <span className="inline-flex max-w-full truncate rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-emerald-700" title={typeof card.badge === "string" ? card.badge : undefined}>
            {loading ? <ShimmerText className="h-2.5 w-14" /> : card.badge}
          </span>
        </div>
      </div>
    </article>
  );
}

/** One-row global filter bar — date range + (optional custom) + arm + range label. */
function PerformanceGlobalFilters({
  range,
  onRangeChange,
  customStart,
  onCustomStartChange,
  customEnd,
  onCustomEndChange,
  armFilter,
  onArmFilterChange,
  countryFilter,
  onCountryFilterChange,
  countryFilterChoices,
  rangeBounds,
  loading,
}) {
  const periodLabel = rangeBounds ? formatRangeBoundsLabel(rangeBounds.start, rangeBounds.end) : "—";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs
          size="sm"
          fit
          items={FILTER_OPTIONS}
          activeId={range}
          onChange={onRangeChange}
        />

        {range === "custom" ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
            <input
              type="date"
              value={customStart || ""}
              onChange={(e) => onCustomStartChange?.(e.target.value)}
              className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
              aria-label="Custom start date"
            />
            <span className="text-[10px] font-semibold text-slate-500">–</span>
            <input
              type="date"
              value={customEnd || ""}
              onChange={(e) => onCustomEndChange?.(e.target.value)}
              className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
              aria-label="Custom end date"
            />
          </div>
        ) : null}

        <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" aria-hidden="true" />

        <SegmentedTabs
          size="sm"
          fit
          items={ARM_FILTER_ITEMS}
          activeId={armFilter}
          onChange={onArmFilterChange}
        />

        <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" aria-hidden="true" />

        <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1">
          <label htmlFor="perf-country-filter" className="sr-only">
            Country filter
          </label>
          <select
            id="perf-country-filter"
            value={countryFilter || ""}
            onChange={(e) => onCountryFilterChange?.(e.target.value)}
            disabled={loading || !countryFilterChoices?.length}
            className="h-6 max-w-[min(100%,200px)] cursor-pointer rounded border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-700 !outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Filter by country"
          >
            <option value="">All countries</option>
            {(countryFilterChoices || []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          <Calendar className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.2} />
          <span className="text-[11px] font-semibold tabular-nums text-slate-700">
            {loading ? <ShimmerText className="h-3 w-28" /> : periodLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function TopLineSection({ data, loading, meta, armFilter }) {
  const gaUnavailable = Boolean(data?.gaUnavailable ?? meta?.gaUnavailable ?? meta?.gaMock);

  const cards = useMemo(() => {
    const source = data || {};
    const callBooked = source.wholeSiteCallBooked ?? 0;

    const adsSiteViews = source.adsSiteViews ?? 0;
    const organicSiteViews = source.organicSiteViews ?? 0;
    const adsSiteSessions = source.adsSiteSessions ?? 0;
    const organicSiteSessions = source.organicSiteSessions ?? 0;
    const organicOptInViews = source.organicOptInViews ?? 0;
    const adsOptInViews = source.adsOptInViews ?? 0;
    const organicOptInSessions = source.organicOptInSessions ?? 0;
    const adsOptInSessions = source.adsOptInSessions ?? 0;

    const websiteViews =
      source.websiteViews != null ? Number(source.websiteViews) : pickArmMetric(organicSiteViews, adsSiteViews, armFilter);
    const websiteSessions =
      source.websiteSessions != null ? Number(source.websiteSessions) : pickArmMetric(organicSiteSessions, adsSiteSessions, armFilter);
    const optInViews =
      source.optInPageViews != null ? Number(source.optInPageViews) : pickArmMetric(organicOptInViews, adsOptInViews, armFilter);
    const optInSessions = pickArmMetric(organicOptInSessions, adsOptInSessions, armFilter);

    return [
      {
        label: "Website views",
        value: formatMetricValue(websiteViews, gaUnavailable),
        badge: gaUnavailable ? "—" : `${formatInt(websiteSessions)} sessions`,
        infoTitle: "Website views",
        infoBody: "GA page views for All, Ads, or Organic (top filter).",
      },
      {
        label: "Opt-in views",
        value: formatMetricValue(optInViews, gaUnavailable),
        badge: gaUnavailable ? "—" : `${formatInt(optInSessions)} sessions`,
        infoTitle: "Opt-in views",
        infoBody: "GA views on opt-in pages for All, Ads, or Organic.",
      },
      {
        label: "Call booked",
        value: formatMetricValue(callBooked, gaUnavailable),
        badge: gaUnavailable ? "—" : armFilter === "all" ? "whole site" : armFilter,
        infoTitle: "Call booked",
        infoBody: armFilter === "all"
          ? "GA call_booked events site-wide."
          : "GA call_booked events for Ads or Organic pages only.",
      },
    ];
  }, [data, gaUnavailable, armFilter]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-1.5">
      <PerformanceSectionHeader className="mb-1" title="Global Performance" titleAs="h1" />

      {gaUnavailable ? <GaUnavailableNotice className="mb-1" /> : null}
      {!gaUnavailable && meta?.gaError ? (
        <p className="mb-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-medium text-red-700">
          Some website stats may be missing.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-1.5">{cards.map((card) => <TopLineCard key={card.label} card={card} loading={loading} />)}</div>
    </section>
  );
}

function countryMapStyle({ countryValue }, maxViews = 0) {
  if (typeof countryValue === "undefined") {
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

function CountryTable({ data, loading, meta }) {
  const gaUnavailable = Boolean(meta?.gaUnavailable ?? meta?.gaMock);
  const [mapTooltip, setMapTooltip] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const mapRef = useRef(null);
  const mapDragRef = useRef(null);

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

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) return;

    const prepareMapPaths = () => {
      mapElement.querySelectorAll("path").forEach((path) => {
        const title = path.querySelector("title");
        if (title?.textContent) path.dataset.countryName = title.textContent;
        path.removeAttribute("role");
        path.removeAttribute("tabindex");
        path.removeAttribute("aria-label");
      });
      mapElement.querySelectorAll("title").forEach((title) => title.remove());
    };

    prepareMapPaths();
    const frameId = requestAnimationFrame(prepareMapPaths);
    return () => cancelAnimationFrame(frameId);
  }, [worldMapData]);

  const handleMapPointerMove = (event) => {
    if (mapDragRef.current) {
      const { startPan, startX, startY } = mapDragRef.current;
      setMapPan({ x: startPan.x + event.clientX - startX, y: startPan.y + event.clientY - startY });
    }

    const countryName = event.target?.closest?.("path")?.dataset?.countryName;
    if (!countryName) {
      setMapTooltip(null);
      return;
    }

    const row = countryLookup[countryName];
    const rect = event.currentTarget.getBoundingClientRect();
    setMapTooltip({ countryName, containerWidth: rect.width, row, x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const handleMapPointerDown = (event) => {
    if (event.target.closest("button")) return;
    mapDragRef.current = { startPan: mapPan, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const stopMapDrag = () => { mapDragRef.current = null; };

  const changeMapZoom = (amount) => {
    setMapZoom((currentZoom) => {
      const nextZoom = Math.min(2.5, Math.max(1, Number((currentZoom + amount).toFixed(2))));
      if (nextZoom === 1) setMapPan({ x: 0, y: 0 });
      return nextZoom;
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <PerformanceSectionHeader
        className="mb-3"
        bordered={false}
        title="Performance by Country — Geographic Breakdown"
        titleClassName="text-[18px] font-semibold leading-tight tracking-normal text-slate-950"
        subtitle="This is the core view — tells us WHERE to spend ad-dollars next month and WHICH countries to expand into."
        badge="Targeting Intelligence"
      />

      {gaUnavailable ? <GaUnavailableNotice className="mb-3" /> : null}

      <div className="mt-3 grid items-stretch gap-3">
        <div className="grid min-w-0 items-stretch gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] xl:grid-cols-[minmax(0,1fr)_220px] 2xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex h-full min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Website Views by Country</h3>
                  <MetricInfo title="Views by country" body="GA views by geography. Rows below blend GA with CRM funnel by phone country." />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {(data?.mapRanges || []).map((mapRange) => (
                  <span key={mapRange.label} className="flex items-center gap-1.5">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mapRange.color }} />
                    {mapRange.label}
                  </span>
                ))}
              </div>
            </div>

            <div
              ref={mapRef}
              className={cx("relative mt-2 flex flex-1 items-center overflow-hidden", mapDragRef.current ? "cursor-grabbing" : "cursor-grab")}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={stopMapDrag}
              onPointerCancel={stopMapDrag}
              onMouseLeave={() => { stopMapDrag(); setMapTooltip(null); }}
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
                <button type="button" className="flex h-7 w-7 items-center justify-center border-0 !bg-white p-0 !text-slate-600 shadow-none transition hover:!bg-slate-50 hover:!text-blue-600 disabled:!bg-white disabled:!text-slate-300" disabled={mapZoom >= 2.5} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); changeMapZoom(0.5); }} title="Zoom in">
                  <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
                <button type="button" className="flex h-7 w-7 items-center justify-center border-0 border-l border-slate-200 !bg-white p-0 !text-slate-600 shadow-none transition hover:!bg-slate-50 hover:!text-blue-600 disabled:!bg-white disabled:!text-slate-300" disabled={mapZoom <= 1} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); changeMapZoom(-0.5); }} title="Zoom out">
                  <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </div>
              {mapTooltip ? (
                <div className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 shadow-lg" style={{ left: Math.min(mapTooltip.x + 12, Math.max(mapTooltip.containerWidth - 150, 8)), top: Math.max(mapTooltip.y - 38, 8) }}>
                  <div className="font-bold text-slate-950">{mapTooltip.row?.country || mapTooltip.countryName}</div>
                  <div className="mt-0.5 text-blue-600">{loading ? "Loading..." : (gaUnavailable ? "— views" : `${formatInt(mapTooltip.row?.views)} views`)}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 border-b border-dashed border-slate-200 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <div>Country</div><div className="text-right">Views</div>
            </div>

            <div className="divide-y divide-dashed divide-slate-100">
              {(countryRows.length ? countryRows : Array.from({ length: 6 }).map((_, i) => ({ country: `row-${i}`, code: "OTHER", views: 0 }))).map((row) => {
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
                    <div className="text-right text-[13px] font-semibold text-slate-950">{loading ? <ShimmerText className="h-3 w-10" /> : (gaUnavailable ? "—" : formatInt(row.views))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-right text-[11px] font-medium text-slate-600">
        Total views:{" "}
        {loading ? (
          <ShimmerText className="inline-block h-3 w-12 align-middle" />
        ) : gaUnavailable ? (
          "—"
        ) : (
          <span className="font-semibold tabular-nums text-slate-900">{formatInt(data?.totalViews ?? 0)}</span>
        )}
      </p>
    </section>
  );
}

function CountryInsights({ data, loading }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <PerformanceSectionHeader
        className="mb-2"
        bordered={false}
        title={(
          <span className="inline-flex items-center gap-1.5">
            Country Insights
            <MetricInfo
              title="Country Insights"
              body="CRM show-up and close rates by lead phone country. Filtered by All, Ads, or Organic and your date range."
            />
          </span>
        )}
      />
      <div className="flex flex-col gap-3">
        <CountryInsightBlock
          title="Best performers"
          infoBody="Highest close rate after a show-up (≥2 bookings, ≥1 show, ≥1 close)."
          Icon={TrendingUp}
          rows={loading ? [] : (data?.bestCountries || [])}
          action="Scale spend where close-after-show is strongest."
          tone="good"
          loading={loading}
        />
        <CountryInsightBlock
          title="Under performers"
          infoBody="Lowest show-up rate (shows ÷ bookings). Includes 0% with zero shows."
          Icon={TrendingDown}
          rows={loading ? [] : (data?.underCountries || [])}
          action="Fix localization and follow-up before scaling spend."
          tone="bad"
          loading={loading}
        />
      </div>
    </section>
  );
}

function CountryInsightBlock({ title, infoBody, Icon, rows, action, tone, loading, className = "" }) {
  const isGood = tone === "good";

  return (
    <div
      className={cx(
        "rounded-xl border p-3",
        isGood ? "border-emerald-200/80 bg-emerald-50/40" : "border-red-200/80 bg-red-50/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} /> : null}
          {title}
        </h3>
        {infoBody ? <MetricInfo title={title} body={infoBody} /> : null}
      </div>

      <div className="mt-2.5 space-y-1.5">
        {loading ? (
          <>
            <ShimmerBlock className="h-10 w-full rounded-lg" />
            <ShimmerBlock className="h-10 w-full rounded-lg" />
            <ShimmerBlock className="h-10 w-full rounded-lg" />
          </>
        ) : rows.length === 0 ? (
          <p className="py-2 text-[11px] font-medium text-slate-500">No countries with enough data in this range.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.code || row.name}
              className={cx(
                "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2",
                isGood ? "border-emerald-100 bg-white/90" : row.zeroShows ? "border-red-200 bg-white" : "border-red-100/80 bg-white/90",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-base leading-none" aria-hidden="true">{row.flag}</span>
                <span className="truncate text-[12px] font-medium text-slate-800">{row.name}</span>
              </div>
              <div className="shrink-0 text-right">
                <p className={cx("text-[12px] font-semibold tabular-nums", isGood ? "text-emerald-700" : row.zeroShows ? "text-red-700" : "text-slate-900")}>
                  {row.metric}
                  <span className="ml-1 text-[10px] font-medium text-slate-500">{row.metricLabel}</span>
                </p>
                <p className="text-[10px] font-medium tabular-nums text-slate-500">{row.sub}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={cx("mt-2.5 rounded-lg px-2.5 py-2 text-[10px] font-medium leading-snug", isGood ? "bg-emerald-100/90 text-emerald-800" : "bg-red-100/90 text-red-800")}>
        <span className="font-semibold">Action:</span> {action}
      </div>
    </div>
  );
}

function TrafficSources({ data, loading, meta }) {
  const gaUnavailable = Boolean(meta?.gaUnavailable ?? meta?.gaMock);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <PerformanceSectionHeader
        className="mb-2"
        title="Traffic Sources"
        subtitle={(
          <span className="inline-flex items-center gap-1.5 not-italic">
            <span>Sorted by GA views (highest first)</span>
            <MetricInfo title="Traffic sources" body="GA views and opt-ins by source. CRM shows bookings, revenue, and close rate." />
          </span>
        )}
      />

      {gaUnavailable ? <GaUnavailableNotice className="mb-2" /> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Top sources</h3>

        <div className="mt-2 divide-y divide-dashed divide-slate-100">
          {((data?.rows?.length ? data.rows : Array.from({ length: 5 }).map((_, i) => ({ name: `source-${i}`, views: 0, optIns: 0, conversion: 0, revenue: 0 })))).map((source) => {
            const Icon = sourceIcon(source.name);
            const rowMeta = gaUnavailable
              ? `${formatInt(source.optIns)} CRM bookings`
              : `${formatInt(source.views)} views · ${formatInt(source.optIns)} opt-ins · ${formatPct(source.optInRate ?? source.conversion)} opt-in`;
            const detailTitle = `${rowMeta}${source.closeRate != null ? ` · ${formatPct(source.closeRate)} close/show` : ""}${source.optInSource ? ` · opt-ins from ${source.optInSource}` : ""}`;
            return (
              <div key={source.name} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50"><Icon className="h-4 w-4 text-indigo-600" strokeWidth={2.2} /></span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2"><div className="truncate text-[12px] font-semibold text-slate-950">{String(source.name).startsWith("source-") ? "—" : source.name}</div></div>
                  <div className="min-w-0"><div className="mt-0.5 truncate text-[10px] font-medium text-slate-500" title={detailTitle}>{loading ? <ShimmerText className="h-3 w-36" /> : rowMeta}</div></div>
                </div>
                <div className="text-right text-[12px] font-semibold text-slate-950">{loading ? <ShimmerText className="h-3 w-14" /> : formatUsd(source.revenue)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FunnelDrilldown({ rows, loading }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <PerformanceSectionHeader
        className="mb-3"
        bordered={false}
        title={(
          <span className="inline-flex items-start gap-2">
            <span>Funnel Performance by Country (Drill-down)</span>
            <MetricInfo title="Country funnel" body="CRM funnel by country plus GA visits and opt-ins in the same columns." />
          </span>
        )}
        titleClassName="text-[18px] font-semibold leading-tight tracking-normal text-slate-950"
        badge="Conversion Comparison"
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="grid grid-cols-[100px_repeat(4,minmax(80px,1fr))_64px_58px] items-end gap-2 border-b border-slate-200 pb-3 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          <div>Country</div>
          <div className="leading-tight" title="Visit → signed up">
            <span className="block">Views</span><span className="ml-3 block">↓</span><span className="block">Opt-in</span>
          </div>
          <div className="leading-tight" title="Signed up → booked call">
            <span className="block">Opt-in</span><span className="ml-3 block">↓</span><span className="block">Book</span>
          </div>
          <div className="leading-tight" title="Booked → showed up">
            <span className="block">Book</span><span className="ml-3 block">↓</span><span className="block">Show</span>
          </div>
          <div className="leading-tight" title="Showed up → bought">
            <span className="block">Show</span><span className="ml-3 block">↓</span><span className="block">Close</span>
          </div>
          <div className="leading-tight" title="Visit → sale">
            <span className="block">End</span><span className="block">to end</span>
          </div>
          <div title="Avg sale amount">AOV</div>
        </div>

        <div className="divide-y divide-slate-100">
          {((rows?.length ? rows : Array.from({ length: 6 }).map((_, i) => ({ country: `row-${i}`, code: "OTHER", optIns: 0, viewsToOptIn: 0, bookings: 0, optInToBook: 0, shows: 0, bookToShow: 0, closes: 0, showToClose: 0, endToEnd: 0, aov: 0 })))).map((row) => {
            const endClass = row.endToEnd >= 0.08 ? "bg-emerald-100 text-emerald-700" : row.endToEnd >= 0.04 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
            return (
              <div key={row.country} className="grid grid-cols-[100px_repeat(4,minmax(80px,1fr))_64px_58px] items-center gap-2 py-3">
                <div className="min-w-0 truncate text-[11px] font-medium text-slate-700"><span className="mr-1.5 text-[12px]" aria-hidden="true">{countryFlag(row.code)}</span>{String(row.country).startsWith("row-") ? "—" : row.country}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.optIns)}(${formatPct(row.viewsToOptIn)})`}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.bookings)}(${formatPct(row.optInToBook)})`}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.shows)}(${formatPct(row.bookToShow)})`}</div>
                <div className="text-[11px] font-medium text-slate-700 tabular-nums">{loading ? <ShimmerText className="h-3 w-16" /> : `${formatInt(row.closes)}(${formatPct(row.showToClose)})`}</div>
                <div><span className={cx("inline-flex rounded-full px-1.5 py-1 text-[9px] font-semibold", endClass)}>{loading ? <ShimmerText className="h-3 w-10" /> : formatPct(row.endToEnd, 3)}</span></div>
                <div className="text-[11px] font-medium text-slate-700">{loading ? <ShimmerText className="h-3 w-10" /> : formatUsd(row.aov)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DevicePagePerformance({ device, engagement, pageViewsDetail, loading, meta }) {
  const gaUnavailable = Boolean(meta?.gaUnavailable ?? meta?.gaMock);
  /** Set true to show the funnel landing URLs card (/ and /pro). */
  const showTopLandingPages = false;

  const deviceData = device || {};
  const engagementData = engagement || {};
  const deviceSegments = [
    {
      label: "Mobile",
      pct: Number(deviceData.mobilePct || 0),
      optInRate: Number(deviceData.mobileOptInRate || 0),
      className: "bg-blue-600",
      dotClassName: "bg-blue-600",
    },
    {
      label: "Desktop",
      pct: Number(deviceData.desktopPct || 0),
      optInRate: Number(deviceData.desktopOptInRate || 0),
      className: "bg-violet-600",
      dotClassName: "bg-violet-600",
    },
    {
      label: "Other",
      pct: Number(deviceData.otherPct || 0),
      optInRate: Number(deviceData.otherOptInRate || 0),
      className: "bg-slate-400",
      dotClassName: "bg-slate-400",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2">
      <PerformanceSectionHeader
        className="mb-3"
        title="Device &amp; Page Performance"
        titleClassName="text-[18px] font-semibold tracking-normal text-slate-950"
      />

      {gaUnavailable ? <GaUnavailableNotice className="mb-2" /> : null}

      <div className="grid grid-cols-1 gap-2">
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Device Split</h3>
            <MetricInfo title="Device split" body="GA sessions by device. Book rate lines use GA call_booked splits." />
          </div>
          <div className="mt-3 flex h-8 overflow-visible rounded-md bg-slate-100">
            {deviceSegments.map((segment) => {
              const width = Math.max(segment.pct, segment.pct > 0 ? 3 : 0);
              return (
                <div
                  key={segment.label}
                  className={cx("group relative flex h-full min-w-0 items-center justify-center px-1 text-[10px] font-bold text-white first:rounded-l-md last:rounded-r-md", segment.className)}
                  style={{ width: `${width}%` }}
                >
                  {loading ? <ShimmerText className="h-3 w-8" /> : <span className="truncate">{gaUnavailable ? "—" : formatPct(segment.pct, 0)}</span>}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[190px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] font-semibold leading-snug text-slate-700 shadow-lg group-hover:block">
                    {loading ? "Loading..." : (
                      <>
                        <div className="text-slate-950">{segment.label}</div>
                        <div className="mt-0.5 font-medium text-slate-500">Traffic: {formatPct(segment.pct, 1)}</div>
                        {segment.optInRate == null ? null : (
                          <div className="font-medium text-slate-500">
                            Book rate: {formatPct(segment.optInRate, 1)}
                          </div>
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
                <span className="font-semibold text-slate-700">{loading ? <ShimmerText className="h-3 w-10" /> : (gaUnavailable ? "—" : formatPct(segment.pct, 1))}</span>
              </span>
            ))}
          </div>
        </section>

        {showTopLandingPages ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Top Landing Pages</h3>
            <MetricInfo title="Landing pages" body="GA session share on funnel landing URLs (/ and /pro only)." />
          </div>
          <div className="mt-3 divide-y divide-dashed divide-slate-100">
            {(deviceData.topLandingPages?.length ? deviceData.topLandingPages : Array.from({ length: 4 }).map((_, i) => ({ page: `page-${i}`, sessions: 0, share: 0 }))).map((page) => (
              <div key={page.page} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate text-[13px] font-medium text-slate-700">{String(page.page).startsWith("page-") ? "—" : page.page}</span>
                <span className="shrink-0 text-right text-[12px] font-semibold leading-tight text-slate-950">
                  {loading ? <ShimmerText className="h-3 w-14" /> : (
                    <>
                      <span className="block">{gaUnavailable ? "—" : `${formatInt(page.sessions)} sessions`}</span>
                      <span className="block text-[10px] font-medium text-slate-500">{gaUnavailable ? "" : `${formatPct(page.share)} share`}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-3" id="page-views-detail">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Page views by path</h3>
            <MetricInfo
              title="Page views by path"
              body="Top paths by GA screenPageViews for the selected period, traffic arm, and country filter."
            />
          </div>
          <div className="mt-3 divide-y divide-dashed divide-slate-100">
            {(pageViewsDetail?.topPaths?.length
              ? pageViewsDetail.topPaths
              : Array.from({ length: 5 }).map((_, i) => ({ path: `page-${i}`, views: 0, share: 0 }))
            ).map((row) => (
              <div key={row.path} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate text-[13px] font-medium text-slate-700">
                  {String(row.path).startsWith("page-") ? "—" : row.path}
                </span>
                <span className="shrink-0 text-right text-[12px] font-semibold leading-tight text-slate-950">
                  {loading ? <ShimmerText className="h-3 w-14" /> : (
                    <>
                      <span className="block">{gaUnavailable ? "—" : `${formatInt(row.views)} views`}</span>
                      <span className="block text-[10px] font-medium text-slate-500">{gaUnavailable ? "" : `${formatPct(row.share)} share`}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
          {!gaUnavailable && pageViewsDetail?.error ? (
            <p className="mt-2 text-[10px] font-medium text-amber-700">{pageViewsDetail.error}</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Avg Time on Page</h3>
            <MetricInfo title="Time on site" body="GA average time on page for All, Ads, or Organic. Completion = video_complete ÷ video_start." />
          </div>
          <div className="mt-3 text-[28px] font-semibold leading-none text-blue-600">{loading ? <ShimmerText className="h-8 w-16" /> : (gaUnavailable ? "—" : secondsToClock(engagementData.avgTimeSec))}</div>
          <p className="mt-2 text-[12px] font-medium text-slate-500" title="video_complete divided by video_start on the selected VSL page(s).">
            VSL completion: {loading ? <ShimmerText className="h-3 w-12" /> : (gaUnavailable || engagementData.vslCompletionPct == null ? "—" : formatPct(engagementData.vslCompletionPct, 0))}
          </p>
          <div className="mt-3 space-y-1.5">
            {loading ? (
              <>
                <ShimmerBlock className="h-4 w-full" />
                <ShimmerBlock className="h-4 w-4/5" />
                <ShimmerBlock className="h-4 w-3/5" />
              </>
            ) : (engagementData.vslProgressRanges?.length ? engagementData.vslProgressRanges : []).map((range) => (
              <div key={range.percent} className="flex items-center justify-between gap-3 text-[11px] font-medium">
                <span className="text-slate-500">{formatPct(range.percent, 0)} watched</span>
                <span className="font-semibold text-slate-950">{formatInt(range.events)} events</span>
              </div>
            ))}
            {!loading && !engagementData.vslProgressRanges?.length && engagementData.vslFallbackRanges?.length ? engagementData.vslFallbackRanges.map((range) => (
              <div key={range.label} className="flex items-center justify-between gap-3 text-[11px] font-medium">
                <span className="text-slate-500">{range.label}</span>
                <span className="font-semibold text-slate-950">{formatInt(range.events)} events</span>
              </div>
            )) : null}
            {!loading && !engagementData.vslProgressRanges?.length && !engagementData.vslFallbackRanges?.length ? (
              <div className="text-[11px] font-medium text-slate-400">
                {"No VSL video events found"}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

export default function Performance() {
  const [range, setRange] = useState("mtd");

  const customFallback = useMemo(() => getPerformanceRangeBounds("mtd"), []);
  const [customStart, setCustomStart] = useState(() => isoDay(customFallback.start));
  const [customEnd, setCustomEnd] = useState(() => isoDay(customFallback.end));

  const [armFilter, setArmFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("");

  const { loading, data, meta, error } = usePerformanceData(range, customStart, customEnd, armFilter, countryFilter);

  useEffect(() => {
    const choices = meta?.countryFilterChoices;
    if (!countryFilter || !choices?.length) return;
    if (!choices.some((c) => c.value === countryFilter)) setCountryFilter("");
  }, [meta, countryFilter]);

  const rangeBounds = useMemo(
    () => getPerformanceRangeBounds(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  return (
    <div className="flex flex-col gap-4">
      <PerformanceGlobalFilters
        range={range}
        onRangeChange={setRange}
        customStart={customStart}
        onCustomStartChange={setCustomStart}
        customEnd={customEnd}
        onCustomEndChange={setCustomEnd}
        armFilter={armFilter}
        onArmFilterChange={setArmFilter}
        countryFilter={countryFilter}
        onCountryFilterChange={setCountryFilter}
        countryFilterChoices={meta?.countryFilterChoices ?? []}
        rangeBounds={rangeBounds}
        loading={loading}
      />

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
          Failed to load performance data: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <TopLineSection
            data={data?.topline}
            loading={loading}
            meta={meta}
            armFilter={armFilter}
          />
          <DevicePagePerformance
            device={data?.device}
            engagement={data?.engagement}
            pageViewsDetail={data?.pageViewsDetail}
            loading={loading}
            meta={meta}
          />
        </div>

        <div className="col-span-4 flex flex-col gap-3">
          <CountryTable data={data?.country} loading={loading} meta={meta} />
          <div>
            <FunnelDrilldown rows={data?.country?.rows} loading={loading} />
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-3">
          <TrafficSources data={data?.traffic} loading={loading} meta={meta} />
          <CountryInsights data={data?.country} loading={loading} />
        </div>
      </div>
    </div>
  );
}
