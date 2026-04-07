/**
 * POST /api/sync-kajabi
 * Body: { month: "YYYY-MM" }  OR  { from: "ISO date", to: "ISO date" }
 *
 * Strategy:
 *  1. Fetch all purchases created in the range → upsert kajabi_purchases
 *  2. Fetch all transactions created in the range → upsert kajabi_transactions
 *  3. Build txId→purchaseId map from purchase relationships (covers same-month transactions)
 *  4. For orphan transactions (recurring payments from older purchases), resolve
 *     via offer+customer match against ALL purchases already in the DB
 */

import { createClient } from '@supabase/supabase-js';

const KAJABI_BASE = 'https://api.kajabi.com/v1';
const KAJABI_SITE_ID = process.env.VITE_KAJABI_SITE_ID || '2147813413';
const PAGE_SIZE = 50;

// ── Supabase ──────────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or key');
  return createClient(url, key);
}

// ── Kajabi auth ───────────────────────────────────────────────────────────────
let _tokenCache = { token: null, expiresAt: 0 };

async function getKajabiToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.token;
  const clientId = process.env.KAJABI_CLIENT_ID;
  const clientSecret = process.env.KAJABI_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing KAJABI_CLIENT_ID or KAJABI_CLIENT_SECRET');
  const r = await fetch('https://api.kajabi.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(`Kajabi token error: ${data.error_description || r.status}`);
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 7200) * 1000 };
  return _tokenCache.token;
}

async function kajabiFetch(path) {
  const token = await getKajabiToken();
  const r = await fetch(`${KAJABI_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Kajabi ${r.status} on /${path.split('?')[0]}: ${text.slice(0, 300)}`);
  }
  return r.json();
}

// ── Fetch all purchases in [fromISO, toISO] ───────────────────────────────────
async function fetchAllPurchasesInRange(fromISO, toISO) {
  const fromTs = new Date(fromISO).getTime();
  const toTs   = new Date(toISO).getTime();
  const results = [];
  let page = 1;

  for (;;) {
    const params = new URLSearchParams({
      'page[number]': String(page),
      'page[size]': String(PAGE_SIZE),
      'filter[site_id]': KAJABI_SITE_ID,
      'filter[created_at_gt]': new Date(fromTs - 1).toISOString(),
      'filter[created_at_lt]': new Date(toTs + 1).toISOString(),
      sort: '-created_at',
    });
    const json = await kajabiFetch(`purchases?${params}`);
    const data = json.data || [];
    if (data.length === 0) break;

    for (const p of data) {
      const ts = new Date(p.attributes?.created_at || 0).getTime();
      if (ts >= fromTs && ts <= toTs) results.push(p);
    }

    const lastTs = new Date(data[data.length - 1]?.attributes?.created_at || 0).getTime();
    if (lastTs < fromTs || data.length < PAGE_SIZE) break;
    page++;
  }

  return results;
}

