import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getDayBoundsLocal } from "../utils/dateHelpers";

/**
 * Count of `calls` whose `call_date` falls on the user's local calendar today.
 * Matches the Management → Leads "Today" sub-tab with default **Call date** mode
 * (see `fetchLeads`: `dateFilterField` defaults to `call_date`).
 *
 * Not the same as counting new rows in the `leads` table (`created_at`).
 */
export function useTodayNewLeadsCount() {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { dayStart, dayEnd } = getDayBoundsLocal(new Date());
      const { count: c, error } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .gte("call_date", dayStart.toISOString())
        .lte("call_date", dayEnd.toISOString());

      if (cancelled) return;
      if (error) {
        console.error("[useTodayNewLeadsCount]", error);
        setCount(0);
        return;
      }
      setCount(typeof c === "number" ? c : 0);
    }

    load();

    const channel = supabase
      .channel("mgmt2_leads_today_badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
