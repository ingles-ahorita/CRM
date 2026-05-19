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

function normalizeMonthlyRevenueGoalUsd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

export async function updateMonthlyRevenueGoalUsd(value) {
  const monthlyRevenueGoal = normalizeMonthlyRevenueGoalUsd(value);
  if (!monthlyRevenueGoal) {
    throw new Error("Revenue goal must be a positive dollar amount");
  }

  const { data, error } = await supabase
    .from("app_settings")
    .update({
      value: monthlyRevenueGoal,
      updated_at: new Date().toISOString(),
    })
    .eq("key", MONTHLY_REVENUE_GOAL_KEY)
    .select("value")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Revenue goal setting was not updated");

  const saved = normalizeMonthlyRevenueGoalUsd(data?.value);
  if (!saved) throw new Error("Saved revenue goal was invalid");
  return saved;
}

export function useRevenueGoal() {
  const [monthlyRevenueGoal, setMonthlyRevenueGoal] = useState(
    DEFAULT_MONTHLY_REVENUE_GOAL_USD,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function saveMonthlyRevenueGoal(value) {
    setSaving(true);
    setError(null);

    try {
      const saved = await updateMonthlyRevenueGoalUsd(value);
      setMonthlyRevenueGoal(saved);
      return saved;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return {
    monthlyRevenueGoal,
    loading,
    saving,
    error,
    saveMonthlyRevenueGoal,
  };
}
