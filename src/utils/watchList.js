/**
 * Watch List — data access + metric computation (single file).
 *
 * Surfaces every individual setter/closer core metric that is currently below
 * benchmark, averaged over the last N days (default 10). Used by both the tab
 * body and the tab badge (via useWatchList) so the count always matches the page.
 *
 * Benchmarks + colors come from utils/performanceBenchmarks.js (the approved
 * source). Nothing is hard-coded here. All tracked metrics are "higher is
 * better", so a metric is BELOW BENCHMARK when its value < target.
 */
import { supabase } from "../lib/supabaseClient";
import * as DateHelpers from "./dateHelpers";
import {
  BENCHMARKS,
  PERFORMANCE_COLORS,
  getConfirmationColor,
  getShowUpColor,
  getConversionColor,
  getSuccessColor,
  getPifColor,
  getAovColor,
} from "./performanceBenchmarks";

/** Default window — Emiliano's last-10-days cadence. */
export const WATCH_WINDOW_DAYS = 10;

// Reverse map hex → level so we can label severity/coloring from the existing
// getXColor() helpers without duplicating any thresholds.
const HEX_TO_LEVEL = Object.fromEntries(
  Object.entries(PERFORMANCE_COLORS).map(([level, hex]) => [hex, level]),
);

/** Core metric registry. `color` is the existing per-metric color helper. */
const CORE = {
  confirmationRate: { label: "Confirmation rate", unit: "%", target: BENCHMARKS.CONFIRMATION, color: getConfirmationColor },
  showUpRate:       { label: "Show-up rate",      unit: "%", target: BENCHMARKS.SHOW_UP,      color: getShowUpColor },
  conversionRate:   { label: "Conversion rate",   unit: "%", target: BENCHMARKS.CONVERSION,   color: getConversionColor },
  successRate:      { label: "Success rate",      unit: "%", target: BENCHMARKS.SUCCESS,      color: getSuccessColor },
  pifRate:          { label: "PIF rate",          unit: "%", target: BENCHMARKS.PIF_RATE,     color: getPifColor },
  aov:              { label: "AOV",               unit: "$", target: BENCHMARKS.AOV,          color: getAovColor },
};

// Mirrors the Setter tab (confirmation + show-up) and Closer table (show-up,
// conversion, PIF, AOV, success) so all three tabs tell the same story.
const SETTER_METRICS = ["confirmationRate", "showUpRate", "successRate"];
const CLOSER_METRICS = ["showUpRate", "conversionRate", "successRate", "pifRate", "aov"];

function pct(num, den) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return (n / d) * 100;
}

function emptyAgg() {
  return { booked: 0, confirmed: 0, showed: 0, sales: 0, pifSales: 0, aovSum: 0 };
}

function ratesFromAgg(a) {
  return {
    confirmationRate: pct(a.confirmed, a.booked),
    showUpRate: pct(a.showed, a.confirmed),
    conversionRate: pct(a.sales, a.showed),
    successRate: pct(a.sales, a.booked),
    pifRate: pct(a.pifSales, a.sales),
    aov: a.sales > 0 ? a.aovSum / a.sales : null,
  };
}

function levelFor(id, value) {
  return HEX_TO_LEVEL[CORE[id].color(value)] ?? null;
}

/** Compare recent vs prior window. Same unit-aware threshold for stability. */
function trendFor(id, recent, prior) {
  if (recent == null || prior == null) return null;
  const delta = recent - prior;
  const thr = CORE[id].unit === "$" ? 50 : 2; // $50 or 2 percentage points
  if (delta > thr) return "improving";
  if (delta < -thr) return "declining";
  return "stable";
}

/** Gap-based severity so it reads the same across every metric. */
function severityFor(gapPct) {
  if (gapPct >= 0.2) return "Critical";
  if (gapPct >= 0.08) return "Warning";
  return "Slightly below";
}

function evalEntity(recentAgg, priorAgg, metricIds) {
  const recent = ratesFromAgg(recentAgg);
  const prior = ratesFromAgg(priorAgg);
  return metricIds
    .map((id) => {
      const value = recent[id];
      // No activity in the window → not enough data to flag a breach.
      if (value == null) return null;
      const def = CORE[id];
      const gap = value - def.target; // negative = below target
      const gapPct = def.target > 0 ? Math.max(0, -gap) / def.target : 0;
      const below = value < def.target;
      return {
        id,
        label: def.label,
        unit: def.unit,
        value,
        target: def.target,
        level: levelFor(id, value),
        below,
        gap,
        gapPct,
        trend: trendFor(id, value, prior[id]),
        severity: below ? severityFor(gapPct) : null,
      };
    })
    .filter(Boolean);
}

/**
 * Pure computation. `cutoffISO` splits the fetched rows into the recent window
 * (>= cutoff, used for the headline averages) and the prior window (used only
 * for trend direction).
 */
