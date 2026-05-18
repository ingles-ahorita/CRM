import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getDayBoundsLocal } from "../utils/dateHelpers";

/**
 * Calls booked today (`book_date` in local calendar day) vs how many are confirmed.
 * Matches Leads stats: confirmed = not cancelled and `confirmed === true`.
 */
export function useTodayNewLeadsCount() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { dayStart, dayEnd } = getDayBoundsLocal(new Date());
      const from = dayStart.toISOString();
      const to = dayEnd.toISOString();

      const [bookedRes, confirmedRes] = await Promise.all([
        supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .gte("book_date", from)
          .lte("book_date", to),
        supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .gte("book_date", from)
          .lte("book_date", to)
          .eq("confirmed", true)
          .or("cancelled.is.null,cancelled.eq.false"),
      ]);

      if (cancelled) return;

      if (bookedRes.error || confirmedRes.error) {
        console.error("[useTodayNewLeadsCount]", bookedRes.error || confirmedRes.error);
        setStats({ booked: 0, confirmed: 0 });
        return;
      }

      setStats({
        booked: typeof bookedRes.count === "number" ? bookedRes.count : 0,
        confirmed: typeof confirmedRes.count === "number" ? confirmedRes.count : 0,
      });
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

  return stats;
}
