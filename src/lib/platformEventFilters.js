import { resolvePlatformEventsRange } from "../../lib/platformEvents.js";

/** Returns true if a platform_events row matches current Activity tab filters. */
export function eventMatchesActivityFilters(row, params) {
  if (!row?.occurred_at) return false;

  const range = params.range || "last7";
  const from = params.from;
  const to = params.to;
  const view = params.view === "live" ? "live" : "all";
  const topic = params.topic || "all";
  const source = params.source || "";
  const q = (params.q || "").trim().toLowerCase();

  const { fromIso, toIso } = resolvePlatformEventsRange(
    range === "custom" && (!from || !to) ? "last7" : range,
    from,
    to,
  );
  const at = row.occurred_at;
  if (at < fromIso || at > toIso) return false;

  if (view === "live" && (row.priority ?? 0) < 2) return false;

  if (topic === "bookings" && row.category !== "booking") return false;
  if (topic === "sales" && row.category !== "sale") return false;
  if (topic === "team" && row.category !== "team") return false;
  if (topic === "errors" && row.severity !== "error") return false;
  if (topic === "sync") {
    const ok =
      row.source === "sync" ||
      row.event_type === "kajabi.sync" ||
      row.event_type === "kajabi.purchase" ||
      row.event_type === "kajabi.transaction" ||
      row.event_type === "kajabi.refund";
    if (!ok) return false;
  }

  if (source && row.source !== source) return false;

  if (q) {
    const hay = [row.summary, row.lead_name, row.lead_email, row.actor_display]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}