// ── Fetch all transactions in [fromISO, toISO] ────────────────────────────────
// NOTE: The Kajabi transactions endpoint does not support server-side date filters,
// so we paginate sorted by -created_at and stop when we pass the range start.
async function fetchAllTransactionsInRange(fromISO, toISO) {
  const fromTs = new Date(fromISO).getTime();
  const toTs   = new Date(toISO).getTime();
  const results = [];
  let page = 1;

  for (;;) {
    const params = new URLSearchParams({
      'page[number]': String(page),
      'page[size]': String(PAGE_SIZE),
      'filter[site_id]': KAJABI_SITE_ID,
      sort: '-created_at',
      // Request state and action explicitly — Kajabi may omit them without this
      'fields[transactions]': 'action,state,payment_type,amount_in_cents,sales_tax_in_cents,currency,formatted_amount,created_at',
    });
    const json = await kajabiFetch(`transactions?${params}`);
    const data = json.data || [];
    if (data.length === 0) break;

    for (const t of data) {
      const ts = new Date(t.attributes?.created_at || 0).getTime();
      if (ts >= fromTs && ts <= toTs) results.push(t);
    }

    const lastTs = new Date(data[data.length - 1]?.attributes?.created_at || 0).getTime();
    if (lastTs < fromTs || data.length < PAGE_SIZE) break;
    page++;
  }

  return results;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { month, from, to } = req.body || {};

  let fromISO, toISO;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    fromISO = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString();
    toISO   = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
  } else if (from && to) {
    fromISO = new Date(from).toISOString();
    toISO   = new Date(to).toISOString();
  } else {
    return res.status(400).json({ error: 'Provide { month: "YYYY-MM" } or { from, to }' });
  }

  console.log(`[sync-kajabi] Range: ${fromISO} → ${toISO}`);

  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // ── 1. Fetch purchases ──────────────────────────────────────────────────
    console.log('[sync-kajabi] Fetching purchases…');
    const purchases = await fetchAllPurchasesInRange(fromISO, toISO);
    console.log(`[sync-kajabi] ${purchases.length} purchases`);

    // Build txId → purchaseId map from purchase relationships
    // (covers transactions that belong to same-month purchases)
    const txIdToPurchaseId = {};
    for (const p of purchases) {
      const txIds = (p.relationships?.transactions?.data ?? []).map((t) => String(t.id));
      for (const txId of txIds) txIdToPurchaseId[txId] = String(p.id);
    }

    // ── 2. Fetch transactions ───────────────────────────────────────────────
    console.log('[sync-kajabi] Fetching transactions…');
    const transactions = await fetchAllTransactionsInRange(fromISO, toISO);
    console.log(`[sync-kajabi] ${transactions.length} transactions`);

    // Find orphan transactions (recurring payments from older purchases)
    const orphanTxs = transactions.filter((t) => !txIdToPurchaseId[String(t.id)]);
    console.log(`[sync-kajabi] ${orphanTxs.length} orphan transactions (recurring payments from prior months)`);

    // ── 3. Resolve orphans via offer+customer match in existing DB ──────────
    if (orphanTxs.length > 0) {
      // Collect unique offer+customer combos from orphan transactions
      const lookupPairs = [...new Set(
        orphanTxs
          .map((t) => {
            const offerId = t.relationships?.offer?.data?.id;
            const customerId = t.relationships?.customer?.data?.id;
            return offerId && customerId ? `${offerId}|${customerId}` : null;
          })
          .filter(Boolean)
      )];

      if (lookupPairs.length > 0) {
        // For each unique offer+customer, find the most recent matching purchase in DB
        const offerIds    = [...new Set(lookupPairs.map((p) => p.split('|')[0]))];
        const customerIds = [...new Set(lookupPairs.map((p) => p.split('|')[1]))];

        const { data: existingPurchases } = await supabase
          .from('kajabi_purchases')
          .select('kajabi_purchase_id, kajabi_offer_id, kajabi_customer_id')
          .in('kajabi_offer_id', offerIds)
          .in('kajabi_customer_id', customerIds);

        // Build offer+customer → purchaseId map (most recent purchase wins — handled by upsert order)
        const offerCustomerToPurchaseId = {};
        for (const p of existingPurchases || []) {
          const key = `${p.kajabi_offer_id}|${p.kajabi_customer_id}`;
          offerCustomerToPurchaseId[key] = p.kajabi_purchase_id;
        }

        let resolved = 0;
        for (const t of orphanTxs) {
          const offerId    = t.relationships?.offer?.data?.id;
          const customerId = t.relationships?.customer?.data?.id;
          if (!offerId || !customerId) continue;
          const key       = `${offerId}|${customerId}`;
          const purchaseId = offerCustomerToPurchaseId[key];
          if (purchaseId) {
            txIdToPurchaseId[String(t.id)] = purchaseId;
            resolved++;
          }
        }
        console.log(`[sync-kajabi] Resolved ${resolved}/${orphanTxs.length} orphans via offer+customer match`);
      }
    }

    // ── 4. Upsert purchases ─────────────────────────────────────────────────
    if (purchases.length > 0) {
      const purchaseRows = purchases.map((p) => {
        const attrs = p.attributes || {};
        return {
          kajabi_purchase_id:      String(p.id),
          kajabi_customer_id:      p.relationships?.customer?.data?.id != null ? String(p.relationships.customer.data.id) : null,
          kajabi_offer_id:         p.relationships?.offer?.data?.id != null ? String(p.relationships.offer.data.id) : null,
          // attributes
          payment_type:            attrs.payment_type ?? null,
          amount_in_cents:         attrs.amount_in_cents != null ? Number(attrs.amount_in_cents) : null,
          coupon_code:             attrs.coupon_code ?? null,
          deactivated_at:          attrs.deactivated_at ?? null,
          multipay_payments_made:  attrs.multipay_payments_made != null ? Number(attrs.multipay_payments_made) : null,
          // status: use deactivated_at presence as a proxy (API doesn't expose a status field directly)
          status: attrs.deactivated_at ? 'cancelled' : 'active',
          created_at_kajabi:       attrs.created_at ?? null,
          synced_at:               now,
        };
      });

      const { error: purchaseErr } = await supabase
        .from('kajabi_purchases')
        .upsert(purchaseRows, { onConflict: 'kajabi_purchase_id' });

      if (purchaseErr) throw new Error(`Purchase upsert failed: ${purchaseErr.message}`);
    }

    // ── 5. Upsert transactions ──────────────────────────────────────────────
    if (transactions.length > 0) {
      const unresolved = transactions.filter((t) => !txIdToPurchaseId[String(t.id)]).length;
      if (unresolved > 0) {
        console.warn(`[sync-kajabi] ${unresolved} transactions could not be linked to a purchase`);
      }

      // Log first transaction's raw attributes so we can see every field Kajabi returns
      if (transactions.length > 0) {
        console.log('[sync-kajabi] Sample transaction attributes:', JSON.stringify(transactions[0].attributes, null, 2));
        console.log('[sync-kajabi] Sample transaction relationships:', JSON.stringify(transactions[0].relationships, null, 2));
      }

      const txRows = transactions.map((t) => {
        const attrs = t.attributes || {};
        return {
          kajabi_transaction_id: String(t.id),
          kajabi_purchase_id:    txIdToPurchaseId[String(t.id)] ?? null,
          // Store offer + customer directly from transaction relationships
          // so we can show offer names even for orphan transactions
          kajabi_offer_id:       t.relationships?.offer?.data?.id != null ? String(t.relationships.offer.data.id) : null,
          kajabi_customer_id:    t.relationships?.customer?.data?.id != null ? String(t.relationships.customer.data.id) : null,
          action:                attrs.action ?? null,
          state:                 attrs.state ?? null,
          amount_in_cents:       attrs.amount_in_cents != null ? Number(attrs.amount_in_cents) : null,
          currency:              attrs.currency ?? 'USD',
          created_at_kajabi:     attrs.created_at ?? null,
          raw:                   { attributes: t.attributes, relationships: t.relationships },
          synced_at:             now,
        };
      });

      const { error: txErr } = await supabase
        .from('kajabi_transactions')
        .upsert(txRows, { onConflict: 'kajabi_transaction_id' });

      if (txErr) throw new Error(`Transaction upsert failed: ${txErr.message}`);
    }

    console.log(`[sync-kajabi] Done.`);
    return res.status(200).json({
      ok: true,
      range: { from: fromISO, to: toISO },
      purchases_synced:    purchases.length,
      transactions_synced: transactions.length,
      orphans_resolved:    transactions.filter((t) => {
        const id = String(t.id);
        return txIdToPurchaseId[id] && !purchases.find((p) =>
          (p.relationships?.transactions?.data ?? []).some((tx) => String(tx.id) === id)
        );
      }).length,
    });

  } catch (err) {
    console.error('[sync-kajabi] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
