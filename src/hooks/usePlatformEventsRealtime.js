import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Subscribe to new platform_events rows (Supabase Realtime).
 * @param {{ enabled?: boolean, onInsert?: (row: object) => void }} options
 */
export function usePlatformEventsRealtime({ enabled = true, onInsert } = {}) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  useEffect(() => {
    if (!enabled) return undefined;

    const channel = supabase
      .channel("platform_events_activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "platform_events",
        },
        (payload) => {
          if (payload?.new) onInsertRef.current?.(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}
