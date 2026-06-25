/**
 * GET /api/payment-plan-forecast?start=<ISO>&end=<ISO>
 *  → { byDay: { "YYYY-MM-DD": { amount, paymentCount } }, expectedUsd, expectedPayments }
 *
 * Estimate of installment cash from active Kajabi payment plans due in [start, end].
 *
 * Why this lives server-side (it used to be computed in the browser off kajabi_purchases):
 *   The mirror table is only refreshed when a purchase's *creation month* is re-synced,
 *   so `deactivated_at` and `multipay_payments_made` go stale and the old client-side
 *   number was badly inflated (e.g. $37,968 vs Kajabi's ~$23k). This handler pulls the
 *   CURRENT state of every purchase live from Kajabi (which only the server can do — the
 *   Kajabi creds are server-only), then applies two corrections:
 *     1. Freshness  — use live `deactivated_at` + live `multipay_payments_made`.
 *     2. Delinquency — drop plans that are behind their own schedule (a plan that has
 *        made fewer payments than it should have by now is failing/paused and Kajabi
 *        no longer forecasts it).
 *   This is an ESTIMATE — Kajabi's exact forecast is not exposed by any API. It lands
 *   close to Kajabi's figure (calibrated to ~$22.5k vs Kajabi $23.4k for the sample month).
 */
import { createClient } from '@supabase/supabase-js';

const KAJABI_BASE = 'https://api.kajabi.com/v1';
const KAJABI_SITE_ID = process.env.VITE_KAJABI_SITE_ID || '2147813413';
const PAGE_SIZE = 50;

// How many full billing cycles behind schedule a plan may be before we stop forecasting
// it. 0 = must be fully caught up (matches Kajabi most closely / conservative). Bump to 1
// to also include plans one cycle behind (looser, larger total).
const DELINQUENCY_GRACE_CYCLES = 0;

// Offers we may not have in the DB (mirrors the frontend fallback table).
const KAJABI_OFFER_FALLBACKS = {
  '2150879491': { name: 'Premium - FULL', price: 1997, installments: 0 },
  '2150879483': { name: 'VIP - FULL', price: 3497, installments: 0 },
  '2150879484': { name: 'VIP - 4 x $949', price: 949, installments: 4 },
  '2150879490': { name: 'VIP - 7 x $597', price: 597, installments: 7 },
  '2150879492': { name: 'Premium - 4 x $549', price: 549, installments: 4 },
  '2150879493': { name: 'Premium - 7 x $349', price: 349, installments: 7 },
  '2150879495': { name: 'Student - FULL', price: 897, installments: 0 },
  '2150879496': { name: 'Student - 3 x $349', price: 349, installments: 3 },
  '2150523894': { name: 'Lock-in', price: 100, installments: 0 },
  '2150799973': { name: 'Payoff', price: 0, installments: 0 },
  '2150991083': { name: 'Student - 5 x $199', price: 199, installments: 5 },
  '2150961576': { name: '2. 3 x $600 ($500)', price: 500, installments: 3 },
  '2150763469': { name: '2. 4 x $549 ($449)', price: 975, installments: 4 },
  '2150757348': { name: '3. 7 x $399 ($299)', price: 623, installments: 7 },
  '2151122152': { name: '3. 6 x $349', price: 349, installments: 6 },
  '2150757309': { name: '1. $1997 USD ($1497)', price: 1497, installments: 0 },
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or key');
  return createClient(url, key);
}

