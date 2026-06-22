/**
 * Watch List — data access + metric computation (single file).
 *
 * Surfaces every individual setter/closer core metric that is currently below
 * benchmark, averaged over the last N days (default 10). The tab badge
 * (via useWatchList) counts these per-person breaches plus any team-wide funnel
 * metric below benchmark; the page body shows the per-person breaches in detail.
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
// conversion, PIF, AOV). Success rate is tracked team-wide in the funnel header
// (see FUNNEL_METRICS) rather than flagged per person.
const SETTER_METRICS = ["confirmationRate", "showUpRate"];
const CLOSER_METRICS = ["showUpRate", "conversionRate", "pifRate", "aov"];

// Team-wide aggregate funnel shown above the per-person breach tables.
const FUNNEL_METRICS = ["confirmationRate", "showUpRate", "conversionRate", "successRate", "aov"];

function pct(num, den) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return (n / d) * 100;
}

const isTrue = (v) => v === true || v === "true";
const isReschedule = (c) => isTrue(c?.is_reschedule);

/**
 * Team-wide funnel rates computed with the canonical Metrics-table definitions
 * (see metrics-v2/useManagementMetricsData.js → fetchStatsData). Each stage of
 * the funnel is measured on its OWN cohort/date field, not a single call_date
 * cohort:
 *   - Confirmation = confirmed / bookings, by `book_date` (reschedule-deduped)
 *   - Show-up      = showed / confirmed, over calls that have HAPPENED (call_date ≤ now)
 *   - Conversion   = purchased / showed, purchases counted by `purchase_date`
 *   - Success      = purchased / totalBooked (booked by call_date, incl. cancelled + future)
 * Returns only the four flagged funnel metrics; AOV stays on its existing basis.
 */
