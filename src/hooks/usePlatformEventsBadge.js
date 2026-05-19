import { useCallback, useEffect, useState } from "react";
import { fetchPlatformEventsUnreadCount } from "../lib/platformEventsQuery";

export const NOTIFICATIONS_LAST_SEEN_KEY = "mgmt_notifications_last_seen_at";

export function getNotificationsLastSeen() {
  try {
    return localStorage.getItem(NOTIFICATIONS_LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function markNotificationsSeen() {
  try {
    localStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/**
 * Unread count = platform events after last-seen timestamp.
 * @param {{ enabled?: boolean, pollMs?: number }} opts
 */
export function usePlatformEventsBadge({ enabled = true, pollMs = 60_000 } = {}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const since =
      getNotificationsLastSeen() ||
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const { unread_count } = await fetchPlatformEventsUnreadCount(since);
      setUnreadCount(Number(unread_count) || 0);
    } catch {
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled || !pollMs) return undefined;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [enabled, pollMs, refresh]);

  return { unreadCount, loading, refresh };
}
