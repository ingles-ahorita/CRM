/**
 * CRM performance benchmarks — single source of truth (not wired into UI yet).
 *
 *   import { METRIC, benchmark, COLORS, CLASS, METRICS } from "./benchmarks";
 *
 *   style={{ color: benchmark(rate, METRIC.showUpRate) }}              // hex (default)
 *   style={{ backgroundColor: benchmark(rate, METRIC.showUpRate) }}     // hex
 *   className={benchmark(rate, METRIC.showUpRate, "text")}            // Tailwind text
 *   className={benchmark(rate, METRIC.showUpRate, "bg")}               // Tailwind bg
 *   className={benchmark(rate, METRIC.showUpRate, "softBg")}            // badge-style
 *
 *   METRICS[METRIC.showUpRate].target  // 55
 */

/** Hex — charts, Recharts, inline style color / backgroundColor */
export const COLORS = {
  BAD: "#ef4444",
  OK: "#eab308",
  GOOD: "#84a98c",
  GREAT: "#15803d",
};

/** Tailwind — className on text, fills, and soft badges (same 4 tiers as COLORS) */
export const CLASS = {
  text: {
    BAD: "text-rose-600",
    OK: "text-amber-600",
    GOOD: "text-[#5f7f66]",
    GREAT: "text-emerald-800",
  },
  bg: {
    BAD: "bg-rose-600",
    OK: "bg-amber-600",
    GOOD: "bg-[#84a98c]",
    GREAT: "bg-emerald-800",
  },
  softBg: {
    BAD: "bg-rose-100 text-rose-700 border-rose-200",
    OK: "bg-amber-100 text-amber-700 border-amber-200",
    GOOD: "bg-[#e8f0e8] text-[#4f6f54] border-[#c8d8c8]",
    GREAT: "bg-emerald-900 text-white border-emerald-900",
  },
};

/** @returns {"BAD"|"OK"|"GOOD"|"GREAT"|null} */
export function benchmarkLevel(value, metricId) {
  const n = Number(value);
  const def = METRICS[metricId];
  if (!def || !Number.isFinite(n)) return null;
  for (const [max, level] of def.bands) {
    if (n < max) return level;
  }
  return null;
}

/**
 * @param {"hex"|"text"|"bg"|"softBg"} [as="hex"]
 * @returns {string|null} hex or Tailwind classes from COLORS / CLASS
 */
export function benchmark(value, metricId, as = "hex") {
  const level = benchmarkLevel(value, metricId);
  if (!level) return null;
  if (as === "hex") return COLORS[level];
  return CLASS[as]?.[level] ?? null;
}

export const METRIC = {
  // Core funnel rates (existing)
  confirmationRate: "confirmationRate",
  showUpRate: "showUpRate",
  conversionRate: "conversionRate",
  successRate: "successRate",
  pifRate: "pifRate",
  aov: "aov",

  // Overview / Setters / Closers
  pickupRate: "pickupRate",
  aoc: "aoc",
  organicCloseRate: "organicCloseRate",

  // Metrics tab
  revenuePacePct: "revenuePacePct",
  refundRate: "refundRate",
  retentionRate: "retentionRate",
  avgLtv: "avgLtv",
  avgResponseTimeMinutes: "avgResponseTimeMinutes",
  notContactedCount: "notContactedCount",
  openFollowUpCount: "openFollowUpCount",
  heatmapConversionRate: "heatmapConversionRate",
  visitorToCustomerRate: "visitorToCustomerRate",
  funnelStepRate: "funnelStepRate",

  // Sales tab
  dailyRevenuePacePct: "dailyRevenuePacePct",

  // Performance / Organic
  optInRate: "optInRate",
  bookingRate: "bookingRate",
  watchRate: "watchRate",
  vslCompletionRate: "vslCompletionRate",
  viewsToOptInRate: "viewsToOptInRate",
  optInToBookRate: "optInToBookRate",
  bookToShowRate: "bookToShowRate",
  showToCloseRate: "showToCloseRate",
  endToEndRate: "endToEndRate",
  countryEndToEndRate: "countryEndToEndRate",
  countryEndToEndFunnelRate: "countryEndToEndFunnelRate",
  sourceCloseRate: "sourceCloseRate",
  deviceOptInRate: "deviceOptInRate",

  // Leads tab
  responseTimeMinutes: "responseTimeMinutes",

  // Closer dashboard (/closer/:id)
  // Aliases point to existing exact benchmarks where the dashboard already
  // uses the same performance logic.
  closerClosingRate: "conversionRate",
  closerPifRate: "pifRate",
  closerAov: "aov",
  closerAoc: "aoc",
  closerResponseTimeMinutes: "responseTimeMinutes",
  closerShowUpRate: "closerShowUpRate",
  closerDownsellRate: "closerDownsellRate",
  recoveredContactRate: "recoveredContactRate",
  recoveredRebookRate: "recoveredRebookRate",
  recoveredShowUpRate: "recoveredShowUpRate",
  recoveredCloseRate: "recoveredCloseRate",
  multipayPaymentsMade: "multipayPaymentsMade",
  payoffOpportunityDaysLeft: "payoffOpportunityDaysLeft",
};