export function computeWatchList({ calls = [], sales = [], setters = [], closers = [], cutoffISO } = {}) {
  const cutoff = cutoffISO ? new Date(cutoffISO).getTime() : null;
  const isRecent = (iso) => {
    if (cutoff == null) return true;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t >= cutoff : true;
  };

  const setterMap = new Map();
  const closerMap = new Map();
  for (const s of setters)
    setterMap.set(String(s.id), { id: String(s.id), name: s.name || `Setter ${s.id}`, recent: emptyAgg(), prior: emptyAgg() });
  for (const c of closers)
    closerMap.set(String(c.id), { id: String(c.id), name: c.name || `Closer ${c.id}`, recent: emptyAgg(), prior: emptyAgg() });

  for (const c of calls) {
    if (c?.cancelled === true) continue;
    const bucket = isRecent(c?.call_date) ? "recent" : "prior";
    const confirmed = c?.confirmed === true;
    const showed = c?.showed_up === true;
    const s = setterMap.get(String(c?.setter_id || ""));
    if (s) { const a = s[bucket]; a.booked += 1; if (confirmed) a.confirmed += 1; if (showed) a.showed += 1; }
    const cl = closerMap.get(String(c?.closer_id || ""));
    if (cl) { const a = cl[bucket]; a.booked += 1; if (confirmed) a.confirmed += 1; if (showed) a.showed += 1; }
  }

  for (const sale of sales) {
    const bucket = isRecent(sale?.purchase_date) ? "recent" : "prior";
    const isPif = sale?.PIF === true;
    const price = Number(sale?.price);
    const priceOk = Number.isFinite(price) && price > 0;
    const s = setterMap.get(String(sale?.setter_id || ""));
    if (s) { const a = s[bucket]; a.sales += 1; if (isPif) a.pifSales += 1; if (priceOk) a.aovSum += price; }
    const cl = closerMap.get(String(sale?.closer_id || ""));
    if (cl) { const a = cl[bucket]; a.sales += 1; if (isPif) a.pifSales += 1; if (priceOk) a.aovSum += price; }
  }

  const buildList = (map, role, metricIds) =>
    Array.from(map.values())
      .map((e) => {
        const metrics = evalEntity(e.recent, e.prior, metricIds);
        return { id: e.id, name: e.name, role, metrics, breaches: metrics.filter((m) => m.below) };
      })
      .filter((e) => e.metrics.length > 0); // only people with activity in the window

  const setterList = buildList(setterMap, "Setter", SETTER_METRICS);
  const closerList = buildList(closerMap, "Closer", CLOSER_METRICS);

  // Flat breach rows for the table — most underperforming (largest gap) first.
  const rows = [...setterList, ...closerList]
    .flatMap((e) => e.breaches.map((m) => ({ person: e.name, role: e.role, ...m })))
    .sort((a, b) => b.gapPct - a.gapPct || a.person.localeCompare(b.person));

  return {
    rows,
    badgeCount: rows.length,
    counts: {
      total: rows.length,
      flaggedSetters: setterList.filter((e) => e.breaches.length > 0).length,
      flaggedClosers: closerList.filter((e) => e.breaches.length > 0).length,
      totalSetters: setterList.length,
      totalClosers: closerList.length,
    },
  };
}

async function fetchAllRows(buildQuery, pageSize = 1000, maxRows = 50000) {
  const out = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Load + compute the watch list for the last `days` days. Fetches a 2×window so
 * trend direction can compare the recent window against the one before it.
 */
export async function loadWatchList(days = WATCH_WINDOW_DAYS) {
  const range = DateHelpers.getLastNDaysRange(days); // recent window (headline + label)
  const full = DateHelpers.getLastNDaysRange(days * 2); // recent + prior (trend)
  const cutoffISO = range.startISO;

  const [settersRes, closersRes, calls, sales] = await Promise.all([
    supabase.from("setters").select("id, name").eq("active", true),
    supabase.from("closers").select("id, name").eq("active", true),
    fetchAllRows(() =>
      supabase
        .from("calls")
        .select("setter_id, closer_id, confirmed, showed_up, cancelled, call_date")
        .gte("call_date", full.startISO)
        .lte("call_date", full.endISO),
    ),
    fetchAllRows(() =>
      supabase
        .from("outcome_log")
        .select("PIF, purchase_date, calls!inner!closer_notes_call_id_fkey(setter_id, closer_id), offers!offer_id(price, kajabi_id)")
        .eq("outcome", "yes")
        .gte("purchase_date", full.startISO)
        .lte("purchase_date", full.endISO),
    ),
  ]);

  if (settersRes.error) throw settersRes.error;
  if (closersRes.error) throw closersRes.error;

  const salesRows = (sales || []).map((s) => ({
    setter_id: s?.calls?.setter_id ?? null,
    closer_id: s?.calls?.closer_id ?? null,
    PIF: String(s?.offers?.kajabi_id) === "2150757309",
    price: Number(s?.offers?.price),
    purchase_date: s?.purchase_date ?? null,
  }));

  const result = computeWatchList({
    calls: calls || [],
    sales: salesRows,
    setters: settersRes.data || [],
    closers: closersRes.data || [],
    cutoffISO,
  });

  return { ...result, range };
}