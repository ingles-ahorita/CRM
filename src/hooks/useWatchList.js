import { useCallback, useEffect, useRef, useState } from "react";
import { loadWatchList, WATCH_WINDOW_DAYS } from "../utils/watchList";

/**
 * Watch List data hook. Drives both the tab body (uses `data`) and the tab
 * badge (uses `count`) — same loader, so the number always matches the page.
 *
 * @param {{ days?: number, range?: {startISO: string, endISO: string}|null, pollMs?: number }} opts
 *   range → explicit window (overrides `days`); pollMs > 0 → refresh on an
 *   interval (used by the always-mounted badge).
 */
export function useWatchList({ days = WATCH_WINDOW_DAYS, range = null, pollMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const mounted = useRef(true);

  const startISO = range?.startISO ?? null;
  const endISO = range?.endISO ?? null;

  const refresh = useCallback(async () => {
    try {
      const arg = startISO && endISO ? { startISO, endISO } : days;
      const result = await loadWatchList(arg);
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
  }, [days, startISO, endISO]);

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