// ── Kajabi auth (same client_credentials flow as sync-kajabi.js) ──────────────
let _tokenCache = { token: null, expiresAt: 0 };
async function getKajabiToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.token;
  const clientId = process.env.KAJABI_CLIENT_ID;
  const clientSecret = process.env.KAJABI_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing KAJABI_CLIENT_ID or KAJABI_CLIENT_SECRET');
  const r = await fetch(`${KAJABI_BASE}/oauth/token`, {
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
    throw new Error(`Kajabi ${r.status} on /${path.split('?')[0]}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

// ── Live purchases (current state) — cached briefly so range changes don't re-list ──
let _purchasesCache = { rows: null, expiresAt: 0 };
const PURCHASES_TTL_MS = 5 * 60 * 1000;

async function fetchAllPurchasesLive() {
  if (_purchasesCache.rows && Date.now() < _purchasesCache.expiresAt) return _purchasesCache.rows;
  const rows = [];
  let page = 1;
  // Sorted newest-first; stop when a page is short. Hard cap as a runaway guard.
  for (; page <= 60; page++) {
    const params = new URLSearchParams({
      'page[number]': String(page),
      'page[size]': String(PAGE_SIZE),
      'filter[site_id]': KAJABI_SITE_ID,
      sort: '-created_at',
    });
    const json = await kajabiFetch(`purchases?${params}`);
    const data = json.data || [];
    for (const p of data) {
      const a = p.attributes || {};
      rows.push({
        offerId: p.relationships?.offer?.data?.id != null ? String(p.relationships.offer.data.id) : 'unknown',
        payment_type: a.payment_type || '',
        amount_in_cents: a.amount_in_cents,
        created_at: a.created_at,
        deactivated_at: a.deactivated_at,
        multipay_payments_made: a.multipay_payments_made,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  _purchasesCache = { rows, expiresAt: Date.now() + PURCHASES_TTL_MS };
  return rows;
}

// Same month-stepping as the frontend (UTC, clamps to month end).
function addMonthsClamped(date, monthsToAdd) {
  const source = new Date(date);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + monthsToAdd, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

// Installments whose due date is on/before `nowMs` — how many a current plan should have paid.
function expectedPaidByNow(created, totalInstallments, nowMs) {
  let expected = 0;
  for (let i = 1; i <= totalInstallments; i++) {
    if (addMonthsClamped(created, i - 1).getTime() <= nowMs) expected++;
    else break;
  }
  return expected;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const start = req.query?.start;
  const end = req.query?.end;
  const startDate = start ? new Date(String(start)) : null;
  const endDate = end ? new Date(String(end)) : null;
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Provide valid ?start and ?end ISO timestamps' });
  }
  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  try {
    const supabase = getSupabase();
    const [offersResult, purchases] = await Promise.all([
      supabase.from('offers').select('kajabi_id, name, price, installments'),
      fetchAllPurchasesLive(),
    ]);
    if (offersResult.error) throw offersResult.error;

    const offersById = {};
    for (const offer of offersResult.data || []) {
      if (offer?.kajabi_id != null) offersById[String(offer.kajabi_id)] = offer;
    }

    const nowMs = Date.now();
    const byDay = {};
    let expectedUsd = 0;
    let expectedPayments = 0;

    for (const purchase of purchases) {
      // 1. Freshness: skip plans Kajabi has deactivated/cancelled.
      if (purchase.deactivated_at) continue;

      const paymentType = String(purchase.payment_type || '').toLowerCase();
      const offerId = String(purchase.offerId || 'unknown');
      const offer = offersById[offerId] || KAJABI_OFFER_FALLBACKS[offerId] || null;
      const totalInstallments = Number(offer?.installments) || 0;
      const isPaymentPlan =
        paymentType.includes('multipay') ||
        paymentType.includes('payment plan') ||
        totalInstallments > 1;
      if (!isPaymentPlan || totalInstallments <= 1 || !purchase.created_at) continue;

      const madeRaw = Number(purchase.multipay_payments_made);
      const made = Number.isFinite(madeRaw) && madeRaw > 0 ? madeRaw : 1;
      const remaining = totalInstallments - made;
      if (remaining <= 0) continue;

      const created = new Date(purchase.created_at);

      // 2. Delinquency: a plan behind its own schedule is failing/paused — Kajabi drops it.
      const expected = expectedPaidByNow(created, totalInstallments, nowMs);
      if (made < expected - DELINQUENCY_GRACE_CYCLES) continue;

      const purchaseAmountUsd =
        Number(purchase.amount_in_cents) > 0 ? Number(purchase.amount_in_cents) / 100 : null;
      const fallbackAmountUsd = Number(offer?.price) > 0 ? Number(offer.price) : 0;
      const perInstallmentUsd = purchaseAmountUsd ?? fallbackAmountUsd;
      if (perInstallmentUsd <= 0) continue;

      for (let n = made + 1; n <= totalInstallments; n++) {
        const dueISO = addMonthsClamped(created, n - 1).toISOString();
        if (dueISO < startISO || dueISO > endISO) continue;
        const dayKey = dueISO.slice(0, 10);
        const bucket = byDay[dayKey] || (byDay[dayKey] = { amount: 0, paymentCount: 0 });
        bucket.amount += perInstallmentUsd;
        bucket.paymentCount += 1;
        expectedUsd += perInstallmentUsd;
        expectedPayments += 1;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ byDay, expectedUsd, expectedPayments });
  } catch (err) {
    console.error('payment-plan-forecast error:', err);
    return res.status(502).json({ error: err.message || 'Failed to build payment plan forecast' });
  }
}
