import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as DateHelpers from "../../../../utils/dateHelpers";
import { useRevenueGoal } from "../../../../hooks/useRevenueGoal";
import { supabase } from "../../../../lib/supabaseClient";
import { LOCK_IN_OFFER_DB_ID, PAYOFF_OFFER_DB_ID } from "../../../../lib/specialOffers";
import SegmentedTabs from "../segmented-tabs";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PERFORMANCE_COLORS,
  PERFORMANCE_TEXT_CLASSES,
  PERFORMANCE_SOFT_BG_CLASSES,
} from "../../../../utils/performanceBenchmarks";

/** Unified income pie: PIF slice takes priority; remaining new vs old by agreement start in range. */
const UNIFIED_INCOME_MIX_DEFS = [
  { key: "pif", label: "PIF", color: PERFORMANCE_COLORS.GREAT },
  { key: "new", label: "New income", color: PERFORMANCE_COLORS.GOOD },
  { key: "old", label: "Old income", color: PERFORMANCE_COLORS.OK },
];

/** Short classification rule shown in Income Source Mix tooltips. */
const INCOME_MIX_SLICE_FORMULA = {
  pif: "PIF = cash from purchases with payment_type single (one-time / paid-in-full).",
  new: "New = payment-plan cash where the agreement started inside the selected range.",
  old: "Old = payment-plan cash where the agreement started before the selected range.",
};

const TIME_RANGE_ITEMS = [
  { id: "mtd", label: "MTD", title: "This month (MTD)" },
  { id: "last7", label: "7 days", title: "Last 7 days" },
  { id: "lastWeek", label: "Last wk", title: "Last week" },
  { id: "byMonth", label: "By Month", title: "Filter by calendar month" },
  { id: "custom", label: "Custom", title: "Custom date range" },
];

/** Rolling 12 months ending with the current calendar month (oldest → newest). */
function getIncomeMixMonthTabItems(referenceDate = new Date()) {
  const ym = DateHelpers.getYearMonthInTimezone(referenceDate, DateHelpers.DEFAULT_TIMEZONE);
  const year = ym?.year ?? referenceDate.getUTCFullYear();
  const month = ym?.month ?? referenceDate.getUTCMonth() + 1;
  const items = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const mid = new Date(Date.UTC(year, month - 1 - offset, 15));
    const tabYm = DateHelpers.getYearMonthInTimezone(mid, DateHelpers.DEFAULT_TIMEZONE);
    const monthKey =
      tabYm?.monthKey ??
      `${mid.getUTCFullYear()}-${String(mid.getUTCMonth() + 1).padStart(2, "0")}`;
    const tabYear = tabYm?.year ?? mid.getUTCFullYear();
    const tabMonth = tabYm?.month ?? mid.getUTCMonth() + 1;
    items.push({
      id: monthKey,
      label: new Date(Date.UTC(tabYear, tabMonth - 1, 1)).toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      title: monthKey,
    });
  }
  return items;
}

function currentIncomeMixMonthKey(referenceDate = new Date()) {
  const ym = DateHelpers.getYearMonthInTimezone(referenceDate, DateHelpers.DEFAULT_TIMEZONE);
  return (
    ym?.monthKey ??
    `${referenceDate.getUTCFullYear()}-${String(referenceDate.getUTCMonth() + 1).padStart(2, "0")}`
  );
}

const FORECAST_RANGE_ITEMS = [
  { id: "dtm", label: "DTM", title: "Today through month end" },
  { id: "next7", label: "Next 7 days" },
  { id: "nextWeek", label: "Next wk" },
  { id: "nextMonth", label: "Next mo" },
  { id: "custom", label: "Custom" },
];

const DAILY_SALES_RANGE_ITEMS = [
  { id: "last30", label: "Last 30 days" },
  { id: "mtd", label: "MTD" },
  { id: "last7", label: "Last 7 days" },
  { id: "lastWeek", label: "Last wk" },
  { id: "lastMonth", label: "Last mo" },
  { id: "custom", label: "Custom" },
];

const PRODUCT_STATUS_ITEMS = [
  { id: "active", label: "Active" },
  { id: "all", label: "All offers" },
  { id: "inactive", label: "Inactive" },
];

const PRODUCT_DATE_ITEMS = [
  { id: "mtd", label: "MTD" },
  { id: "last7", label: "Last 7 days" },
  { id: "lastWeek", label: "Last wk" },
  { id: "lastMonth", label: "Last mo" },
  { id: "custom", label: "Custom" },
];

/** Short label for revenue snapshot goal pill (uppercased in UI). */
const SNAPSHOT_RANGE_BADGE = {
  last30: "30d",
  mtd: "MTD",
  last7: "7d",
  lastWeek: "Last wk",
  lastMonth: "Last mo",
  custom: "Custom",
};

function getSnapshotRangeBounds(range, customStart, customEnd) {
  if (range === "custom") {
    return normalizeCustomBounds(customStart, customEnd);
  }

  const bounds = getDailySalesRangeBounds(range);
  if (range !== "mtd") return bounds;

  const now = new Date();
  return {
    start: bounds.start,
    end: now < bounds.end ? now : bounds.end,
  };
}

function getIncomeMixRangeBounds(range, customStart, customEnd, byMonthKey) {
  if (range === "byMonth") {
    const key = String(byMonthKey || "");
    const match = key.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const mid = new Date(Date.UTC(year, month - 1, 15));
      const monthRange = DateHelpers.getMonthRangeInTimezone(mid, DateHelpers.DEFAULT_TIMEZONE);
      if (monthRange) return { start: monthRange.startDate, end: monthRange.endDate };
    }
    return getSnapshotRangeBounds("mtd", customStart, customEnd);
  }
  return getSnapshotRangeBounds(range, customStart, customEnd);
}

function calculateSnapshotGoalUsd(monthlyGoal, start, end) {
  let total = 0;

  for (const dayKey of listDaysISO(startOfUTCDate(start), startOfUTCDate(end))) {
    const monthRange = DateHelpers.getMonthRangeInTimezone(
      new Date(`${dayKey}T12:00:00.000Z`),
      DateHelpers.DEFAULT_TIMEZONE,
    );
    const daysInMonth = monthRange?.endDate?.getUTCDate?.() || 30;
    total += monthlyGoal / daysInMonth;
  }

  return Math.max(1, Math.round(total));
}

const SUCCESS_STATES = new Set([
  "paid",
  "successful",
  "success",
  "complete",
  "completed",
  "succeeded",
]);

function isFailedTransaction(row, actionOverride = null) {
  const action = String(actionOverride || row?.action || "").toLowerCase();
  const state = String(row?.state || "").toLowerCase();
  return action === "dispute" || (row?.state != null && !SUCCESS_STATES.has(state));
}

const KAJABI_OFFER_FALLBACKS = {
  "2150879491": { name: "Premium - FULL", price: 1997, installments: 0 },
  "2150879483": { name: "VIP - FULL", price: 3497, installments: 0 },
  "2150879484": { name: "VIP - 4 x $949", price: 949, installments: 4 },
  "2150879490": { name: "VIP - 7 x $597", price: 597, installments: 7 },
  "2150879492": { name: "Premium - 4 x $549", price: 549, installments: 4 },
  "2150879493": { name: "Premium - 7 x $349", price: 349, installments: 7 },
  "2150879495": { name: "Student - FULL", price: 897, installments: 0 },
  "2150879496": { name: "Student - 3 x $349", price: 349, installments: 3 },
  "2150523894": { name: "Lock-in", price: 100, installments: 0 },
  "2150799973": { name: "Payoff", price: 0, installments: 0 },
  "2150991083": { name: "Student - 5 x $199", price: 199, installments: 5 },
  "2150961576": { name: "2. 3 x $600 ($500)", price: 500, installments: 3 },
  "2150763469": { name: "2. 4 x $549 ($449)", price: 975, installments: 4 },
  "2150757348": { name: "3. 7 x $399 ($299)", price: 623, installments: 7 },
  "2151122152": { name: "3. 6 x $349", price: 349, installments: 6 },
  "2150757309": { name: "1. $1997 USD ($1497)", price: 1497, installments: 0 }
};

function txAmountUsd(row) {
  return Math.abs(Number(row?.amount_in_cents || 0)) / 100;
}

