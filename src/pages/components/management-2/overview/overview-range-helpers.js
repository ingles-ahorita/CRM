/**
 * Shared date-range logic for Overview "Performance" style filters:
 * MTD · Last mo · Last wk · Custom (matches management-dashboard).
 */
import { formatInTimeZone } from "date-fns-tz";
import * as DateHelpers from "../../../../utils/dateHelpers";

export const TIME_RANGE_ITEMS = [
  { id: "mtd", label: "MTD", title: "This month (MTD)" },
  { id: "lastMonth", label: "Last mo", title: "Last month" },
  { id: "lastWeek", label: "Last wk", title: "Last week" },
  { id: "custom", label: "Custom", title: "Custom date range" },
];

export function startOfUTCDate(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

export function endOfUTCDate(d) {
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

export function getRangeBounds(range) {
  const now = new Date();
  if (range === "lastWeek") {
    const { weekStart, weekEnd } = DateHelpers.getWeekBoundsForOffset(1);
    return { start: weekStart, end: weekEnd };
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

export function normalizeCustomBounds(startDateText, endDateText) {
  const fallback = getRangeBounds("custom");
  if (!startDateText || !endDateText) return fallback;
  const start = new Date(`${startDateText}T00:00:00.000Z`);
  const end = new Date(`${endDateText}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return fallback;
  if (start > end) return fallback;
  return { start, end };
}

/** Chart/API ranges never extend past today (UTC). */
export function getEffectiveRangeBounds(range, customStart, customEnd) {
  const bounds =
    range === "custom"
      ? normalizeCustomBounds(customStart, customEnd)
      : getRangeBounds(range);
  const todayEnd = endOfUTCDate(new Date());
  if (bounds.end.getTime() > todayEnd.getTime()) {
    return { start: bounds.start, end: todayEnd };
  }
  return bounds;
}

/** YYYY-MM-DD in UTC for `/api/management-series?startDate=&endDate=`. */
export function toManagementSeriesDateParams(start, end) {
  return {
    startDate: formatInTimeZone(start, "UTC", "yyyy-MM-dd"),
    endDate: formatInTimeZone(end, "UTC", "yyyy-MM-dd"),
  };
}
