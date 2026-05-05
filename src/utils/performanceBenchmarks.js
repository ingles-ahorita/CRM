/**
 * Core performance benchmarks for the CRM.
 * These values represent the "Target" for internal communication.
 */
export const BENCHMARKS = {
  CONFIRMATION: 65,
  SHOW_UP: 55,
  CONVERSION: 32,
  SUCCESS: 12,
  PIF_RATE: 25,
  AOV: 875,
};

/**
 * Colors for different performance levels.
 */
export const PERFORMANCE_COLORS = {
  BAD: "#ef4444", // Red
  OK: "#eab308", // Yellow
  GOOD: "#22c55e", // Green
  GREAT: "#15803d", // Dark Green
};

/**
 * Tailwind text color classes for different performance levels.
 */
export const PERFORMANCE_TEXT_CLASSES = {
  BAD: "text-rose-600",
  OK: "text-amber-600",
  GOOD: "text-emerald-500",
  GREAT: "text-emerald-800",
};

/**
 * Tailwind bg color classes for different performance levels.
 */
export const PERFORMANCE_BG_CLASSES = {
  BAD: "bg-rose-600",
  OK: "bg-amber-600",
  GOOD: "bg-emerald-500",
  GREAT: "bg-emerald-800",
};

/**
 * Get color based on Confirmation Rate
 */
export function getConfirmationColor(pct) {
  return pct < BENCHMARKS.CONFIRMATION ? PERFORMANCE_COLORS.BAD : PERFORMANCE_COLORS.GOOD;
}

export function getConfirmationClass(pct) {
  return pct < BENCHMARKS.CONFIRMATION ? PERFORMANCE_TEXT_CLASSES.BAD : PERFORMANCE_TEXT_CLASSES.GOOD;
}

/**
 * Get color based on Show-up Rate
 */
export function getShowUpColor(pct) {
  if (pct < 45) return PERFORMANCE_COLORS.BAD;
  if (pct < 55) return PERFORMANCE_COLORS.OK;
  if (pct < 65) return PERFORMANCE_COLORS.GOOD;
  return PERFORMANCE_COLORS.GREAT;
}

export function getShowUpClass(pct) {
  if (pct < 45) return PERFORMANCE_TEXT_CLASSES.BAD;
  if (pct < 55) return PERFORMANCE_TEXT_CLASSES.OK;
  if (pct < 65) return PERFORMANCE_TEXT_CLASSES.GOOD;
  return PERFORMANCE_TEXT_CLASSES.GREAT;
}

/**
 * Get color based on Conversion Rate
 */
export function getConversionColor(pct) {
  if (pct < 25) return PERFORMANCE_COLORS.BAD;
  if (pct < 30) return PERFORMANCE_COLORS.OK;
  if (pct < 35) return PERFORMANCE_COLORS.GOOD;
  return PERFORMANCE_COLORS.GREAT;
}

export function getConversionClass(pct) {
  if (pct < 25) return PERFORMANCE_TEXT_CLASSES.BAD;
  if (pct < 30) return PERFORMANCE_TEXT_CLASSES.OK;
  if (pct < 35) return PERFORMANCE_TEXT_CLASSES.GOOD;
  return PERFORMANCE_TEXT_CLASSES.GREAT;
}

/**
 * Get color based on Success Rate
 */
export function getSuccessColor(pct) {
  if (pct < 9) return PERFORMANCE_COLORS.BAD;
  if (pct < 12) return PERFORMANCE_COLORS.OK;
  if (pct < 15) return PERFORMANCE_COLORS.GOOD;
  return PERFORMANCE_COLORS.GREAT;
}

export function getSuccessClass(pct) {
  if (pct < 9) return PERFORMANCE_TEXT_CLASSES.BAD;
  if (pct < 12) return PERFORMANCE_TEXT_CLASSES.OK;
  if (pct < 15) return PERFORMANCE_TEXT_CLASSES.GOOD;
  return PERFORMANCE_TEXT_CLASSES.GREAT;
}

/**
 * Get color based on PIF Rate
 */
export function getPifColor(pct) {
  if (pct < 20) return PERFORMANCE_COLORS.BAD;
  if (pct < 25) return PERFORMANCE_COLORS.OK;
  if (pct < 30) return PERFORMANCE_COLORS.GOOD;
  return PERFORMANCE_COLORS.GREAT;
}

export function getPifClass(pct) {
  if (pct < 20) return PERFORMANCE_TEXT_CLASSES.BAD;
  if (pct < 25) return PERFORMANCE_TEXT_CLASSES.OK;
  if (pct < 30) return PERFORMANCE_TEXT_CLASSES.GOOD;
  return PERFORMANCE_TEXT_CLASSES.GREAT;
}

/**
 * Get color based on AOV
 */
export function getAovColor(val) {
  if (val < 750) return PERFORMANCE_COLORS.BAD;
  if (val < 875) return PERFORMANCE_COLORS.OK;
  if (val < 1000) return PERFORMANCE_COLORS.GOOD;
  return PERFORMANCE_COLORS.GREAT;
}

export function getAovClass(val) {
  if (val < 750) return PERFORMANCE_TEXT_CLASSES.BAD;
  if (val < 875) return PERFORMANCE_TEXT_CLASSES.OK;
  if (val < 1000) return PERFORMANCE_TEXT_CLASSES.GOOD;
  return PERFORMANCE_TEXT_CLASSES.GREAT;
}