export const METRICS = {
  [METRIC.confirmationRate]: {
    target: 65,
    bands: [
      [65, "BAD"],
      [Infinity, "GOOD"],
    ],
  },
  [METRIC.showUpRate]: {
    target: 55,
    bands: [
      [45, "BAD"],
      [55, "OK"],
      [65, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.conversionRate]: {
    target: 32,
    bands: [
      [25, "BAD"],
      [30, "OK"],
      [35, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.successRate]: {
    target: 12,
    bands: [
      [9, "BAD"],
      [12, "OK"],
      [15, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.pifRate]: {
    target: 25,
    bands: [
      [20, "BAD"],
      [25, "OK"],
      [30, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.aov]: {
    target: 875,
    bands: [
      [750, "BAD"],
      [875, "OK"],
      [1000, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },

  // Overview / Setters / Closers
  [METRIC.pickupRate]: {
    target: 65,
    bands: [
      [65, "BAD"],
      [Infinity, "GOOD"],
    ],
  },
  [METRIC.aoc]: {
    target: 875,
    bands: [
      [750, "BAD"],
      [875, "OK"],
      [1000, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.organicCloseRate]: {
    target: 32,
    bands: [
      [25, "BAD"],
      [30, "OK"],
      [35, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },

  // Metrics tab
  [METRIC.revenuePacePct]: {
    target: 100,
    bands: [
      [90, "BAD"],
      [100, "OK"],
      [110, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.refundRate]: {
    target: 5,
    bands: [
      [2, "GREAT"],
      [5, "GOOD"],
      [8, "OK"],
      [Infinity, "BAD"],
    ],
  },
  [METRIC.retentionRate]: {
    target: 60,
    bands: [
      [40, "BAD"],
      [60, "OK"],
      [75, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.avgLtv]: {
    target: 1000,
    bands: [
      [750, "BAD"],
      [1000, "OK"],
      [1400, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.avgResponseTimeMinutes]: {
    target: 5,
    bands: [
      [5, "GREAT"],
      [15, "GOOD"],
      [60, "OK"],
      [Infinity, "BAD"],
    ],
  },
  [METRIC.notContactedCount]: {
    target: 0,
    bands: [
      [1, "GREAT"],
      [5, "GOOD"],
      [12, "OK"],
      [Infinity, "BAD"],
    ],
  },
  [METRIC.openFollowUpCount]: {
    target: 0,
    bands: [
      [5, "GREAT"],
      [15, "GOOD"],
      [30, "OK"],
      [Infinity, "BAD"],
    ],
  },
  [METRIC.heatmapConversionRate]: {
    target: 50,
    bands: [
      [25, "BAD"],
      [50, "OK"],
      [75, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.visitorToCustomerRate]: {
    target: 12,
    bands: [
      [9, "BAD"],
      [12, "OK"],
      [15, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.funnelStepRate]: {
    target: 55,
    bands: [
      [45, "BAD"],
      [55, "OK"],
      [65, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },

  // Sales tab
  [METRIC.dailyRevenuePacePct]: {
    target: 100,
    bands: [
      [70, "BAD"],
      [100, "OK"],
      [120, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },

  // Performance / Organic
  [METRIC.optInRate]: {
    target: 30,
    bands: [
      [20, "BAD"],
      [30, "OK"],
      [40, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.bookingRate]: {
    target: 55,
    bands: [
      [40, "BAD"],
      [55, "OK"],
      [70, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.watchRate]: {
    target: 55,
    bands: [
      [40, "BAD"],
      [55, "OK"],
      [70, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.vslCompletionRate]: {
    target: 30,
    bands: [
      [20, "BAD"],
      [30, "OK"],
      [45, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.viewsToOptInRate]: {
    target: 30,
    bands: [
      [20, "BAD"],
      [30, "OK"],
      [40, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.optInToBookRate]: {
    target: 55,
    bands: [
      [40, "BAD"],
      [55, "OK"],
      [70, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.bookToShowRate]: {
    target: 55,
    bands: [
      [45, "BAD"],
      [55, "OK"],
      [65, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.showToCloseRate]: {
    target: 32,
    bands: [
      [25, "BAD"],
      [30, "OK"],
      [35, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.endToEndRate]: {
    target: 12,
    bands: [
      [8, "BAD"],
      [12, "OK"],
      [16, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.countryEndToEndRate]: {
    target: 12,
    bands: [
      [8, "BAD"],
      [12, "OK"],
      [16, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  // Performance tab country funnel (current UI behavior): <4% bad, 4-8% okay, >=8% great
  [METRIC.countryEndToEndFunnelRate]: {
    target: 8,
    bands: [
      [4, "BAD"],
      [8, "OK"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.sourceCloseRate]: {
    target: 32,
    bands: [
      [25, "BAD"],
      [30, "OK"],
      [35, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.deviceOptInRate]: {
    target: 30,
    bands: [
      [20, "BAD"],
      [30, "OK"],
      [40, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },

  // Leads tab response-time pill behavior: <6m great, 6-15m okay, 15m+ bad
  [METRIC.responseTimeMinutes]: {
    target: 6,
    bands: [
      [6, "GREAT"],
      [15, "OK"],
      [Infinity, "BAD"],
    ],
  },

  // Closer dashboard (/closer/:id)
  // Current closer metrics table behavior: <55 bad, 55-65 good, 65+ great.
  [METRIC.closerShowUpRate]: {
    target: 55,
    bands: [
      [55, "BAD"],
      [65, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  // Downsell share of purchases. Lower is better because PIF/standard sales
  // are more valuable than downsells in the closer dashboard context.
  [METRIC.closerDownsellRate]: {
    target: 25,
    bands: [
      [15, "GREAT"],
      [25, "GOOD"],
      [35, "OK"],
      [Infinity, "BAD"],
    ],
  },
  // No-show recovery flow.
  [METRIC.recoveredContactRate]: {
    target: 80,
    bands: [
      [50, "BAD"],
      [70, "OK"],
      [90, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.recoveredRebookRate]: {
    target: 30,
    bands: [
      [15, "BAD"],
      [30, "OK"],
      [45, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.recoveredShowUpRate]: {
    target: 55,
    bands: [
      [45, "BAD"],
      [55, "OK"],
      [65, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  [METRIC.recoveredCloseRate]: {
    target: 32,
    bands: [
      [25, "BAD"],
      [30, "OK"],
      [35, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
  // Kajabi multipay card behavior: 2+ Kajabi pays or CRM payoff is healthy;
  // 1 pay after 30 days with no payoff is the red-risk state in the UI.
  [METRIC.multipayPaymentsMade]: {
    target: 2,
    bands: [
      [2, "BAD"],
      [Infinity, "GREAT"],
    ],
  },
  // Payoff opportunities are only shown inside the 30-day early-payoff window.
  // Fewer days left means higher urgency/risk.
  [METRIC.payoffOpportunityDaysLeft]: {
    target: 30,
    bands: [
      [7, "BAD"],
      [14, "OK"],
      [30, "GOOD"],
      [Infinity, "GREAT"],
    ],
  },
};

// =============================================================================
// REGISTRY — client-approved (in METRICS above; use METRIC.* + benchmark())
// =============================================================================
//
// confirmationRate — target 65% | <65% BAD, 65%+ GOOD
// showUpRate       — target 55% | <45% BAD, 45–55% OK, 55–65% GOOD, 65%+ GREAT
// conversionRate   — target 32% | <25% BAD, 25–30% OK, 30–35% GOOD, 35%+ GREAT
// successRate      — target 12% | <9% BAD, 9–12% OK, 12–15% GOOD, 15%+ GREAT
// pifRate          — target 25% | <20% BAD, 20–25% OK, 25–30% GOOD, 30%+ GREAT
// aov              — target $875 | <$750 BAD, $750–875 OK, $875–1000 GOOD, $1000+ GREAT
// responseTimeMinutes — target 6m | <6 GREAT, 6–15 OK, 15+ BAD
// countryEndToEndFunnelRate — target 8% | <4 BAD, 4–8 OK, 8+ GREAT
//
// Closer dashboard (/closer/:id)
// closerClosingRate — alias of conversionRate
// closerPifRate — alias of pifRate
// closerAov — alias of aov
// closerAoc — alias of aoc
// closerResponseTimeMinutes — alias of responseTimeMinutes
// closerShowUpRate — target 55% | <55% BAD, 55–65% GOOD, 65%+ GREAT
// closerDownsellRate — target 25% | <15% GREAT, 15–25% GOOD, 25–35% OK, 35%+ BAD
// recoveredContactRate — target 80% | <50% BAD, 50–70% OK, 70–90% GOOD, 90%+ GREAT
// recoveredRebookRate — target 30% | <15% BAD, 15–30% OK, 30–45% GOOD, 45%+ GREAT
// recoveredShowUpRate — target 55% | <45% BAD, 45–55% OK, 55–65% GOOD, 65%+ GREAT
// recoveredCloseRate — target 32% | <25% BAD, 25–30% OK, 30–35% GOOD, 35%+ GREAT
// multipayPaymentsMade — target 2 | <2 BAD, 2+ GREAT
// payoffOpportunityDaysLeft — target 30d | <7 BAD, 7–14 OK, 14–30 GOOD, 30+ GREAT
