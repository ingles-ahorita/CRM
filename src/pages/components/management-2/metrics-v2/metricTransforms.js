export const SOURCE_ITEMS = [
  { id: "all", label: "All" },
  { id: "organic", label: "Organic" },
  { id: "ads", label: "Ads" },
];

export const VIEW_ITEMS = [
  { id: "cards", label: "Card View" },
  { id: "charts", label: "Chart View" },
];

export const RANGE_ITEMS = [
  { id: "mtd", label: "MTD" },
  { id: "lastWeek", label: "Last week" },
  { id: "lastMonth", label: "Last month" },
  { id: "custom", label: "Custom" },
];

export const COMPARISON_ITEMS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

export const PURCHASE_TAB_ITEMS = [
  { id: "purchases", label: "Purchases" },
  { id: "lockins", label: "Lock-ins" },
  { id: "payoffs", label: "Payoffs" },
];

export const LINKED_ITEMS = [
  { id: "all", label: "All" },
  { id: "linked", label: "Linked" },
  { id: "unlinked", label: "Unlinked" },
];

export const COMPARISON_METRICS = [
  { id: "bookingsMade", label: "Bookings made", kind: "count" },
  { id: "booked", label: "Booked calls", kind: "count" },
  { id: "pickUpRate", label: "Pick-up rate", kind: "percent" },
  { id: "dqRate", label: "DQ rate", kind: "percent" },
  { id: "confirmationRate", label: "Confirmation rate", kind: "percent" },
  { id: "showedUp", label: "Showed up", kind: "count" },
  { id: "showUpRate", label: "Show-up rate", kind: "percent" },
  { id: "conversionRate", label: "Conversion rate", kind: "percent" },
  { id: "successRate", label: "Success rate", kind: "percent" },
  { id: "recoveryRate", label: "Recovery rate", kind: "percent" },
  { id: "purchased", label: "Purchased", kind: "count" },
  { id: "pifPercent", label: "PIF rate", kind: "percent" },
  { id: "downsellPercent", label: "Downsell rate", kind: "percent" },
];

export const DEFAULT_COMPARISON_METRICS = COMPARISON_METRICS.map((metric) => metric.id);

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function pct(numerator, denominator) {
  const den = Number(denominator || 0);
  if (den <= 0) return 0;
  return (Number(numerator || 0) / den) * 100;
}

