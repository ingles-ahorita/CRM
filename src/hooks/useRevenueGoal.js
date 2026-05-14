import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export const DEFAULT_MONTHLY_REVENUE_GOAL_USD = 55000;
export const MONTHLY_REVENUE_GOAL_KEY = "monthly_revenue_goal_usd";

export async function fetchMonthlyRevenueGoalUsd() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", MONTHLY_REVENUE_GOAL_KEY)
    .maybeSingle();

  if (error) throw error;

  const parsed = Number(data?.value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MONTHLY_REVENUE_GOAL_USD;
}

export function useRevenueGoal() {
  const [monthlyRevenueGoal, setMonthlyRevenueGoal] = useState(
    DEFAULT_MONTHLY_REVENUE_GOAL_USD,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRevenueGoal() {
      setLoading(true);
      setError(null);

      try {
        const value = await fetchMonthlyRevenueGoalUsd();
        if (!cancelled) setMonthlyRevenueGoal(value);
      } catch (err) {
        console.error("[useRevenueGoal] load failed:", err);
        if (!cancelled) {
          setMonthlyRevenueGoal(DEFAULT_MONTHLY_REVENUE_GOAL_USD);
          setError(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRevenueGoal();
    return () => {
      cancelled = true;
    };
  }, []);

  return { monthlyRevenueGoal, loading, error };
}