export function computeFunnelHeadline({ bookings = [], calls = [], purchases = [], now = new Date() } = {}) {
  // Confirmation — bookings cohort (book_date), reschedule-deduped.
  const reschedBookingLeads = new Set(bookings.filter(isReschedule).map((b) => b.lead_id));
  const filteredBookings = bookings.filter((b) => isReschedule(b) || !reschedBookingLeads.has(b.lead_id));
  const bookingsForConfirmation = filteredBookings.length;
  const confirmedFromBookings = filteredBookings.filter((b) => isTrue(b.confirmed)).length;

  // Booked / show-up cohort (call_date), reschedule-deduped. totalBooked keeps
  // cancelled + future calls (matches the Metrics-table Success denominator).
  const reschedCallLeads = new Set(calls.filter(isReschedule).map((c) => c.lead_id));
  const filteredCalls = calls.filter((c) => isReschedule(c) || !reschedCallLeads.has(c.lead_id));
  const totalBooked = filteredCalls.length;
  const nowMs = now.getTime();
  const happened = filteredCalls.filter((c) => c.call_date && new Date(c.call_date).getTime() <= nowMs);
  const totalShowedUp = happened.filter((c) => isTrue(c.showed_up)).length;
  const totalConfirmed = happened.filter((c) => isTrue(c.confirmed)).length;

  // Purchases cohort (purchase_date) — latest outcome row per call.
  const latestByCall = new Map();
  for (const row of purchases) {
    const cid = row?.calls?.id;
    if (!cid) continue;
    const existing = latestByCall.get(cid);
    if (!existing || row.id > existing.id) latestByCall.set(cid, row);
  }
  const totalPurchased = latestByCall.size;

  return {
    confirmationRate: pct(confirmedFromBookings, bookingsForConfirmation),
    showUpRate: pct(totalShowedUp, totalConfirmed),
    conversionRate: pct(totalPurchased, totalShowedUp),
    successRate: pct(totalPurchased, totalBooked),
  };
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
export function computeWatchList({ calls = [], sales = [], setters = [], closers = [], cutoffISO, funnelOverrides = null } = {}) {
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

  // Team-wide aggregate for the funnel header — each call/sale counted ONCE
  // (not once per matched setter + closer) so the funnel reflects the business.
  const teamRecent = emptyAgg();

  for (const c of calls) {
    if (c?.cancelled === true) continue;
    const recent = isRecent(c?.call_date);
    const bucket = recent ? "recent" : "prior";
    const confirmed = c?.confirmed === true;
    const showed = c?.showed_up === true;
    if (recent) { teamRecent.booked += 1; if (confirmed) teamRecent.confirmed += 1; if (showed) teamRecent.showed += 1; }
    const s = setterMap.get(String(c?.setter_id || ""));
    if (s) { const a = s[bucket]; a.booked += 1; if (confirmed) a.confirmed += 1; if (showed) a.showed += 1; }
    const cl = closerMap.get(String(c?.closer_id || ""));
    if (cl) { const a = cl[bucket]; a.booked += 1; if (confirmed) a.confirmed += 1; if (showed) a.showed += 1; }
  }

  for (const sale of sales) {
    // Bucket by the call's date so the funnel numerator shares the same call
    // cohort as the booked/confirmed/showed denominators.
    const recent = isRecent(sale?.call_date);
    const bucket = recent ? "recent" : "prior";
    const isPif = sale?.PIF === true;
    const price = Number(sale?.price);
    const priceOk = Number.isFinite(price) && price > 0;
    if (recent) { teamRecent.sales += 1; if (isPif) teamRecent.pifSales += 1; if (priceOk) teamRecent.aovSum += price; }
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

  // Team-wide funnel (last window) — value + benchmark + color level per metric.
  const teamRates = ratesFromAgg(teamRecent);
  const funnel = FUNNEL_METRICS.map((id) => {
    const def = CORE[id];
    // Use the canonical Metrics-table value when provided (confirmation, show-up,
    // conversion, success); AOV and any unmapped metric fall back to teamRates.
    const value = funnelOverrides && id in funnelOverrides ? funnelOverrides[id] : teamRates[id];
    return {
      id,
      label: def.label,
      unit: def.unit,
      value,
      target: def.target,
      level: value == null ? null : levelFor(id, value),
    };
  });

  // Team-wide funnel metrics below benchmark — counted in the tab badge on top
  // of the per-person breach rows. These are surfaced in the funnel header cards
  // (not the per-person table), so they only feed the badge total.
  const funnelBreachCount = funnel.filter((m) => m.value != null && m.value < m.target).length;

  return {
    rows,
    funnel,
    badgeCount: rows.length + funnelBreachCount,
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
 * Resolve the recent window from either a day count (number) or an explicit
 * { startISO, endISO } range. Returns { startISO, endISO, startDate, endDate }.
 */
function resolveRange(arg) {
  if (arg && typeof arg === "object" && arg.startISO && arg.endISO) {
    return {
      startISO: arg.startISO,
      endISO: arg.endISO,
      startDate: new Date(arg.startISO),
      endDate: new Date(arg.endISO),
    };
  }
  const days = typeof arg === "number" ? arg : WATCH_WINDOW_DAYS;
  const r = DateHelpers.getLastNDaysRange(days);
  return { startISO: r.startISO, endISO: r.endISO, startDate: r.startDate, endDate: r.endDate };
}

/**
 * Load + compute the watch list for a window — either a `days` count (number,
 * default 10) or an explicit `{ startISO, endISO }` range. Also fetches the
 * equal-length window immediately before it so trend direction can compare the
 * recent window against the one before it.
 */
export async function loadWatchList(arg = WATCH_WINDOW_DAYS) {
  const range = resolveRange(arg); // recent window (headline + label)
  const cutoffISO = range.startISO;

  // Prior window = equal-length period immediately before the recent window.
  const spanMs = Math.max(0, range.endDate.getTime() - range.startDate.getTime());
  const fullStartISO = new Date(range.startDate.getTime() - spanMs).toISOString();
  const fullEndISO = range.endISO;

  // Recent-window data for the team funnel, fetched on the canonical
  // Metrics-table basis (each funnel stage on its own cohort/date field). These
  // power ONLY the funnel header; the per-person breach logic below is unchanged.
  const [settersRes, closersRes, calls, sales, funnelBookings, funnelCalls, funnelPurchases] = await Promise.all([
    supabase.from("setters").select("id, name").eq("active", true),
    supabase.from("closers").select("id, name").eq("active", true),
    fetchAllRows(() =>
      supabase
        .from("calls")
        .select("setter_id, closer_id, confirmed, showed_up, cancelled, call_date")
        .gte("call_date", fullStartISO)
        .lte("call_date", fullEndISO),
    ),
    fetchAllRows(() =>
      // Cohort by the CALL's date, not purchase_date: a sale belongs to the
      // window its call happened in (matching the booked/showed denominators),
      // regardless of when payment landed. Filtering on the embedded calls
      // table is the same pattern used elsewhere (e.g. Closer.jsx).
      supabase
        .from("outcome_log")
        .select("PIF, calls!inner!closer_notes_call_id_fkey(setter_id, closer_id, call_date), offers!offer_id(price, kajabi_id)")
        .eq("outcome", "yes")
        .gte("calls.call_date", fullStartISO)
        .lte("calls.call_date", fullEndISO),
    ),
    // Funnel — Confirmation cohort: bookings by book_date (reschedule-deduped).
    fetchAllRows(() =>
      supabase
        .from("calls")
        .select("lead_id, confirmed, is_reschedule, book_date")
        .gte("book_date", cutoffISO)
        .lte("book_date", range.endISO),
    ),
    // Funnel — Show-up + Success-denominator cohort: calls by call_date
    // (reschedule-deduped; keeps cancelled + future so totalBooked matches Metrics).
    fetchAllRows(() =>
      supabase
        .from("calls")
        .select("id, lead_id, confirmed, showed_up, is_reschedule, call_date")
        .gte("call_date", cutoffISO)
        .lte("call_date", range.endISO),
    ),
    // Funnel — Conversion + Success-numerator cohort: purchases by purchase_date.
    fetchAllRows(() =>
      supabase
        .from("outcome_log")
        .select("id, outcome, purchase_date, calls!inner!closer_notes_call_id_fkey(id)")
        .in("outcome", ["yes", "refund"])
        .gte("purchase_date", cutoffISO)
        .lte("purchase_date", range.endISO),
    ),
  ]);

  if (settersRes.error) throw settersRes.error;
  if (closersRes.error) throw closersRes.error;

  const funnelOverrides = computeFunnelHeadline({
    bookings: funnelBookings || [],
    calls: funnelCalls || [],
    purchases: funnelPurchases || [],
  });

  const salesRows = (sales || []).map((s) => ({
    setter_id: s?.calls?.setter_id ?? null,
    closer_id: s?.calls?.closer_id ?? null,
    PIF: String(s?.offers?.kajabi_id) === "2150757309",
    price: Number(s?.offers?.price),
    // Cohort key — the call's date (see query above), not the payment date.
    call_date: s?.calls?.call_date ?? null,
  }));

  const result = computeWatchList({
    calls: calls || [],
    sales: salesRows,
    setters: settersRes.data || [],
    closers: closersRes.data || [],
    cutoffISO,
    funnelOverrides,
  });

  return { ...result, range };
}