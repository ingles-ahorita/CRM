import { useCallback, useEffect, useRef, useState } from "react";
import { loadWatchList, WATCH_WINDOW_DAYS } from "../utils/watchList";

/**
 * Watch List data hook. Drives both the tab body (uses `data`) and the tab
 * badge (uses `count`) — same loader, so the number always matches the page.
 *
 * @param {{ days?: number, pollMs?: number }} opts
 *   pollMs > 0 → refresh on an interval (used by the always-mounted badge).
 */
export function useWatchList({ days = WATCH_WINDOW_DAYS, pollMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result = await loadWatchList(days);
      if (mounted.current) {
        setData(result);
        setErrorMsg("");
      }
    } catch (e) {
      if (mounted.current) {
        setData(null);
        setErrorMsg(e?.message || "Failed to load watch list");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    refresh();
    const id = pollMs ? setInterval(refresh, pollMs) : null;
    return () => {
      mounted.current = false;
      if (id) clearInterval(id);
    };
  }, [refresh, pollMs]);

  return { data, count: data?.badgeCount ?? null, loading, errorMsg, refresh };
}