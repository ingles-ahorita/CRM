import * as DateHelpers from "../../../../utils/dateHelpers";
import { getEffectiveRangeBounds } from "../overview/overview-range-helpers";

// Date-range presets for the Watch List range picker.
export const RANGE_ITEMS = [
  { id: "last10", label: "Last 10 days", title: "Last 10 days" },
  { id: "custom", label: "Custom", title: "Custom date range" },
];

/** Resolve the selected preset (+ custom inputs) into a { startISO, endISO } window. */
export function resolveSelectedRange(range, customStart, customEnd) {
  if (range === "last10") {
    const r = DateHelpers.getLastNDaysRange(10);
    return { startISO: r.startISO, endISO: r.endISO };
  }
  const { start, end } = getEffectiveRangeBounds(range, customStart, customEnd);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}