export function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function formatInt(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

export function formatPct(value) {
  const rounded = round1(value);
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

export function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function sourceBucket(sourceType) {
  const s = String(sourceType || "organic").toLowerCase();
  return s.includes("ad") || s.includes("ads") ? "ads" : "organic";
}

export function emptyStatsBlock() {
  return {
    totalBooked: 0,
    totalBookedThatHappened: 0,
    totalPickedUp: 0,
    totalPickedUpByBookDate: 0,
    totalDQ: 0,
    bookingsMadeInPeriod: 0,
    pickedUpFromBookings: 0,
    bookingsForConfirmation: 0,
    confirmedFromBookings: 0,
    totalShowedUp: 0,
    totalConfirmed: 0,
    totalPurchased: 0,
    totalRescheduled: 0,
    totalNoShows: 0,
    totalRecovered: 0,
    totalPif: 0,
    totalDownsell: 0,
  };
}

export function finalizeRates(block) {
  const s = block || emptyStatsBlock();
  s.pickUpRate = pct(s.pickedUpFromBookings, s.bookingsMadeInPeriod);
  s.showUpRate = pct(s.totalShowedUp, s.totalBookedThatHappened);
  s.showUpRateConfirmed = pct(s.totalShowedUp, s.totalConfirmed);
  s.confirmationRate = pct(s.confirmedFromBookings, s.bookingsForConfirmation);
  s.conversionRate = pct(s.totalPurchased, s.totalShowedUp);
  s.successRate = pct(s.totalPurchased, s.totalBooked);
  s.dqRate = pct(s.totalDQ, s.totalPickedUpByBookDate);
  s.recoveryRate = pct(s.totalRecovered, s.totalNoShows);
  s.pifPercent = pct(s.totalPif, s.totalPurchased);
  s.downsellPercent = pct(s.totalDownsell, s.totalPurchased);
  return s;
}

export function mergeBlocks(...blocks) {
  const out = emptyStatsBlock();
  blocks.filter(Boolean).forEach((block) => {
    Object.keys(out).forEach((key) => {
      out[key] += Number(block[key] || 0);
    });
  });
  return finalizeRates(out);
}

export function metricValue(block, metricId) {
  if (!block) return 0;
  if (metricId === "conversion") return block.conversionRate ?? 0;
  if (metricId === "showUp") return block.showUpRateConfirmed ?? block.showUpRate ?? 0;
  if (metricId === "pickup") return block.pickUpRate ?? 0;
  if (metricId === "recovery") return block.recoveryRate ?? 0;
  if (metricId === "purchases") return block.totalPurchased ?? block.purchased ?? 0;
  if (metricId === "bookings") return block.bookingsMadeInPeriod ?? block.totalBooked ?? 0;
  return block.totalPurchased ?? 0;
}

export function sortTeamRows(rows, sortKey) {
  const list = [...(rows || [])];
  return list.sort((a, b) => {
    if (sortKey === "name") return String(a.name || "").localeCompare(String(b.name || ""));
    if (sortKey === "conversion") return (b.conversionRate || 0) - (a.conversionRate || 0);
    if (sortKey === "showUp") return (b.showUpRate || 0) - (a.showUpRate || 0);
    if (sortKey === "recovery") return (b.recoveryRate || 0) - (a.recoveryRate || 0);
    if (sortKey === "pickup") return (b.pickUpRate || 0) - (a.pickUpRate || 0);
    if (sortKey === "purchases") return (b.purchased || b.totalPurchased || 0) - (a.purchased || a.totalPurchased || 0);
    return (b.bookingsMadeInPeriod || b.totalBooked || 0) - (a.bookingsMadeInPeriod || a.totalBooked || 0);
  });
}

export function selectedStats(stats, sourceFilter, countryFilter) {
  if (!stats) return null;
  if (countryFilter === "all" && sourceFilter === "all") return stats.headline;
  if (countryFilter === "all") return stats.sourceStats?.[sourceFilter] || stats.headline;
  const countryPair = stats.countrySourceStats?.[countryFilter];
  if (!countryPair) return stats.headline;
  if (sourceFilter === "all") return mergeBlocks(countryPair.ads, countryPair.organic);
  return countryPair[sourceFilter] || stats.headline;
}

/** Segments for metric tile footers (ads/organic or medium splits). */
export function getBreakdownSegments(stats, sourceFilter, countryFilter) {
  if (!stats) return [];
  if (sourceFilter === "ads" && countryFilter === "all") {
    return [
      { label: "TikTok", tone: "purple", block: stats.mediumStats?.tiktok },
      { label: "Instagram", tone: "pink", block: stats.mediumStats?.instagram },
      { label: "Other", tone: "slate", block: stats.mediumStats?.other },
    ];
  }
  if (countryFilter !== "all") {
    const pair = stats.countrySourceStats?.[countryFilter];
    if (!pair) return [];
    return [
      { label: "Ads", tone: "blue", block: pair.ads },
      { label: "Organic", tone: "emerald", block: pair.organic },
    ];
  }
  if (sourceFilter === "all") {
    return [
      { label: "Ads", tone: "blue", block: stats.sourceStats?.ads },
      { label: "Organic", tone: "emerald", block: stats.sourceStats?.organic },
    ];
  }
  return [];
}

export function aggregateCloserDq(closers) {
  const list = closers || [];
  const dontQualify = list.reduce((sum, row) => sum + Number(row.dontQualify || 0), 0);
  const showedUp = list.reduce((sum, row) => sum + Number(row.showedUp || 0), 0);
  return { dontQualify, showedUp, rate: pct(dontQualify, showedUp) };
}

export function splitPurchases(rows, specialOfferIds) {
  const lockId = specialOfferIds?.lockInKajabiId;
  const payoffId = specialOfferIds?.payoffKajabiId;
  const lockins = [];
  const payoffs = [];
  const purchases = [];

  (rows || []).forEach((row) => {
    const offerId = row.offer_id != null ? String(row.offer_id) : "";
    if (row.treatment_override === "lock_in" || (!row.treatment_override && lockId && offerId === String(lockId))) {
      lockins.push(row);
      return;
    }
    if (row.treatment_override === "payoff" || (!row.treatment_override && payoffId && offerId === String(payoffId))) {
      payoffs.push(row);
      return;
    }
    purchases.push(row);
  });

  return { purchases, lockins, payoffs };
}
