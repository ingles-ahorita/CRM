/**
 * AOC verification script.
 *
 * Run from the project root:
 *   node scripts/verify-aoc.js              # current month
 *   node scripts/verify-aoc.js --last       # previous month
 *   node scripts/verify-aoc.js --closer=12  # focus on a single closer id
 *
 * What it does
 * ------------
 * 1. Loads offers from `offers` table (price, installments, base/payoff commission).
 * 2. Computes live Inst-#2 completion rate per multipay offer from
 *    `kajabi_purchases` — exactly the same logic as `/multipay-completion`
 *    AND the same logic as `src/lib/aoc.js` (so this is a true mirror test).
 * 3. Prints the static AOC per offer (PIF = payoff_commission;
 *    Multipay = base × (1 + completion_rate_inst_2)).
 * 4. For each closer in the chosen month, fetches outcome_log rows, prints
 *    their sales mix per offer, and computes the weighted-average AOC.
 * 5. Highlights any closer-AOC that looks off so you can dig in.
 *
 * If the numbers here match what the Closer page shows, the implementation
 * is correct. If they differ, the discrepancy is a bug in either the page
 * or the script — and either way you have raw numbers to debug with.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// --- CLI args -----------------------------------------------------------
const argv = process.argv.slice(2);
const useLastMonth = argv.includes("--last");
const focusCloserArg = argv.find((a) => a.startsWith("--closer="));
const focusCloserId = focusCloserArg ? focusCloserArg.split("=")[1] : null;

// --- Supabase client ----------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing Supabase env vars. Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// --- Constants (mirror src/lib/aoc.js) ---------------------------------
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_BETWEEN = 30;
const DEFAULT_RATE = 0.5;

// --- Helpers ------------------------------------------------------------
const fmt = (v, prefix = "$") =>
  v == null || !Number.isFinite(v) ? "—" : `${prefix}${Number(v).toFixed(2)}`;
const pct = (v) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;

function getMonthRange(useLast) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const target = new Date(y, m + (useLast ? -1 : 0), 1);
  const start = new Date(target.getFullYear(), target.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end, label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}` };
}

async function fetchCompletionRates() {
  // Discover multipay offer IDs dynamically from offers table.
  const { data: multipayOffers, error: offersErr } = await supabase
    .from("offers")
    .select("kajabi_id, installments")
    .gt("installments", 0)
    .not("kajabi_id", "is", null);
  if (offersErr) {
    console.error("offers query failed:", offersErr.message);
    return { rates: new Map(), counts: new Map(), trackedIds: [] };
  }
  const trackedIds = (multipayOffers || [])
    .map((o) => String(o.kajabi_id))
    .filter(Boolean);

  const cutoffISO = new Date(Date.now() - DAYS_BETWEEN * MS_PER_DAY).toISOString();
  const { data, error } = await supabase
    .from("kajabi_purchases")
    .select("kajabi_offer_id, multipay_payments_made, created_at_kajabi")
    .in("kajabi_offer_id", trackedIds)
    .lte("created_at_kajabi", cutoffISO)
    .limit(20000);
  if (error) {
    console.error("kajabi_purchases query failed:", error.message);
    return { rates: new Map(), counts: new Map(), trackedIds };
  }
  const buckets = new Map();
  for (const row of data || []) {
    const oid = String(row.kajabi_offer_id);
    if (!buckets.has(oid)) buckets.set(oid, { shouldHavePaid: 0, didPay: 0 });
    const b = buckets.get(oid);
    b.shouldHavePaid += 1;
    const p = Number(row.multipay_payments_made);
    if (Number.isFinite(p) && p >= 2) b.didPay += 1;
  }
  const rates = new Map();
  const counts = new Map();
  for (const [oid, b] of buckets.entries()) {
    counts.set(oid, b);
    if (b.shouldHavePaid > 0) rates.set(oid, b.didPay / b.shouldHavePaid);
  }
  return { rates, counts, trackedIds };
}

function aocForOffer(offer, ratesMap) {
  if (!offer) return null;
  const inst = Number(offer.installments);
  const base = Number(offer.base_commission);
  // PIF: base_commission holds the closer commission (payoff_commission is null).
  if (Number.isFinite(inst) && inst === 0) {
    return Number.isFinite(base) ? base : null;
  }
  if (!Number.isFinite(base)) return null;
  const kid = offer.kajabi_id != null ? String(offer.kajabi_id) : null;
  let r = DEFAULT_RATE;
  if (kid && ratesMap?.has?.(kid)) r = ratesMap.get(kid);
  return base * (1 + r);
}

// --- Main ---------------------------------------------------------------
async function main() {
  const { start, end, label } = getMonthRange(useLastMonth);
  console.log("================================================================");
  console.log(`AOC verification — ${label} ${useLastMonth ? "(last month)" : "(this month)"}`);
  console.log("================================================================\n");

  // 1) Fetch live completion rates
  console.log("[1/4] Live Inst-#2 completion rates from kajabi_purchases:");
  const { rates, counts, trackedIds } = await fetchCompletionRates();
  console.log(
    "  kajabi_offer_id    | shouldHavePaid | didPay | completion%",
  );
  console.log(
    "  -------------------+----------------+--------+-------------",
  );
  for (const oid of trackedIds) {
    const c = counts.get(oid) || { shouldHavePaid: 0, didPay: 0 };
    const r = rates.get(oid);
    console.log(
      `  ${oid.padEnd(18)} | ${String(c.shouldHavePaid).padStart(14)} | ${String(c.didPay).padStart(6)} | ${pct(r).padStart(11)}`,
    );
  }
  console.log();

  // 2) Fetch offers and compute static per-offer AOC
  console.log("[2/4] Per-offer static AOC (this is what every sale is worth):");
  const { data: offers, error: offersErr } = await supabase
    .from("offers")
    .select("id, name, kajabi_id, price, installments, base_commission, payoff_commission")
    .order("price", { ascending: false });
  if (offersErr) {
    console.error("offers query failed:", offersErr.message);
    return;
  }

  const offerById = new Map();
  console.log(
    "  name (kajabi_id)                              | inst | base   | payoff | rate    | AOC",
  );
  console.log(
    "  ---------------------------------------------+------+--------+--------+---------+--------",
  );
  for (const o of offers || []) {
    offerById.set(o.id, o);
    const aoc = aocForOffer(o, rates);
    const kid = o.kajabi_id ? String(o.kajabi_id) : "—";
    const isMultipay = Number(o.installments) > 0;
    const rate = !isMultipay
      ? "n/a"
      : kid !== "—" && rates.has(kid)
        ? pct(rates.get(kid))
        : `${pct(DEFAULT_RATE)} (default)`;
    console.log(
      `  ${(o.name || "(no name)").padEnd(35)} ${kid.padEnd(10)} | ${String(o.installments ?? "—").padStart(4)} | ${fmt(o.base_commission).padStart(6)} | ${fmt(o.payoff_commission).padStart(6)} | ${rate.padStart(7)} | ${fmt(aoc)}`,
    );
  }
  console.log();

  // 3) Fetch outcome_log rows for the month (with closer & offer joins)
  console.log("[3/4] Per-closer sales mix and AOC for the selected month:");
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const { data: rows, error: rowsErr } = await supabase
    .from("outcome_log")
    .select(
      "purchase_date,calls!inner!call_id(closer_id),offers!offer_id(id,name,kajabi_id,installments,base_commission,payoff_commission)",
    )
    .eq("outcome", "yes")
    .gte("purchase_date", startISO)
    .lte("purchase_date", endISO)
    .limit(5000);

  if (rowsErr) {
    console.error("outcome_log query failed:", rowsErr.message);
    return;
  }

  const { data: closers } = await supabase
    .from("closers")
    .select("id, name");
  const closerName = new Map((closers || []).map((c) => [String(c.id), c.name]));

  // Group rows by closer
  const byCloser = new Map();
  for (const r of rows || []) {
    const cid = r?.calls?.closer_id;
    if (!cid) continue;
    const key = String(cid);
    if (!byCloser.has(key)) byCloser.set(key, []);
    byCloser.get(key).push(r);
  }

  for (const [cid, salesRows] of byCloser.entries()) {
    if (focusCloserId && String(focusCloserId) !== cid) continue;
    console.log(
      `\n  ▸ Closer #${cid} — ${closerName.get(cid) || "(unknown)"} — ${salesRows.length} sales`,
    );

    const mix = new Map();
    let aocSum = 0;
    let aocCount = 0;
    for (const r of salesRows) {
      const offer = r?.offers || null;
      const offerName = offer?.name || `offer ${offer?.id}`;
      const aoc = aocForOffer(offer, rates);
      if (!mix.has(offerName))
        mix.set(offerName, { count: 0, aoc, total: 0 });
      const m = mix.get(offerName);
      m.count += 1;
      if (aoc != null && Number.isFinite(aoc)) {
        m.total += aoc;
        aocSum += aoc;
        aocCount += 1;
      }
    }

    console.log("      offer                                 | sales | per-sale AOC | subtotal");
    console.log("      --------------------------------------+-------+--------------+----------");
    for (const [name, m] of mix.entries()) {
      console.log(
        `      ${name.padEnd(38)} | ${String(m.count).padStart(5)} | ${fmt(m.aoc).padStart(12)} | ${fmt(m.total).padStart(8)}`,
      );
    }
    const closerAoc = aocCount > 0 ? aocSum / aocCount : null;
    console.log(
      `      → Closer AOC = Σ${fmt(aocSum)} / ${aocCount} sales = ${fmt(closerAoc)}`,
    );
  }

  // 4) Sanity hint
  console.log("\n[4/4] Sanity hints:");
  console.log("  • PIF main expected ≈ $225 (whatever your offers.payoff_commission is for PIF).");
  console.log("  • 4×$449 expected ≈ base × (1 + rate) — e.g. 90 × 1.614 ≈ $145.26 if rate=61.4%.");
  console.log("  • 7×$299 expected ≈ 75 × (1 + rate) — e.g. 75 × 1.557 ≈ $116.78 if rate=55.7%.");
  console.log("  • If a closer's AOC looks too low, check their sales mix above");
  console.log("    (lots of low-base offers like 7×$199 → $40 base → AOC near $40-$80).");
  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