function isChargeInRange(row, startISO, endISO) {
  const resolvedInRange =
    row?.payment_resolved_at != null &&
    row.payment_resolved_at >= startISO &&
    row.payment_resolved_at <= endISO &&
    (row.effective_date == null || row.effective_date < startISO || row.effective_date > endISO);
  const inRange =
    (row?.effective_date >= startISO && row.effective_date <= endISO) ||
    resolvedInRange;
  if (!inRange) return false;

  const action = resolvedInRange
    ? "charge"
    : String(row?.action || (Number(row?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
  const isRefund = action === "refund" || Number(row?.amount_in_cents || 0) < 0;
  if (isRefund) return false;
  return resolvedInRange || !isFailedTransaction(row, action);
}

function transactionCashDate(row) {
  return row?.payment_resolved_at || row?.effective_date || row?.created_at_kajabi || null;
}

function sumGrossTransactions(rows, startISO, endISO) {
  return (rows || []).reduce((sum, row) => {
    const resolvedInRange =
      row?.payment_resolved_at != null &&
      row.payment_resolved_at >= startISO &&
      row.payment_resolved_at <= endISO &&
      (row.effective_date == null || row.effective_date < startISO || row.effective_date > endISO);
    const inRange =
      (row?.effective_date >= startISO && row.effective_date <= endISO) ||
      resolvedInRange;
    if (!inRange) return sum;
    const action = resolvedInRange
      ? "charge"
      : String(row?.action || (Number(row?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
    const isRefund = action === "refund" || Number(row?.amount_in_cents || 0) < 0;
    return !isRefund && !isFailedTransaction(row, action) ? sum + txAmountUsd(row) : sum;
  }, 0);
}

function sumNetTransactions(rows, startISO, endISO) {
  return (rows || []).reduce((sum, row) => {
    const resolvedInRange =
      row?.payment_resolved_at != null &&
      row.payment_resolved_at >= startISO &&
      row.payment_resolved_at <= endISO &&
      (row.effective_date == null || row.effective_date < startISO || row.effective_date > endISO);
    const inRange =
      (row?.effective_date >= startISO && row.effective_date <= endISO) ||
      resolvedInRange;
    if (!inRange) return sum;

    const action = resolvedInRange
      ? "charge"
      : String(row?.action || (Number(row?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
    if (!resolvedInRange && isFailedTransaction(row, action)) return sum;

    const isRefund = action === "refund" || Number(row?.amount_in_cents || 0) < 0;
    return sum + (isRefund ? -txAmountUsd(row) : txAmountUsd(row));
  }, 0);
}

function createEmptyIncomeMixAgg() {
  return {
    pif: { usd: 0, tx: 0 },
    new: { usd: 0, tx: 0 },
    old: { usd: 0, tx: 0 },
  };
}

/** PIF vs new-start vs older agreements (same rules for net and gross lines). */
function incomeMixClassifyTx(tx, ctx) {
  const {
    offersById,
    payoffOfferIds,
    treatmentByPurchaseId,
    outcomeByMainPurchaseId,
    outcomeByPayoffPurchaseId,
    resolvePurchase,
    startISO,
    endISO,
  } = ctx;
  const purchase = resolvePurchase(tx);
  const purchaseId = purchase?.kajabi_purchase_id != null ? String(purchase.kajabi_purchase_id) : null;
  const txPurchaseId = tx?.kajabi_purchase_id != null ? String(tx.kajabi_purchase_id) : null;
  const offerId = String(purchase?.kajabi_offer_id || tx?.kajabi_offer_id || "unknown");
  const offer = offersById[offerId] || KAJABI_OFFER_FALLBACKS[offerId] || null;
  const paymentType = String(purchase?.payment_type || "").toLowerCase();
  const treatment = txPurchaseId ? treatmentByPurchaseId[txPurchaseId] : null;
  const linkedPayoffOutcome = txPurchaseId ? outcomeByPayoffPurchaseId[txPurchaseId] : null;
  const linkedMainOutcome = purchaseId ? outcomeByMainPurchaseId[purchaseId] : null;
  const isPayoff =
    treatment === "payoff" ||
    Boolean(linkedPayoffOutcome) ||
    payoffOfferIds.has(offerId);
  const installments = Number(offer?.installments);
  const hasInstallments = Number.isFinite(installments) && installments > 1;
  const isPaymentPlan = !isPayoff && (
    paymentType.includes("multipay") ||
    paymentType.includes("payment plan") ||
    hasInstallments
  );
  const isPif = offerId === "2150757309";

  const agreementDate =
    linkedPayoffOutcome?.purchase_date ||
    linkedMainOutcome?.purchase_date ||
    (!isPayoff ? purchase?.created_at_kajabi : null);
  const agreementStartedInRange =
    agreementDate != null &&
    agreementDate >= startISO &&
    agreementDate <= endISO;

  return { isPif, agreementStartedInRange };
}

function bumpIncomeMixAgg(mixAgg, signedUsd, { isPif, agreementStartedInRange }) {
  const bump = (key) => {
    mixAgg[key].usd += signedUsd;
    mixAgg[key].tx += 1;
  };
  if (isPif) {
    bump("pif");
  } else if (agreementStartedInRange) {
    bump("new");
  } else {
    bump("old");
  }
}

function netLineContributionForIncomeMix(tx, startISO, endISO) {
  const resolvedInRange =
    tx?.payment_resolved_at != null &&
    tx.payment_resolved_at >= startISO &&
    tx.payment_resolved_at <= endISO &&
    (tx.effective_date == null || tx.effective_date < startISO || tx.effective_date > endISO);
  const inRange =
    (tx?.effective_date >= startISO && tx.effective_date <= endISO) ||
    resolvedInRange;
  if (!inRange) return null;

  const action = resolvedInRange
    ? "charge"
    : String(tx?.action || (Number(tx?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
  if (!resolvedInRange && isFailedTransaction(tx, action)) return null;

  const isRefund = action === "refund" || Number(tx?.amount_in_cents || 0) < 0;
  const amt = txAmountUsd(tx);
  return { signedUsd: isRefund ? -amt : amt };
}

function grossLineContributionForIncomeMix(tx, startISO, endISO) {
  const resolvedInRange =
    tx?.payment_resolved_at != null &&
    tx.payment_resolved_at >= startISO &&
    tx.payment_resolved_at <= endISO &&
    (tx.effective_date == null || tx.effective_date < startISO || tx.effective_date > endISO);
  const inRange =
    (tx?.effective_date >= startISO && tx.effective_date <= endISO) ||
    resolvedInRange;
  if (!inRange) return null;
  const action = resolvedInRange
    ? "charge"
    : String(tx?.action || (Number(tx?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
  const isRefund = action === "refund" || Number(tx?.amount_in_cents || 0) < 0;
  if (isRefund || isFailedTransaction(tx, action)) return null;
  return { signedUsd: txAmountUsd(tx) };
}

function incomeMixAggToSlicesModel(agg) {
  const slices = UNIFIED_INCOME_MIX_DEFS.map((def) => {
    const bucket = agg[def.key];
    return {
      key: def.key,
      label: def.label,
      color: def.color,
      valueCents: Math.round((Number(bucket?.usd) || 0) * 100),
      txCount: Number(bucket?.tx) || 0,
    };
  });
  return { slices };
}

const PAYOFF_OFFER_IDS = new Set(["2150799973"]);

/** Hex for mini goal pies — same thresholds as snapshot badges (on / near / behind pace). */
function paceProgressFill(actual, target) {
  const a = Number(actual) || 0;
  const t = Number(target) || 0;
  if (t <= 0) return PERFORMANCE_COLORS.BAD;
  if (a >= t) return PERFORMANCE_COLORS.GOOD;
  if (a >= t * 0.9) return PERFORMANCE_COLORS.OK;
  return PERFORMANCE_COLORS.BAD;
}

function buildGoalPieSlices(mainUsd, capUsd, accentFill) {
  const main = Math.max(0, Number(mainUsd) || 0);
  const cap = Math.max(0, Number(capUsd) || 0);
  const slate = "#e2e8f0";
  if (cap <= 0) {
    return [{ key: "empty", value: 1, fill: slate }];
  }
  const filled = Math.min(main, cap);
  const rest = Math.max(0, cap - main);
  if (filled <= 0) {
    return [{ key: "track", value: cap, fill: slate }];
  }
  if (rest <= 0) {
    return [{ key: "full", value: Math.max(filled, 1), fill: accentFill }];
  }
  return [
    { key: "progress", value: filled, fill: accentFill },
    { key: "remaining", value: rest, fill: slate },
  ];
}

function startOfUTCDate(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUTCDate(d) {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function getRangeBounds(range) {
  const now = new Date();
  if (range === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart, end: weekEnd };
  }
  if (range === "last7") {
    const end = endOfUTCDate(now);
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: startOfUTCDate(start), end };
  }
  if (range === "lastMonth") {
    const prevMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15),
    );
    const monthRange = DateHelpers.getMonthRangeInTimezone(
      prevMonthDate,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    return { start: monthRange.startDate, end: monthRange.endDate };
  }
  if (range === "custom") {
    const end = endOfUTCDate(now);
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: startOfUTCDate(start), end };
  }
  const currentRange = DateHelpers.getMonthRangeInTimezone(
    now,
    DateHelpers.DEFAULT_TIMEZONE,
  );
  return { start: currentRange.startDate, end: currentRange.endDate };
}

function getForecastRangeBounds(range) {
  const now = new Date();
  if (range === "next7") {
    const start = startOfUTCDate(now);
    const end = endOfUTCDate(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000));
    return { start, end };
  }
  if (range === "nextWeek") {
    const currentDay = now.getUTCDay();
    const daysUntilNextMonday = ((8 - currentDay) % 7) || 7;
    const nextMonday = startOfUTCDate(new Date(now.getTime() + daysUntilNextMonday * 24 * 60 * 60 * 1000));
    const nextSunday = endOfUTCDate(new Date(nextMonday.getTime() + 6 * 24 * 60 * 60 * 1000));
    return { start: nextMonday, end: nextSunday };
  }
  if (range === "nextMonth") {
    const nextMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15));
    const monthRange = DateHelpers.getMonthRangeInTimezone(
      nextMonthDate,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    return { start: monthRange.startDate, end: monthRange.endDate };
  }
  if (range === "dtm" || range === "mtd") {
    const currentRange = DateHelpers.getMonthRangeInTimezone(
      now,
      DateHelpers.DEFAULT_TIMEZONE,
    );
    return { start: startOfUTCDate(now), end: currentRange.endDate };
  }
  return getRangeBounds(range);
}

function getDailySalesRangeBounds(range) {
  const now = new Date();
  if (range === "last30") {
    const end = endOfUTCDate(now);
    const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { start: startOfUTCDate(start), end };
  }
  return getRangeBounds(range);
}

function listDaysISO(start, end) {
  const days = [];
  let cursor = startOfUTCDate(start);
  const last = startOfUTCDate(end);

  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return days;
}

/** Same calendar length immediately before `start` (for period-over-period gross). */
function priorPeriodBoundsInclusive(start, end) {
  const s = startOfUTCDate(start);
  const e = startOfUTCDate(end);
  const n = Math.max(1, listDaysISO(s, e).length);
  const msDay = 24 * 60 * 60 * 1000;
  const priorEnd = new Date(s.getTime() - msDay);
  const priorStart = new Date(priorEnd.getTime() - (n - 1) * msDay);
  return { start: startOfUTCDate(priorStart), end: endOfUTCDate(priorEnd) };
}

function formatShortUtcRange(start, end) {
  const opts = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

function transactionTouchesWindow(tx, startISO, endISO) {
  const c = tx?.created_at_kajabi;
  const e = tx?.effective_date;
  const p = tx?.payment_resolved_at;
  return (
    (c != null && c >= startISO && c <= endISO) ||
    (e != null && e >= startISO && e <= endISO) ||
    (p != null && p >= startISO && p <= endISO)
  );
}

function normalizeCustomBounds(startDateText, endDateText) {
  const fallback = getRangeBounds("custom");
  if (!startDateText || !endDateText) return fallback;
  const start = new Date(`${startDateText}T00:00:00.000Z`);
  const end = new Date(`${endDateText}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fallback;
  if (start > end) return fallback;
  return { start, end };
}

function rangeTitle(range, customStart, customEnd) {
  if (range === "lastMonth") return "Last month";
  if (range === "last30") return "Last 30 days";
  if (range === "last7") return "Last 7 days";
  if (range === "next7") return "Next 7 days";
  if (range === "lastWeek") return "Last week";
  if (range === "nextWeek") return "Next week";
  if (range === "nextMonth") return "Next month";
  if (range === "dtm" || range === "mtd") return "Rest of month";
  if (range === "custom") return `${customStart || "Custom"} to ${customEnd || "Custom"}`;
  return "Month to date";
}

function addMonthsClamped(date, monthsToAdd) {
  const source = new Date(date);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + monthsToAdd, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function shimmer(className = "") {
  return (
    <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} />
  );
}

/** Placeholder bars for payment-plan per-day chart loading state (heights % of chart area). */
const FORECAST_DAILY_CHART_SHIMMER_HEIGHTS = [38, 62, 45, 72, 55, 80, 48, 66, 52, 74, 42, 58];

function PaymentPlanDailyChartShimmer() {
  return (
    <div className="mt-3" aria-hidden>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {shimmer("h-2.5 w-40")}
        {shimmer("h-2.5 w-24")}
      </div>
      <div
        className="flex h-[140px] items-end justify-between gap-1 rounded-lg border border-slate-100 bg-slate-50/80 px-1.5 pb-0.5 pt-2"
        role="presentation"
      >
        {FORECAST_DAILY_CHART_SHIMMER_HEIGHTS.map((pct, i) => (
          <div key={i} className="flex min-h-0 min-w-0 flex-1 flex-col justify-end">
            <div
              className="w-full min-h-[8px] animate-pulse rounded-sm bg-slate-200/70"
              style={{ height: `${pct}%` }}
            />
          </div>
        ))}
      </div>
      {shimmer("mt-2 h-2.5 w-44")}
    </div>
  );
}

function PaymentPlanDailyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const amount = Number(row?.amount ?? payload[0]?.value ?? 0);
  const count = Number(row?.paymentCount ?? 0) || 0;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
      <p className="text-[11px] font-extrabold text-slate-950">
        {row?.date || label}
      </p>
      <p className="mt-1 text-[12px] font-extrabold text-emerald-600">
        {formatUsd(amount)}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
        {count === 1 ? "1 expected payment" : `${count} expected payments`}
      </p>
    </div>
  );
}

function forecastDayBarFill(amount) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return "#E2E8F0";
  return PERFORMANCE_COLORS.GOOD;
}

function RevenueCardShimmer() {
  return (
    <article className="min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      {shimmer("h-2.5 w-24")}
      {shimmer("mt-3 h-7 w-32")}
      {shimmer("mt-3 h-3 w-40")}
      <div className="mt-4 flex gap-2">
        {shimmer("h-4 w-16")}
      </div>
    </article>
  );
}

function RevenueSnapshotCardShimmer() {
  return (
    <article className="min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          {shimmer("h-2.5 w-24")}
          {shimmer("mt-3 h-7 w-32")}
          {shimmer("mt-3 h-3 w-40")}
          <div className="mt-4 flex gap-2">
            {shimmer("h-4 w-16")}
          </div>
        </div>
        {shimmer("mt-0.5 h-[50px] w-[50px] shrink-0 rounded-full")}
      </div>
    </article>
  );
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatCents(value) {
  return formatUsd((Number(value) || 0) / 100);
}

function dailySalesBarBenchmarkHint(monthlyGoal) {
  const g = monthlyGoal / 30;
  const on = Math.round(g);
  const near = Math.round(g * 0.7);
  return `Daily bar: ≥ ${formatUsd(on)} · ≥ ${formatUsd(near)} · else behind (month goal ÷ 30 per day).`;
}

function pct(value, total) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(total)) || Number(total) <= 0) return 0;
  return Math.round(((Number(value) / Number(total)) * 1000)) / 10;
}

function emptyUnifiedIncomeMix() {
  const empty = incomeMixAggToSlicesModel(createEmptyIncomeMixAgg());
  return {
    slicesNet: empty.slices.map((s) => ({ ...s })),
    slicesGross: empty.slices.map((s) => ({ ...s })),
    netTotalCents: 0,
    grossTotalCents: 0,
  };
}

function SectionBadge({ children }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function HelpTooltip({ text, className = "" }) {
  return (
    <span className={cx("group relative inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-extrabold leading-none text-slate-400 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600", className)}>
      ?
      <span className="pointer-events-none absolute right-0 top-5 z-30 hidden w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-snug text-slate-600 shadow-[0_10px_28px_rgba(15,23,42,0.16)] group-hover:block">
        {text}
      </span>
    </span>
  );
}

function RevenueMiniPie({ mainUsd, capUsd, accentFill }) {
  const chartData = buildGoalPieSlices(mainUsd, capUsd, accentFill);
  const size = 50;
  return (
    <div className="mt-0.5 h-[50px] w-[50px] shrink-0" aria-hidden>
      <PieChart width={size} height={size}>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="key"
          cx="50%"
          cy="50%"
          innerRadius={13}
          outerRadius={21}
          paddingAngle={0}
          stroke="none"
          isAnimationActive={false}
        >
          {chartData.map((entry) => (
            <Cell key={entry.key} fill={entry.fill} />
          ))}
        </Pie>
      </PieChart>
    </div>
  );
}

function RevenueCard({ card, loading }) {
  return (
    <article className="relative min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
            {card.label}
          </p>
          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-100" />
          ) : (
            <div className={cx("mt-2 text-[24px] font-extrabold leading-none tracking-normal", card.valueClass)}>
              {card.value}
            </div>
          )}
          <p className="mt-2 text-[11px] font-semibold text-slate-500">{card.note}</p>
          {card.progress ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${card.progress}%`,
                    backgroundColor: card.progressFill || PERFORMANCE_COLORS.GOOD,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                {card.progressNote}
              </p>
            </div>
          ) : null}
          {card.badge ? (
            <div className="mt-2">
              <span className={cx("inline-flex rounded-md px-2 py-1 text-[10px] font-extrabold leading-none", card.badgeClass)}>
                {card.badge}
              </span>
            </div>
          ) : null}
        </div>
        {!loading && card.pie ? (
          <RevenueMiniPie mainUsd={card.pie.mainUsd} capUsd={card.pie.capUsd} accentFill={card.pie.accentFill} />
        ) : null}
      </div>
    </article>
  );
}

function RiskCard({ card, loading }) {
  return (
    <article className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          {card.label}
        </p>
        {card.info ? (
          <span className="group relative inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-extrabold leading-none text-slate-400 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">
            ?
            <span className="pointer-events-none absolute right-0 top-6 z-20 hidden w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-snug text-slate-600 shadow-[0_10px_28px_rgba(15,23,42,0.16)] group-hover:block">
              {card.info}
            </span>
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-1 h-6 w-16 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className={cx("mt-1 text-[20px] font-extrabold leading-none tracking-normal", card.valueClass)}>
          {card.value}
        </div>
      )}
      <p className="mt-1 text-[9px] font-semibold leading-snug text-slate-500">{card.note}</p>
    </article>
  );
}

function RevenueSnapshotPanel({
  cards,
  loading,
  snapshotGoal,
  range,
  setRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}) {
  const badgeKey = SNAPSHOT_RANGE_BADGE[range] ? range : "mtd";
  const badgeSlice = SNAPSHOT_RANGE_BADGE[badgeKey].toUpperCase();

  return (
    <div className="flex flex-col overflow-visible rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="relative pb-">
        <div className="pr-[8.5rem] text-[13px] font-bold uppercase tracking-wide text-slate-900">
          Revenue Snapshot
        </div>
        <div className="absolute right-0 -top-1">
          <SectionBadge>
            {badgeSlice} · Goal {formatUsd(snapshotGoal)}
          </SectionBadge>
        </div>
        <div className="mt-3 mb-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-7 w-full max-w-[11rem] rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
            aria-label="Revenue snapshot range"
          >
            {DAILY_SALES_RANGE_ITEMS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {range === "custom" ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 bg-white sm:flex-nowrap">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
          <span className="text-[10px] font-semibold text-slate-500">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {loading
          ? [1, 2, 3].map((i) => <RevenueSnapshotCardShimmer key={i} />)
          : cards.map((card) => <RevenueCard key={card.label} card={card} />)}
      </div>
    </div>
  );
}

function RefundsPanel({
  cards,
  loading,
  error = null,
  range,
  setRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="relative pb-2">
        <div className="pr-14 text-[13px] font-bold uppercase tracking-wide text-slate-900">
          Refunds, Chargebacks & Outstanding
        </div>
        <div className="absolute right-0 top-0">
          <SectionBadge>Risk</SectionBadge>
        </div>
        <div className="mt-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-7 w-full max-w-[11rem] rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
            aria-label="Refunds and risk range"
          >
            {DAILY_SALES_RANGE_ITEMS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {range === "custom" ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 bg-white sm:flex-nowrap">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
          <span className="text-[10px] font-semibold text-slate-500">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
        </div>
      ) : null}
      {error ? (
        <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <article key={i} className="min-h-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                {shimmer("h-2 w-16")}
                {shimmer("mt-2 h-5 w-24")}
                {shimmer("mt-2 h-2 w-32")}
              </article>
            ))
          : cards.map((card) => <RiskCard key={card.label} card={card} />)}
      </div>
    </div>
  );
}

function incomeMixPercentOfTotal(sliceCents, headlineCents) {
  const headline = Number(headlineCents) || 0;
  if (headline === 0) return null;
  return pct(sliceCents, headline);
}

/** Tooltip body for income mix pie (used with fixed-position portal following cursor). */
function IncomeMixTooltipCard({ p, totalBasis = "net" }) {
  if (!p) return null;
  const tx = Number(p.txCount) || 0;
  const rawCents = p.displayCents != null ? Number(p.displayCents) : Number(p.value);
  const valueCents = Number.isFinite(rawCents) ? rawCents : 0;
  const sliceKey = p.sliceKey != null ? String(p.sliceKey) : "";
  const percent = p.pctOfTotal != null ? p.pctOfTotal : incomeMixPercentOfTotal(valueCents, p.headlineCents);
  const totalLabel = totalBasis === "gross" ? "total gross" : "total net";
  const formula = INCOME_MIX_SLICE_FORMULA[sliceKey] || "";
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.14)]"
      style={{ fontSize: "10px", outline: "none", maxWidth: "16rem" }}
    >
      <p className="text-[11px] font-extrabold text-slate-950">{p.name}</p>
      <p className="mt-1 text-[12px] font-extrabold text-slate-800">
        {formatCents(valueCents)}
      </p>
      {percent != null ? (
        <p className="mt-0.5 text-[10px] font-semibold text-slate-600">
          {percent}% of {totalLabel} · slice ÷ {totalLabel} income
        </p>
      ) : null}
      <p className="mt-0.5 text-[10px] font-semibold text-slate-600">
        {tx} transaction{tx !== 1 ? "s" : ""}
      </p>
      {formula ? (
        <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[9px] font-medium leading-snug text-slate-500">
          {formula}
        </p>
      ) : null}
    </div>
  );
}

function incomeMixSectorPayload(sector) {
  const raw = sector?.payload ?? sector;
  return raw && typeof raw === "object" ? raw : null;
}

function clampIncomeTooltipPosition(clientX, clientY) {
  if (typeof window === "undefined") {
    return { left: clientX + 14, top: clientY + 14 };
  }
  const pad = 10;
  const offset = 14;
  const estW = 260;
  const estH = 240;
  let left = clientX + offset;
  let top = clientY + offset;
  left = Math.min(left, window.innerWidth - estW - pad);
  top = Math.min(top, window.innerHeight - estH - pad);
  left = Math.max(pad, left);
  top = Math.max(pad, top);
  return { left, top };
}

function IncomeMixPanel({
  unifiedMix,
  range,
  setRange,
  incomeMixMonth,
  setIncomeMixMonth,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  loading,
  error,
}) {
  const chartHitRef = useRef(null);
  const rows = unifiedMix?.slicesNet || [];
  const sliceSumCents = rows.reduce((sum, row) => sum + row.valueCents, 0);
  const netHeadlineCents = Number(unifiedMix?.netTotalCents) || 0;
  const headlineCents = netHeadlineCents;
  const pieRows = rows.filter((row) => row.valueCents > 0);
  const chartData = pieRows.map((row) => ({
    name: row.label,
    value: Math.max(0, row.valueCents),
    displayCents: row.valueCents,
    color: row.color,
    txCount: row.txCount,
    sliceKey: row.key,
    headlineCents,
    pctOfTotal: incomeMixPercentOfTotal(row.valueCents, headlineCents),
  }));
  const hasPieSlices = chartData.length > 0;

  const [incomeCursorTip, setIncomeCursorTip] = useState(null);

  const incomeMixMonthItems = getIncomeMixMonthTabItems();

  const handleRangeChange = (id) => {
    if (id === "byMonth" && range !== "byMonth") {
      setIncomeMixMonth(currentIncomeMixMonthKey());
    }
    setRange(id);
  };

  useEffect(() => {
    if (
      loading ||
      error ||
      (sliceSumCents === 0 && netHeadlineCents === 0)
    ) {
      setIncomeCursorTip(null);
    }
  }, [loading, error, sliceSumCents, netHeadlineCents]);

  useEffect(() => {
    if (!incomeCursorTip) return undefined;
    const closeIfOutsideChart = (e) => {
      const r = chartHitRef.current?.getBoundingClientRect();
      if (!r) return;
      const { clientX: x, clientY: y } = e;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
        setIncomeCursorTip(null);
      }
    };
    window.addEventListener("pointermove", closeIfOutsideChart, { passive: true });
    return () => window.removeEventListener("pointermove", closeIfOutsideChart);
  }, [incomeCursorTip]);

  const handleIncomePiePointer = (sector, _index, e) => {
    const p = incomeMixSectorPayload(sector);
    if (!p?.name) return;
    setIncomeCursorTip({ clientX: e.clientX, clientY: e.clientY, p });
  };

  const clearIncomeCursorTip = () => setIncomeCursorTip(null);

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
          Income Source Mix
        </div>
        <SectionBadge>Kajabi revenue mix</SectionBadge>
      </div>
      <p className="pb-2 text-[11px] font-medium leading-snug text-slate-500">
        Helps you see PIF revenue alongside newer agreement income and longer-running agreement income.
      </p>
      <div className="min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        <SegmentedTabs
          items={TIME_RANGE_ITEMS}
          activeId={range}
          onChange={handleRangeChange}
          size="xs"
          className="w-max border-slate-200/90 bg-slate-100/80"
          activeClassName="!bg-sky-100 !text-blue-700 !ring-sky-200/80"
        />
      </div>
      {range === "byMonth" ? (
        <div className="mt-2 min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          <SegmentedTabs
            items={incomeMixMonthItems}
            activeId={String(incomeMixMonth)}
            onChange={(id) => setIncomeMixMonth(id)}
            size="xs"
            className="w-max border-slate-200 bg-white"
            activeClassName="!bg-sky-100 !text-blue-700 !ring-sky-200/80"
          />
        </div>
      ) : range === "custom" ? (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5 bg-white sm:flex-nowrap">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
          <span className="text-[10px] font-semibold text-slate-500">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <div className="flex h-[200px] flex-1 items-center justify-center">
            {shimmer("h-36 w-36 rounded-full")}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <div className="space-y-1.5">
              {shimmer("h-2.5 w-28")}
              {shimmer("h-6 w-32")}
            </div>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between">
                  {shimmer("h-2.5 w-20")}
                  {shimmer("h-2.5 w-12")}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-[12px] font-semibold text-red-700">
          {error}
        </div>
      ) : sliceSumCents === 0 && netHeadlineCents === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] font-semibold text-slate-500">
          No income found in selected range.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div
            ref={chartHitRef}
            className="mx-auto flex h-[200px] w-[200px] shrink-0 items-center justify-center"
            onMouseLeave={clearIncomeCursorTip}
          >
            {hasPieSlices ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={0}
                    outerRadius={78}
                    paddingAngle={1.5}
                    stroke="none"
                    onMouseEnter={handleIncomePiePointer}
                    onMouseMove={handleIncomePiePointer}
                    onMouseLeave={clearIncomeCursorTip}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-semibold leading-snug text-slate-400">
                No positive slice totals to chart—see legend for signed amounts.
              </div>
            )}
          </div>

          {incomeCursorTip && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="pointer-events-none fixed z-[9999]"
                  style={clampIncomeTooltipPosition(
                    incomeCursorTip.clientX,
                    incomeCursorTip.clientY,
                  )}
                >
                  <IncomeMixTooltipCard p={incomeCursorTip.p} totalBasis="net" />
                </div>,
                document.body,
              )
            : null}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="min-h-[48px] rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[8px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                  Total net income
                </p>
              </div>
              <p className="mt-0.5 text-[18px] font-extrabold leading-none text-slate-950">
                {formatCents(headlineCents)}
              </p>
            </div>

            <div className="mt-2 min-h-[56px] divide-y divide-slate-100 rounded-xl border border-slate-100">
              {rows.map((row) => (
                <div key={row.key} className="flex items-start justify-between gap-3 px-2 py-1.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold leading-none text-slate-800">{row.label}</p>
                      <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                        {row.txCount} tx
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-extrabold tabular-nums leading-none text-slate-950">
                      {formatCents(row.valueCents)}
                    </p>
                    {headlineCents !== 0 ? (
                      <p className="mt-0.5 text-[9px] font-semibold tabular-nums leading-none text-slate-500">
                        {incomeMixPercentOfTotal(row.valueCents, headlineCents)}%
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RevenueMixPanel({
  rows,
  loading,
  error,
  statusFilter,
  setStatusFilter,
  dateFilter,
  setDateFilter,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}) {
  return (
    <div className="flex max-h-[400px] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
            Sales by Product / Offer
          </div>
          <SectionBadge>What's Selling</SectionBadge>
        </div>
        <p className="text-[11px] font-medium text-slate-500 leading-snug">
          Helps decide which offer to push, which to retire, and where to upsell.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 max-w-full shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
            aria-label="Offer status filter"
          >
            {PRODUCT_STATUS_ITEMS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-7 max-w-full shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
            aria-label="Offer sales date filter"
          >
            {PRODUCT_DATE_ITEMS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {!loading && !error ? (
          <div className="text-right text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
            <div>{rows.length} offer row{rows.length !== 1 ? "s" : ""}</div>
          </div>
        ) : null}
      </div>
      {dateFilter === "custom" ? (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5 bg-white sm:flex-nowrap">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
          <span className="text-[10px] font-semibold text-slate-500">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-2 h-[30px] w-full animate-pulse rounded bg-slate-100" />
      ) : error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[11px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 divide-y divide-slate-100 [scrollbar-width:thin]">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2.5">
              {shimmer("h-3 w-32")}
              {shimmer("h-3 w-20")}
            </div>
          ))
        ) : error ? null : rows.length === 0 ? (
          <p className="py-4 text-center text-[12px] font-semibold text-slate-500">No offers found.</p>
        ) : (
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[minmax(170px,1.5fr)_80px_90px_90px_90px] gap-3 border-b border-slate-100 px-1 pb-2 text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              <span>Name</span>
              <span className="text-right">Status</span>
              <span className="text-right">Installments</span>
              <span className="text-right">Price</span>
              <span className="text-right">Total</span>
            </div>
            {rows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[minmax(170px,1.5fr)_80px_90px_90px_90px] items-center gap-3 border-b border-slate-100 px-1 py-2.5 last:border-b-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-extrabold text-slate-500">
                    {index + 1}
                  </span>
                  <span className="block truncate text-[12px] font-bold text-slate-800">{row.name}</span>
                </div>
                <span className={cx(
                  "text-right text-[10px] font-extrabold uppercase tracking-[0.06em]",
                  row.active ? "text-emerald-600" : "text-slate-400",
                )}>
                  {row.active ? "Active" : "Inactive"}
                </span>
                <span className="text-right text-[11px] font-bold text-slate-600">
                  {row.installmentsLabel}
                </span>
                <span className="text-right text-[11px] font-bold text-slate-600">
                  {row.priceLabel}
                </span>
                <span className="text-right text-[11px] font-extrabold text-slate-950">
                  {row.totalLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function dailySalesBarColor(revenue, monthlyGoal) {
  const r = Number(revenue);
  if (!Number.isFinite(r)) return PERFORMANCE_COLORS.BAD;
  const dailyTarget = monthlyGoal / 30;
  if (r >= dailyTarget) return PERFORMANCE_COLORS.GOOD;
  if (r >= dailyTarget * 0.7) return PERFORMANCE_COLORS.OK;
  return PERFORMANCE_COLORS.BAD;
}

function DailySalesTooltip({ active, payload, label, monthlyGoal }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const revenue = row?.revenue ?? payload[0]?.value;
  const barHex = dailySalesBarColor(revenue, monthlyGoal);

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
      <p className="text-[11px] font-extrabold text-slate-950">
        {row?.date || label}
      </p>
      <p className="mt-1 text-[12px] font-extrabold" style={{ color: barHex }}>
        {formatUsd(payload[0]?.value)}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
        Daily revenue
      </p>
      <p className="mt-2 border-t border-slate-100 pt-2 text-[9px] font-medium leading-snug text-slate-500">
        {dailySalesBarBenchmarkHint(monthlyGoal)}
      </p>
    </div>
  );
}

function DailySalesTrend({
  data,
  stats,
  loading,
  monthlyGoal,
  error,
  range,
  setRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}) {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1000);
  const tickStep = Math.max(1, Math.ceil(data.length / 5));
  
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
          Daily Sales Trend
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="h-7 max-w-full shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
          aria-label="Daily sales range"
        >
          {DAILY_SALES_RANGE_ITEMS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {range === "custom" ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 bg-white sm:flex-nowrap">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
          <span className="text-[10px] font-semibold text-slate-500">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
        </div>
      ) : null}
      {error ? (
        <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[11px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-1 h-[140px]">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded bg-slate-50" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barCategoryGap="18%"
              >
                <XAxis
                  dataKey="date"
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickLine={false}
                  tickFormatter={(val, i) => {
                    if (i !== 0 && i !== data.length - 1 && i % tickStep !== 0) return "";
                    return new Date(`${val}T00:00:00.000Z`).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    });
                  }}
                  tick={{
                    fill: "#94A3B8",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                  height={22}
                />
                <YAxis hide domain={[0, maxRevenue * 1.1]} />
                <Tooltip
                  content={<DailySalesTooltip monthlyGoal={monthlyGoal} />}
                  cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar
                  dataKey="revenue"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={38}
                  isAnimationActive={false}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={dailySalesBarColor(entry.revenue, monthlyGoal)} />
                  ))}
                </Bar>
              </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {!loading && (
        <p className="mt-3 text-[10px] font-medium leading-snug text-slate-500">
          <span className="text-slate-400">Gross per UTC day</span>
          {stats.best !== "—" && stats.worst !== "—" ? (
            <span className="text-slate-600">
              {" · "}
              max {stats.best}
              <span className="text-slate-300"> · </span>
              min {stats.worst}
            </span>
          ) : null}
        </p>
      )}
      {loading && (
        <div className="mt-3 max-w-sm">{shimmer("h-2.5 w-full")}</div>
      )}
    </div>
  );
}

function PaymentPlanForecastPanel({
  cards,
  dailySeries,
  loading,
  error,
  range,
  setRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}) {
  const maxDayAmount = Math.max(
    ...(dailySeries || []).map((d) => Number(d?.amount) || 0),
    1,
  );
  const tickStep = Math.max(1, Math.ceil((dailySeries || []).length / 5));

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
            Payment plan payments over time
          </div>
          <SectionBadge>Kajabi forecast</SectionBadge>
        </div>
        <p className="text-[11px] font-medium text-slate-500 leading-snug">
          Expected installment cash from active Kajabi payment plans due in the selected range.
        </p>
      </div>

      <div className="min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="h-7 max-w-full shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 focus:border-blue-500 focus:outline-none"
          aria-label="Payment plan forecast range"
        >
          {FORECAST_RANGE_ITEMS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {range === "custom" ? (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5 bg-white">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
          <span className="text-[10px] font-semibold text-slate-500">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="h-7 w-full rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-700 !outline-none"
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[11px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {!error && loading ? <PaymentPlanDailyChartShimmer /> : null}
      {!error && !loading && (dailySeries || []).length > 0 ? (
        <div className="mt-3 flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
              Expected per day
            </span>
            <span className="text-[9px] font-semibold text-slate-400">UTC</span>
          </div>
          <div className="h-[140px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dailySeries}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barCategoryGap="18%"
              >
                <XAxis
                  dataKey="date"
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickLine={false}
                  tickFormatter={(val, i) => {
                    const len = dailySeries.length;
                    if (i !== 0 && i !== len - 1 && i % tickStep !== 0) return "";
                    return new Date(`${val}T00:00:00.000Z`).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    });
                  }}
                  tick={{
                    fill: "#94A3B8",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                  height={22}
                />
                <YAxis hide domain={[0, maxDayAmount * 1.1]} />
                <Tooltip
                  content={<PaymentPlanDailyTooltip />}
                  cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar
                  dataKey="amount"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={38}
                  isAnimationActive={false}
                >
                  {(dailySeries || []).map((entry, index) => (
                    <Cell key={`fc-${entry.date}-${index}`} fill={forecastDayBarFill(entry.amount)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span className="h-3 w-3 rounded-[2px] bg-emerald-500" />
              Expected cash due ($)
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {loading
          ? [1, 2].map((i) => <RevenueCardShimmer key={i} />)
          : cards.map((card) => (
              <article
                key={card.label}
                className="min-h-[82px] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                  {card.label}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className={cx("text-[20px] font-extrabold leading-none tracking-normal", card.valueClass)}>
                    {card.value}
                  </div>
                  {card.info ? (
                    <span className="group relative inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-extrabold leading-none text-slate-400 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">
                      ?
                      <span className="pointer-events-none absolute right-0 top-6 z-20 hidden w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-snug text-slate-600 shadow-[0_10px_28px_rgba(15,23,42,0.16)] group-hover:block">
                        {card.info}
                      </span>
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[10px] font-semibold text-slate-500">{card.note}</p>
              </article>
            ))}
      </div>
    </div>
  );
}

export default function Sales() {
  const { monthlyRevenueGoal } = useRevenueGoal();
  const customFallback = getRangeBounds("custom");
  const [range, setRange] = useState("mtd");
  const [customStart, setCustomStart] = useState(
    customFallback.start.toISOString().slice(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(
    customFallback.end.toISOString().slice(0, 10),
  );
  const [incomeMixMonth, setIncomeMixMonth] = useState(() => currentIncomeMixMonthKey());
  const [forecastRange, setForecastRange] = useState("dtm");
  const [forecastCustomStart, setForecastCustomStart] = useState(
    customFallback.start.toISOString().slice(0, 10),
  );
  const [forecastCustomEnd, setForecastCustomEnd] = useState(
    customFallback.end.toISOString().slice(0, 10),
  );
  const dailyFallback = getDailySalesRangeBounds("last30");
  const [dailyRange, setDailyRange] = useState("last30");
  const [dailyCustomStart, setDailyCustomStart] = useState(
    dailyFallback.start.toISOString().slice(0, 10),
  );
  const [dailyCustomEnd, setDailyCustomEnd] = useState(
    dailyFallback.end.toISOString().slice(0, 10),
  );
  const snapshotFallback = getDailySalesRangeBounds("mtd");
  const [snapshotRange, setSnapshotRange] = useState("mtd");
  const [snapshotCustomStart, setSnapshotCustomStart] = useState(
    snapshotFallback.start.toISOString().slice(0, 10),
  );
  const [snapshotCustomEnd, setSnapshotCustomEnd] = useState(
    snapshotFallback.end.toISOString().slice(0, 10),
  );
  const riskFallback = getDailySalesRangeBounds("mtd");
  const [riskRange, setRiskRange] = useState("mtd");
  const [riskCustomStart, setRiskCustomStart] = useState(
    riskFallback.start.toISOString().slice(0, 10),
  );
  const [riskCustomEnd, setRiskCustomEnd] = useState(
    riskFallback.end.toISOString().slice(0, 10),
  );
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [error, setError] = useState(null);
  const [riskError, setRiskError] = useState(null);
  const [mixLoading, setMixLoading] = useState(true);
  const [mixError, setMixError] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState(null);
  const [productLoading, setProductLoading] = useState(true);
  const [productError, setProductError] = useState(null);
  const [productStatusFilter, setProductStatusFilter] = useState("active");
  const [productDateFilter, setProductDateFilter] = useState("mtd");
  const [productCustomStart, setProductCustomStart] = useState(
    customFallback.start.toISOString().slice(0, 10),
  );
  const [productCustomEnd, setProductCustomEnd] = useState(
    customFallback.end.toISOString().slice(0, 10),
  );
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyError, setDailyError] = useState(null);
  const [incomeMixUnified, setIncomeMixUnified] = useState(() => emptyUnifiedIncomeMix());
  const [forecastCards, setForecastCards] = useState([]);
  const [forecastDailySeries, setForecastDailySeries] = useState([]);
  const [productRows, setProductRows] = useState([]);
  const [dailySales, setDailySales] = useState([]);
  const [dailyStats, setDailyStats] = useState({ best: "—", worst: "—" });
  const [revenueCards, setRevenueCards] = useState([]);
  const [riskCards, setRiskCards] = useState([]);
  const snapshotBounds = getSnapshotRangeBounds(
    snapshotRange,
    snapshotCustomStart,
    snapshotCustomEnd,
  );
  const snapshotGoalUsd = calculateSnapshotGoalUsd(
    monthlyRevenueGoal,
    snapshotBounds.start,
    snapshotBounds.end,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRevenueSnapshot() {
      setRevenueLoading(true);
      setError(null);

      try {
        const { start, end } = getSnapshotRangeBounds(
          snapshotRange,
          snapshotCustomStart,
          snapshotCustomEnd,
        );
        const mainStartISO = start.toISOString();
        const mainEndISO = end.toISOString();
        const txResult = await supabase
          .from("kajabi_transactions")
          .select("action, state, amount_in_cents, created_at_kajabi, effective_date, payment_resolved_at, kajabi_offer_id, kajabi_purchase_id")
          .or(`and(created_at_kajabi.gte.${mainStartISO},created_at_kajabi.lte.${mainEndISO}),and(effective_date.gte.${mainStartISO},effective_date.lte.${mainEndISO}),and(payment_resolved_at.gte.${mainStartISO},payment_resolved_at.lte.${mainEndISO})`);

        if (txResult.error) throw txResult.error;

        const paceTargetSafe = calculateSnapshotGoalUsd(monthlyRevenueGoal, start, end);
        const netUsd = sumNetTransactions(txResult.data, mainStartISO, mainEndISO);

        function getRevenueStatus(val, target) {
          const isGood = val >= target;
          const isOk = val >= target * 0.9;

          return {
            textClass: isGood ? PERFORMANCE_TEXT_CLASSES.GOOD : isOk ? PERFORMANCE_TEXT_CLASSES.OK : PERFORMANCE_TEXT_CLASSES.BAD,
            badgeClass: isGood ? PERFORMANCE_SOFT_BG_CLASSES.GOOD : isOk ? PERFORMANCE_SOFT_BG_CLASSES.OK : PERFORMANCE_SOFT_BG_CLASSES.BAD,
            label: isGood ? "On pace" : isOk ? "Near target" : "Behind pace",
          };
        }

        const netStatus = getRevenueStatus(netUsd, paceTargetSafe);
        const netTitle = snapshotRange === "mtd" ? "Net revenue MTD" : "Net revenue";

        const nextRevenueCards = [
          {
            label: netTitle,
            value: formatUsd(netUsd),
            valueClass: netStatus.textClass,
            note: "After refunds & failed charges",
            progress: Math.min(100, Math.round(pct(netUsd, paceTargetSafe))),
            progressNote: `${Math.round(pct(netUsd, paceTargetSafe))}% of ${formatUsd(paceTargetSafe)} pace`,
            progressFill: paceProgressFill(netUsd, paceTargetSafe),
            badge: netStatus.label,
            badgeClass: netStatus.badgeClass,
            pie: {
              mainUsd: netUsd,
              capUsd: paceTargetSafe,
              accentFill: paceProgressFill(netUsd, paceTargetSafe),
            },
          },
        ];

        if (!cancelled) {
          setRevenueCards(nextRevenueCards);
        }
      } catch (err) {
        if (!cancelled) {
          setRevenueCards([]);
          setError(err?.message || "Failed to load revenue snapshot");
        }
      } finally {
        if (!cancelled) setRevenueLoading(false);
      }
    }

    loadRevenueSnapshot();
    return () => {
      cancelled = true;
    };
  }, [snapshotRange, snapshotCustomStart, snapshotCustomEnd, monthlyRevenueGoal]);

  useEffect(() => {
    let cancelled = false;

    async function loadRiskPanelMtd() {
      setRiskLoading(true);
      setRiskError(null);

      try {
        const { start, end } =
          riskRange === "custom"
            ? normalizeCustomBounds(riskCustomStart, riskCustomEnd)
            : getDailySalesRangeBounds(riskRange);
        const mainStartISO = start.toISOString();
        const mainEndISO = end.toISOString();

        const txResult = await supabase
          .from("kajabi_transactions")
          .select("action, state, amount_in_cents, created_at_kajabi, effective_date, payment_resolved_at, kajabi_offer_id, kajabi_purchase_id")
          .or(`and(created_at_kajabi.gte.${mainStartISO},created_at_kajabi.lte.${mainEndISO}),and(effective_date.gte.${mainStartISO},effective_date.lte.${mainEndISO}),and(payment_resolved_at.gte.${mainStartISO},payment_resolved_at.lte.${mainEndISO})`);

        if (txResult.error) throw txResult.error;

        const grossUsd = sumGrossTransactions(txResult.data, mainStartISO, mainEndISO);

        let refundUsd = 0;
        let failedCount = 0;
        let failedUsd = 0;

        for (const tx of txResult.data || []) {
          if (!transactionTouchesWindow(tx, mainStartISO, mainEndISO)) continue;

          const actionRaw = tx.action ?? (tx.amount_in_cents >= 0 ? "charge" : "refund");
          const amount = txAmountUsd(tx);
          const isFailed = isFailedTransaction(tx);

          if (isFailed) {
            failedCount++;
            failedUsd += amount;
          }

          const resolvedInRange =
            tx.payment_resolved_at != null &&
            tx.payment_resolved_at >= mainStartISO &&
            tx.payment_resolved_at <= mainEndISO &&
            (tx.effective_date == null || tx.effective_date < mainStartISO || tx.effective_date > mainEndISO);
          const inNetRange =
            (tx.effective_date >= mainStartISO && tx.effective_date <= mainEndISO) || resolvedInRange;

          if (inNetRange && !isFailed) {
            const action = resolvedInRange ? "charge" : actionRaw;
            const isRefund = String(action).toLowerCase() === "refund" || tx.amount_in_cents < 0;

            if (isRefund) {
              refundUsd += amount;
            }
          }
        }

        const refundPctValue = Math.round(pct(refundUsd, grossUsd));
        const refundStatusClass = refundPctValue > 5 ? PERFORMANCE_TEXT_CLASSES.BAD : "text-slate-900";
        const refundsLabel = riskRange === "mtd" ? "Refunds MTD" : "Refunds";

        const nextRiskCards = [
          {
            label: refundsLabel,
            value: formatUsd(refundUsd),
            valueClass: refundStatusClass,
            note: `${refundPctValue}% of gross`,
            info: "Refund dollars from Kajabi transactions in this range, as a percentage of gross charges in the same period.",
          },
          {
            label: "Outstanding A/R",
            value: formatUsd(failedUsd),
            valueClass: "text-amber-600",
            note: `${failedCount} payments currently failed`,
            info: "Sum of failed and disputed charge amounts in this range from kajabi_transactions — not unpaid installment balances.",
          },
          {
            label: "Failed attempts",
            value: String(failedCount),
            valueClass: "text-rose-600",
            note: "Includes disputes & declines",
            info: "Number of charges in this range where Kajabi marked the payment failed, declined, or disputed.",
          },
        ];

        if (!cancelled) setRiskCards(nextRiskCards);
      } catch (err) {
        if (!cancelled) {
          setRiskCards([]);
          setRiskError(err?.message || "Failed to load refunds & risk");
        }
      } finally {
        if (!cancelled) setRiskLoading(false);
      }
    }

    loadRiskPanelMtd();
    return () => {
      cancelled = true;
    };
  }, [riskRange, riskCustomStart, riskCustomEnd]);

  useEffect(() => {
    let cancelled = false;

    async function loadDailySalesData() {
      setDailyLoading(true);
      setDailyError(null);

      try {
        const { start, end } =
          dailyRange === "custom"
            ? normalizeCustomBounds(dailyCustomStart, dailyCustomEnd)
            : getDailySalesRangeBounds(dailyRange);
        const startISO = start.toISOString();
        const endISO = end.toISOString();

        const txResult = await supabase
          .from("kajabi_transactions")
          .select("action, state, amount_in_cents, created_at_kajabi, effective_date, payment_resolved_at")
          .or(`and(created_at_kajabi.gte.${startISO},created_at_kajabi.lte.${endISO}),and(effective_date.gte.${startISO},effective_date.lte.${endISO}),and(payment_resolved_at.gte.${startISO},payment_resolved_at.lte.${endISO})`);

        if (txResult.error) throw txResult.error;

        const dailyMap = {};

        for (const tx of txResult.data || []) {
          const cashDate = transactionCashDate(tx);
          if (!cashDate || cashDate < startISO || cashDate > endISO) continue;

          const resolvedOnThisDate = tx?.payment_resolved_at === cashDate;
          const action = resolvedOnThisDate
            ? "charge"
            : String(tx?.action || (Number(tx?.amount_in_cents || 0) >= 0 ? "charge" : "refund")).toLowerCase();
          const isRefund = action === "refund" || Number(tx?.amount_in_cents || 0) < 0;
          if (isRefund) continue;
          if (!resolvedOnThisDate && isFailedTransaction(tx, action)) continue;

          const dayKey = cashDate.slice(0, 10);
          dailyMap[dayKey] = (dailyMap[dayKey] || 0) + txAmountUsd(tx);
        }

        const rows = listDaysISO(start, end).map((date) => ({
          date,
          revenue: dailyMap[date] || 0,
        }));
        const sortedDaily = [...rows].sort((a, b) => b.revenue - a.revenue);
        const best = sortedDaily[0];
        const worst = [...rows].sort((a, b) => a.revenue - b.revenue)[0];

        if (!cancelled) {
          setDailySales(rows);
          setDailyStats({
            best: best ? `${best.date} (${formatUsd(best.revenue)})` : "—",
            worst: worst ? `${worst.date} (${formatUsd(worst.revenue)})` : "—",
          });
        }
      } catch (err) {
        if (!cancelled) {
          setDailySales([]);
          setDailyStats({ best: "—", worst: "—" });
          setDailyError(err?.message || "Failed to load daily sales trend");
        }
      } finally {
        if (!cancelled) setDailyLoading(false);
      }
    }

    loadDailySalesData();
    return () => { cancelled = true; };
  }, [dailyRange, dailyCustomStart, dailyCustomEnd]);

  useEffect(() => {
    let cancelled = false;

    async function loadIncomeMixData() {
      setMixLoading(true);
      setMixError(null);

      try {
        const { start, end } = getIncomeMixRangeBounds(range, customStart, customEnd, incomeMixMonth);
        const startISO = start.toISOString();
        const endISO = end.toISOString();
        const queryStartISO = startISO;
        const queryEndISO = endISO;

        const [txResult, offersResult, purchasesResult] = await Promise.all([
          supabase
            .from("kajabi_transactions")
            .select("action, state, amount_in_cents, created_at_kajabi, effective_date, payment_resolved_at, kajabi_offer_id, kajabi_customer_id, kajabi_purchase_id")
            .or(`and(created_at_kajabi.gte.${queryStartISO},created_at_kajabi.lte.${queryEndISO}),and(effective_date.gte.${queryStartISO},effective_date.lte.${queryEndISO}),and(payment_resolved_at.gte.${queryStartISO},payment_resolved_at.lte.${queryEndISO})`),
          supabase
            .from("offers")
            .select("kajabi_id, name, price, is_subscription, installments"),
          supabase
            .from("kajabi_purchases")
            .select("kajabi_purchase_id, kajabi_offer_id, kajabi_customer_id, payment_type, created_at_kajabi, deactivated_at, multipay_payments_made"),
        ]);

        if (txResult.error) throw txResult.error;
        if (offersResult.error) throw offersResult.error;
        if (purchasesResult.error) throw purchasesResult.error;

        const offersById = {};
        for (const offer of offersResult.data || []) {
          if (offer?.kajabi_id != null) offersById[String(offer.kajabi_id)] = offer;
        }

        const payoffOfferIds = new Set(PAYOFF_OFFER_IDS);
        for (const offer of offersResult.data || []) {
          const offerName = String(offer?.name || "").toLowerCase();
          if (offerName.includes("payoff") && offer?.kajabi_id) {
            payoffOfferIds.add(String(offer.kajabi_id));
          }
        }

        const purchasesById = {};
        const purchasesByCustomerOffer = {};
        for (const purchase of purchasesResult.data || []) {
          const purchaseId = purchase?.kajabi_purchase_id != null ? String(purchase.kajabi_purchase_id) : null;
          const customerId = purchase?.kajabi_customer_id != null ? String(purchase.kajabi_customer_id) : null;
          const offerId = purchase?.kajabi_offer_id != null ? String(purchase.kajabi_offer_id) : null;
          if (purchaseId) purchasesById[purchaseId] = purchase;
          if (customerId && offerId) {
            const key = `${customerId}|${offerId}`;
            if (!purchasesByCustomerOffer[key]) purchasesByCustomerOffer[key] = [];
            purchasesByCustomerOffer[key].push(purchase);
          }
        }
        for (const matches of Object.values(purchasesByCustomerOffer)) {
          matches.sort((a, b) => new Date(b?.created_at_kajabi || 0) - new Date(a?.created_at_kajabi || 0));
        }

        const txRows = Array.isArray(txResult.data) ? txResult.data : [];
        const txPurchaseIds = [
          ...new Set(txRows.map((tx) => tx?.kajabi_purchase_id).filter(Boolean).map(String)),
        ];

        const [outcomeResult, overrideResult] = txPurchaseIds.length > 0
          ? await Promise.all([
              supabase
                .from("outcome_log")
                .select("purchase_date, kajabi_purchase_id, kajabi_payoff_id")
                .or(`kajabi_purchase_id.in.(${txPurchaseIds.join(",")}),kajabi_payoff_id.in.(${txPurchaseIds.join(",")})`),
              supabase
                .from("purchase_treatment_override")
                .select("kajabi_purchase_id, treatment")
                .in("kajabi_purchase_id", txPurchaseIds),
            ])
          : [{ data: [], error: null }, { data: [], error: null }];

        if (outcomeResult.error) throw outcomeResult.error;
        if (overrideResult.error) throw overrideResult.error;

        const outcomeByMainPurchaseId = {};
        const outcomeByPayoffPurchaseId = {};
        for (const row of outcomeResult.data || []) {
          if (row?.kajabi_purchase_id != null) {
            outcomeByMainPurchaseId[String(row.kajabi_purchase_id)] = row;
          }
          if (row?.kajabi_payoff_id != null) {
            outcomeByPayoffPurchaseId[String(row.kajabi_payoff_id)] = row;
          }
        }

        const treatmentByPurchaseId = {};
        for (const row of overrideResult.data || []) {
          if (row?.kajabi_purchase_id != null && row?.treatment) {
            treatmentByPurchaseId[String(row.kajabi_purchase_id)] = String(row.treatment).toLowerCase();
          }
        }

        function resolvePurchase(tx) {
          if (tx?.kajabi_purchase_id && purchasesById[String(tx.kajabi_purchase_id)]) {
            return purchasesById[String(tx.kajabi_purchase_id)];
          }

          const customerId = tx?.kajabi_customer_id != null ? String(tx.kajabi_customer_id) : null;
          const offerId = tx?.kajabi_offer_id != null ? String(tx.kajabi_offer_id) : null;
          if (!customerId || !offerId) return null;

          const txDate = transactionCashDate(tx);
          const matches = purchasesByCustomerOffer[`${customerId}|${offerId}`] || [];
          if (!txDate) return matches[0] || null;
          return matches.find((purchase) => {
            return purchase?.created_at_kajabi && purchase.created_at_kajabi <= txDate;
          }) || matches[0] || null;
        }

        const classifyCtxBase = {
          offersById,
          payoffOfferIds,
          treatmentByPurchaseId,
          outcomeByMainPurchaseId,
          outcomeByPayoffPurchaseId,
          resolvePurchase,
        };
        const classifyCtx = { ...classifyCtxBase, startISO, endISO };

        const netAgg = createEmptyIncomeMixAgg();
        for (const tx of txRows) {
          const line = netLineContributionForIncomeMix(tx, startISO, endISO);
          if (!line) continue;
          const cls = incomeMixClassifyTx(tx, classifyCtx);
          bumpIncomeMixAgg(netAgg, line.signedUsd, cls);
        }

        const grossAgg = createEmptyIncomeMixAgg();
        for (const tx of txRows) {
          const line = grossLineContributionForIncomeMix(tx, startISO, endISO);
          if (!line) continue;
          const cls = incomeMixClassifyTx(tx, classifyCtx);
          bumpIncomeMixAgg(grossAgg, line.signedUsd, cls);
        }

        const netTotalCents = Math.round(sumNetTransactions(txRows, startISO, endISO) * 100);
        const grossTotalCents = Math.round(sumGrossTransactions(txRows, startISO, endISO) * 100);

        const netModel = incomeMixAggToSlicesModel(netAgg);
        const grossModel = incomeMixAggToSlicesModel(grossAgg);

        if (!cancelled) {
          setIncomeMixUnified({
            slicesNet: netModel.slices,
            slicesGross: grossModel.slices,
            netTotalCents,
            grossTotalCents,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setIncomeMixUnified(emptyUnifiedIncomeMix());
          setMixError(err?.message || "Failed to load income mix data");
        }
      } finally {
        if (!cancelled) setMixLoading(false);
      }
    }

    loadIncomeMixData();
    return () => { cancelled = true; };
  }, [range, customStart, customEnd, incomeMixMonth]);

  useEffect(() => {
    let cancelled = false;

    async function loadProductMixData() {
      setProductLoading(true);
      setProductError(null);

      try {
        const { start, end } =
          productDateFilter === "custom"
            ? normalizeCustomBounds(productCustomStart, productCustomEnd)
            : getRangeBounds(productDateFilter);
        const startISO = start.toISOString();
        const endISO = end.toISOString();

        const [offersResult, txResult, purchasesResult] = await Promise.all([
          supabase
            .from("offers")
            .select("id, kajabi_id, name, price, installments, active")
            .order("created_at", { ascending: true }),
          supabase
            .from("kajabi_transactions")
            .select("action, state, amount_in_cents, created_at_kajabi, effective_date, payment_resolved_at, kajabi_offer_id, kajabi_purchase_id")
            .or(`and(created_at_kajabi.gte.${startISO},created_at_kajabi.lte.${endISO}),and(effective_date.gte.${startISO},effective_date.lte.${endISO}),and(payment_resolved_at.gte.${startISO},payment_resolved_at.lte.${endISO})`),
          supabase
            .from("kajabi_purchases")
            .select("kajabi_purchase_id, kajabi_offer_id"),
        ]);

        if (offersResult.error) throw offersResult.error;
        if (txResult.error) throw txResult.error;
        if (purchasesResult.error) throw purchasesResult.error;

        const purchasesById = {};
        for (const purchase of purchasesResult.data || []) {
          if (purchase?.kajabi_purchase_id != null) {
            purchasesById[String(purchase.kajabi_purchase_id)] = purchase;
          }
        }

        const salesByOfferId = {};
        for (const tx of txResult.data || []) {
          if (!isChargeInRange(tx, startISO, endISO)) continue;
          const linkedPurchase = tx?.kajabi_purchase_id ? purchasesById[String(tx.kajabi_purchase_id)] : null;
          const offerId = linkedPurchase?.kajabi_offer_id || tx?.kajabi_offer_id;
          if (offerId == null) continue;
          const key = String(offerId);
          salesByOfferId[key] = (salesByOfferId[key] || 0) + txAmountUsd(tx);
        }

        const offersRaw = offersResult.data || [];
        const specialOfferIds = new Set([LOCK_IN_OFFER_DB_ID, PAYOFF_OFFER_DB_ID]);
        const rows = offersRaw
          .filter((offer) => {
            const isSpecialOffer = specialOfferIds.has(offer?.id);
            const isActive = offer?.active === true;
            if (productStatusFilter === "active" && (isSpecialOffer || !isActive)) return false;
            if (productStatusFilter === "inactive" && (isSpecialOffer || isActive)) return false;
            return true;
          })
          .map((offer, index) => {
          const installments = Number(offer?.installments);
          const price = Number(offer?.price);
          const totalValue = salesByOfferId[String(offer?.kajabi_id)] || 0;
          return {
            id: offer?.kajabi_id || `${offer?.name || "offer"}-${index}`,
            name: String(offer?.name || "Unknown offer").replace(/\s+/g, " ").trim(),
            installmentsLabel: Number.isFinite(installments)
              ? installments === 0 ? "Single" : String(installments)
              : "-",
            priceLabel: Number.isFinite(price) ? formatUsd(price) : "-",
            totalLabel: Number.isFinite(totalValue) ? formatUsd(totalValue) : "-",
            active: offer?.active === true,
          };
        });

        if (!cancelled) {
          setProductRows(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setProductRows([]);
          setProductError(err?.message || "Failed to load offers");
        }
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    }

    loadProductMixData();
    return () => { cancelled = true; };
  }, [productStatusFilter, productDateFilter, productCustomStart, productCustomEnd]);

  useEffect(() => {
    let cancelled = false;

    async function loadForecastData() {
      setForecastLoading(true);
      setForecastError(null);

      try {
        const { start, end } =
          forecastRange === "custom"
            ? normalizeCustomBounds(forecastCustomStart, forecastCustomEnd)
            : getForecastRangeBounds(forecastRange);
        const startISO = start.toISOString();
        const endISO = end.toISOString();
        const forecastDayKeys = listDaysISO(start, end);
        const byForecastDay = Object.fromEntries(
          forecastDayKeys.map((d) => [d, { amount: 0, paymentCount: 0 }]),
        );

        const [offersResult, purchasesResult] = await Promise.all([
          supabase.from("offers").select("kajabi_id, name, price, installments"),
          supabase
            .from("kajabi_purchases")
            .select("kajabi_purchase_id, kajabi_offer_id, payment_type, amount_in_cents, created_at_kajabi, deactivated_at, multipay_payments_made"),
        ]);

        if (offersResult.error) throw offersResult.error;
        if (purchasesResult.error) throw purchasesResult.error;

        const offersById = {};
        for (const offer of offersResult.data || []) {
          if (offer?.kajabi_id != null) offersById[String(offer.kajabi_id)] = offer;
        }

        let expectedUsd = 0;
        let expectedPayments = 0;

        for (const purchase of purchasesResult.data || []) {
          if (purchase?.deactivated_at) continue;

          const paymentType = String(purchase?.payment_type || "").toLowerCase();
          const offerId = String(purchase?.kajabi_offer_id || "unknown");
          const offer = offersById[offerId] || KAJABI_OFFER_FALLBACKS[offerId] || null;
          const totalInstallments = Number(offer?.installments) || 0;
          const isPaymentPlan =
            paymentType.includes("multipay") ||
            paymentType.includes("payment plan") ||
            totalInstallments > 1;
          if (!isPaymentPlan || totalInstallments <= 1 || !purchase?.created_at_kajabi) continue;

          const madeRaw = Number(purchase?.multipay_payments_made);
          const made = Number.isFinite(madeRaw) && madeRaw > 0 ? madeRaw : 1;
          const remaining = totalInstallments - made;
          if (remaining <= 0) continue;

          const purchaseAmountUsd = Number(purchase?.amount_in_cents) > 0
            ? Number(purchase.amount_in_cents) / 100
            : null;
          const fallbackAmountUsd = Number(offer?.price) > 0 ? Number(offer.price) : 0;
          const perInstallmentUsd = purchaseAmountUsd ?? fallbackAmountUsd;
          if (perInstallmentUsd <= 0) continue;

          const created = new Date(purchase.created_at_kajabi);

          for (let installmentNumber = made + 1; installmentNumber <= totalInstallments; installmentNumber++) {
            const dueDate = addMonthsClamped(created, installmentNumber - 1);
            const dueISO = dueDate.toISOString();
            if (dueISO < startISO || dueISO > endISO) continue;
            const dayKey = dueISO.slice(0, 10);
            const dayBucket = byForecastDay[dayKey];
            expectedUsd += perInstallmentUsd;
            expectedPayments += 1;
            if (dayBucket) {
              dayBucket.amount += perInstallmentUsd;
              dayBucket.paymentCount += 1;
            }
          }
        }

        if (!cancelled) {
          const nextDaily = forecastDayKeys.map((date) => {
            const b = byForecastDay[date] || { amount: 0, paymentCount: 0 };
            return {
              date,
              amount: b.amount,
              paymentCount: b.paymentCount,
            };
          });
          setForecastDailySeries(nextDaily);
          setForecastCards([
            {
              label: "Expected cash",
              value: formatUsd(expectedUsd),
              valueClass: expectedUsd > 0 ? PERFORMANCE_TEXT_CLASSES.GOOD : "text-slate-900",
              note: `${rangeTitle(forecastRange, forecastCustomStart, forecastCustomEnd)} due window`,
              info: "Money expected from payment-plan students during this selected period.",
            },
            {
              label: "Expected payments",
              value: String(expectedPayments),
              valueClass: expectedPayments > 0 ? "text-blue-600" : "text-slate-900",
              note: "Remaining installments due in range",
              info: "How many payment-plan charges are expected during this selected period.",
            },
          ]);
        }
      } catch (err) {
        if (!cancelled) {
          setForecastCards([]);
          setForecastDailySeries([]);
          setForecastError(err?.message || "Failed to load payment plan forecast");
        }
      } finally {
        if (!cancelled) setForecastLoading(false);
      }
    }

    loadForecastData();
    return () => { cancelled = true; };
  }, [forecastRange, forecastCustomStart, forecastCustomEnd]);

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] font-semibold text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-2 flex flex-col gap-3">
          <RevenueSnapshotPanel
            cards={revenueCards}
            loading={revenueLoading}
            snapshotGoal={snapshotGoalUsd}
            range={snapshotRange}
            setRange={setSnapshotRange}
            customStart={snapshotCustomStart}
            setCustomStart={setSnapshotCustomStart}
            customEnd={snapshotCustomEnd}
            setCustomEnd={setSnapshotCustomEnd}
          />
          <RefundsPanel
            cards={riskCards}
            loading={riskLoading}
            error={riskError}
            range={riskRange}
            setRange={setRiskRange}
            customStart={riskCustomStart}
            setCustomStart={setRiskCustomStart}
            customEnd={riskCustomEnd}
            setCustomEnd={setRiskCustomEnd}
          />
        </div>
        <div className="col-span-4 flex flex-col gap-3">
          <IncomeMixPanel
            unifiedMix={incomeMixUnified}
            range={range}
            setRange={setRange}
            incomeMixMonth={incomeMixMonth}
            setIncomeMixMonth={setIncomeMixMonth}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
            loading={mixLoading}
            error={mixError}
          />
          <RevenueMixPanel
            rows={productRows}
            loading={productLoading}
            error={productError}
            statusFilter={productStatusFilter}
            setStatusFilter={setProductStatusFilter}
            dateFilter={productDateFilter}
            setDateFilter={setProductDateFilter}
            customStart={productCustomStart}
            setCustomStart={setProductCustomStart}
            customEnd={productCustomEnd}
            setCustomEnd={setProductCustomEnd}
          />
          <DailySalesTrend
            data={dailySales}
            stats={dailyStats}
            loading={dailyLoading}
            monthlyGoal={monthlyRevenueGoal}
            error={dailyError}
            range={dailyRange}
            setRange={setDailyRange}
            customStart={dailyCustomStart}
            setCustomStart={setDailyCustomStart}
            customEnd={dailyCustomEnd}
            setCustomEnd={setDailyCustomEnd}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-3">
          <PaymentPlanForecastPanel
            cards={forecastCards}
            dailySeries={forecastDailySeries}
            loading={forecastLoading}
            error={forecastError}
            range={forecastRange}
            setRange={setForecastRange}
            customStart={forecastCustomStart}
            setCustomStart={setForecastCustomStart}
            customEnd={forecastCustomEnd}
            setCustomEnd={setForecastCustomEnd}
          />
        </div>
      </div>
    </div>
  );
}