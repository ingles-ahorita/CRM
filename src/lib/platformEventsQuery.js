/**
 * Client-side reads for platform_events (notifications tab).
 * Uses the same Supabase client as the rest of the CRM — no Express API required.
 */
import { supabase } from "./supabaseClient";
import {
  resolvePlatformEventsRange,
  applyTopicFilter,
  applyLiveViewFilter,
} from "../../lib/platformEvents.js";

const SELECT_COLS =
  "id, occurred_at, event_type, category, severity, priority, summary, actor_type, actor_display, source, lead_id, call_id, lead_name, lead_email, metadata";

function isMissingTableError(error) {
  const code = error?.code;
  const msg = error?.message || "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /platform_events/i.test(msg) && /does not exist|schema cache/i.test(msg)
  );
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
    if (parsed?.occurred_at && parsed?.id) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function encodeCursor(row) {
  const json = JSON.stringify({ occurred_at: row.occurred_at, id: row.id });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} since ISO timestamp
 */
export async function fetchPlatformEventsUnreadCount(since) {
  const { count, error } = await supabase
    .from("platform_events")
    .select("id", { count: "exact", head: true })
    .gt("occurred_at", since);

  if (error) {
    if (isMissingTableError(error)) {
      return { unread_count: 0, table_missing: true };
    }
    throw error;
  }
  return { unread_count: count ?? 0, table_missing: false };
}

/**
 * @param {object} params
 * @param {string} params.range
 * @param {string} [params.from]
 * @param {string} [params.to]
 * @param {'live'|'all'} params.view
 * @param {string} params.topic
 * @param {string} [params.source]
 * @param {string} [params.q]
 * @param {string} [params.cursor]
 * @param {number} [params.limit]
 */
export async function fetchPlatformEventsList({
  range = "today",
  from,
  to,
  view = "live",
  topic = "all",
  source = "",
  q = "",
  cursor = null,
  limit = 50,
}) {
  const effectiveRange =
    range === "custom" && (!from || !to) ? "today" : range;
  const { fromIso, toIso, label } = resolvePlatformEventsRange(
    effectiveRange,
    from,
    to,
  );

  const pageSize = Math.min(Math.max(limit, 1), 100);
  const cursorRow = decodeCursor(cursor);

  let query = supabase
    .from("platform_events")
    .select(SELECT_COLS)
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .order("occurred_at", { ascending: false })
    .limit(pageSize + 1);

  if (view === "live") {
    query = applyLiveViewFilter(query);
  }

  query = applyTopicFilter(query, topic);

  if (source) {
    query = query.eq("source", source);
  }

  const search = (q || "").trim();
  if (search) {
    const escaped = search.replace(/[%_]/g, "\\$&");
    query = query.or(
      `summary.ilike.%${escaped}%,lead_name.ilike.%${escaped}%,lead_email.ilike.%${escaped}%`,
    );
  }

  if (cursorRow?.occurred_at && cursorRow?.id) {
    query = query.or(
      `occurred_at.lt.${cursorRow.occurred_at},and(occurred_at.eq.${cursorRow.occurred_at},id.lt.${cursorRow.id})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return {
        items: [],
        next_cursor: null,
        period: { start: fromIso, end: toIso, label },
        table_missing: true,
      };
    }
    throw error;
  }

  const rows = data || [];
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const next_cursor =
    hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;

  return {
    items,
    next_cursor,
    period: { start: fromIso, end: toIso, label },
    table_missing: false,
  };
}
