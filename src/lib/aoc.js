/**
 * Average Offer Commission (AOC).
 *
 * Per-offer AOC is computed using historical installment-completion data.
 * Closer-level AOC is the weighted average of per-offer AOCs across the
 * closer's actual sales mix (Σ offer_aoc / sales_count).
 *
 * FORMULA
 * -------
 *   PIF (installments = 0):
 *     AOC = base_commission
 *     (NOTE: For PIF offers in this DB, the closer's commission is stored
 *      in `base_commission`. `payoff_commission` is NULL for PIFs — that
 *      column is only populated for multipay offers as the "Early Payoff
 *      BONUS" amount.)
 *
 *   Multipay (installments > 0):
 *     AOC = base_commission × (1 + completionRate_inst_2)
 *
 *   where `completionRate_inst_2` is the fraction (0..1) of customers
 *   whose installment #2 was due AND who actually paid it. This is the
 *   same "Completion %" shown on `/multipay-completion`.
 *
 * EXAMPLES (from PM)
 * ------------------
 *   PIF main                         → base_commission ($225)
 *   4×$449 (base $90, comp 61.4%)    → 90 × 1.614 = $145.26
 *   7×$299 (base $75, comp 55.7%)    → 75 × 1.557 = $116.78
 *
 * CLOSER-LEVEL ROLLUP
 * -------------------
 *   closer_aoc = Σ(offer_aoc per sale) / total_sales
 *
 * RATES SOURCE
 * ------------
 * Rates are computed at runtime from the local `kajabi_purchases` mirror
 * (synced from Kajabi via `/api/sync-kajabi`). Logic mirrors the
 * `/multipay-completion` page so values stay consistent.
 *
 * The set of multipay offers is derived dynamically from the `offers`
 * table (any offer with `installments > 0` AND a `kajabi_id`).
 *
 * If no purchase data is available for an offer (brand new, sync not run,
 * etc.) we fall back to `DEFAULT_COMPLETION_RATE_INST_2`.
 */

import { supabase } from "./supabaseClient";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_BETWEEN_INSTALLMENTS = 30;

// Fallback rate when an offer has no historical purchases (or DB query fails).
// Neutral 50% — the closer page will still produce a number, but it will
// improve as soon as Kajabi sync populates real data.
export const DEFAULT_COMPLETION_RATE_INST_2 = 0.5;

/**
 * Fetch installment-#2 completion rates for every multipay offer the
 * system knows about, using the local `kajabi_purchases` mirror.
 *
 * Logic mirrors `/multipay-completion`:
 *   shouldHavePaid = purchases created at least 30 days ago
 *   didPay         = those whose `multipay_payments_made >= 2`
 *   rate           = didPay / shouldHavePaid
 *
 * Returns a Map keyed by `kajabi_offer_id` (string) → rate in [0, 1].
 * Offers absent from the map have no historical data yet.
 */
export async function fetchCompletionRatesInst2() {
  const result = new Map();

  try {
    // 1) Discover the multipay offer IDs we care about (any offer in our DB
    //    with installments > 0 AND a kajabi_id).
    const { data: multipayOffers, error: offersErr } = await supabase
      .from("offers")
      .select("kajabi_id, installments")
      .gt("installments", 0)
      .not("kajabi_id", "is", null);

    if (offersErr) {
      console.warn(
        "[aoc] offers query for multipay IDs failed:",
        offersErr.message,
      );
      return result;
    }

    const multipayIds = (multipayOffers || [])
      .map((o) => (o?.kajabi_id != null ? String(o.kajabi_id) : null))
      .filter(Boolean);

    if (multipayIds.length === 0) return result;

    // 2) Fetch purchases for those offers, created at least 30 days ago.
    const cutoffISO = new Date(
      Date.now() - DAYS_BETWEEN_INSTALLMENTS * MS_PER_DAY,
    ).toISOString();

    const pageSize = 1000;
    const maxRows = 20000;
    const all = [];
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { data, error } = await supabase
        .from("kajabi_purchases")
        .select("kajabi_offer_id, multipay_payments_made, created_at_kajabi")
        .in("kajabi_offer_id", multipayIds)
        .lte("created_at_kajabi", cutoffISO)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.warn(
          "[aoc] kajabi_purchases query failed:",
          error.message,
        );
        break;
      }

      const batch = data || [];
      all.push(...batch);
      if (batch.length < pageSize) break;
    }

    // 3) Group by offer and compute completion rate.
    const buckets = new Map();
    for (const row of all) {
      const oid = row?.kajabi_offer_id != null ? String(row.kajabi_offer_id) : null;
      if (!oid) continue;
      if (!buckets.has(oid)) buckets.set(oid, { shouldHavePaid: 0, didPay: 0 });
      const b = buckets.get(oid);
      b.shouldHavePaid += 1;
      const paid = Number(row?.multipay_payments_made);
      if (Number.isFinite(paid) && paid >= 2) b.didPay += 1;
    }

    for (const [oid, b] of buckets.entries()) {
      if (b.shouldHavePaid > 0) {
        result.set(oid, b.didPay / b.shouldHavePaid);
      }
    }
  } catch (e) {
    console.warn("[aoc] fetchCompletionRatesInst2 failed:", e?.message || e);
  }

  return result;
}

/**
 * Look up the inst-2 completion rate for an offer.
 *
 * @param {object} offer  Must have `kajabi_id`.
 * @param {Map<string, number>|null} ratesMap  Optional rates map
 *   (typically the result of `fetchCompletionRatesInst2()`).
 * @returns {number} rate in [0, 1]
 */
export function getCompletionRateInst2(offer, ratesMap = null) {
  const kid = offer?.kajabi_id != null ? String(offer.kajabi_id) : null;
  if (kid && ratesMap?.has?.(kid)) {
    const v = Number(ratesMap.get(kid));
    if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  }
  return DEFAULT_COMPLETION_RATE_INST_2;
}

/**
 * Compute the static AOC for a single offer.
 *
 * @param {object|null} offer  Offer row with at least:
 *   { installments, base_commission, payoff_commission, kajabi_id? }
 * @param {Map<string, number>|null} ratesMap  Optional pre-fetched
 *   completion-rate map (`kajabi_offer_id` → rate). When omitted, uses
 *   `DEFAULT_COMPLETION_RATE_INST_2` for multipay offers.
 * @returns {number|null} AOC in dollars, or null if data is insufficient.
 */
export function aocForOffer(offer, ratesMap = null) {
  if (!offer) return null;

  const inst = Number(offer.installments);
  const base = Number(offer.base_commission);

  // PIF (installments = 0): closer earns the commission stored in
  // `base_commission`. (`payoff_commission` is null for PIFs in this DB.)
  if (Number.isFinite(inst) && inst === 0) {
    return Number.isFinite(base) ? base : null;
  }

  // Multipay: base × (1 + completion_rate_inst_2)
  if (!Number.isFinite(base)) return null;
  const rate = getCompletionRateInst2(offer, ratesMap);
  return base * (1 + rate);
}

/**
 * Reduce an array of sale rows (each with `offers` joined) into a
 * closer-level AOC via weighted average across the closer's sales mix.
 *
 * @param {Array<{offers?: object|null}>} rows  Sale rows for one closer.
 * @param {Map<string, number>|null} ratesMap  Optional rates map.
 * @returns {number|null} weighted-average AOC, or null when no valid rows.
 */
export function closerAocFromRows(rows, ratesMap = null) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const v = aocForOffer(r?.offers, ratesMap);
    if (v == null || !Number.isFinite(v)) continue;
    sum += v;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}
