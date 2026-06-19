import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ICLOSED_POTENTIAL_LEADS_TAB_STATUSES } from "../../lib/iclosedLeadStatus.js";
import { computePotentialLeadsBadgeStats } from "../lib/potentialLeadsBadgeStats.js";

const TAB_STATUS_LIST = [...ICLOSED_POTENTIAL_LEADS_TAB_STATUSES];

/**
 * Potential Leads tab badge — contacted / received.
 *
 * Fetches the same rows the page does (same statuses, ordering and 500-row cap)
 * and runs the same shared computation, so the badge mirrors the page's
 * "Received" and "Contacted" KPI cards exactly.
 */
export function usePotentialLeadsBadge() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const leadsRes = await supabase
        .from("potential_leads")
        .select("*")
        .in("iclosed_status", TAB_STATUS_LIST)
        .order("created_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (leadsRes.error) {
        console.error("[usePotentialLeadsBadge]", leadsRes.error);
        setStats({ contacted: 0, received: 0 });
        return;
      }

      setStats(computePotentialLeadsBadgeStats(leadsRes.data || []));
    }

    load();

    const channel = supabase
      .channel("mgmt2_potential_leads_badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "potential_leads" },
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