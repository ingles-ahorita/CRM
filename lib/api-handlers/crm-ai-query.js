import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import {
  getStatsData,
  getCloserCommissionBreakdown,
  getAllSettersMonthlyCommission,
} from '../metrics-server.js';

const MODEL = 'gpt-4o';
const MAX_TOOL_ITERATIONS = 10;

// Service-role client — used by execute_query and get_revenue
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function monthToRange(month) {
  const [year, monthNum] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNum - 1, 1)).toISOString(),
    end:   new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)).toISOString(),
  };
}

// ── Tool implementations ──────────────────────────────────────────────────────

/** Revenue — mirrors RevenueOverviewPage.jsx calculation exactly */
async function toolGetRevenue({ month, from, to }) {
  let start, end;
  if (month) {
    const r = monthToRange(month);
    start = r.start; end = r.end;
  } else if (from && to) {
    start = new Date(from).toISOString();
    end   = new Date(to).toISOString();
  } else {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    start = new Date(Date.UTC(y, m, 1)).toISOString();
    end   = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)).toISOString();
  }

  const { data: txData, error: txErr } = await supabase
    .from('kajabi_transactions')
    .select('kajabi_transaction_id, kajabi_purchase_id, kajabi_offer_id, action, state, amount_in_cents, created_at_kajabi')
    .gte('created_at_kajabi', start)
    .lte('created_at_kajabi', end);
  if (txErr) throw new Error(`DB error: ${txErr.message}`);
  if (!txData || txData.length === 0) return { period: month ?? `${from} to ${to}`, transactions: 0, gross_revenue: '$0.00', refunds: '$0.00', net_revenue: '$0.00', note: 'No transactions found. Data may need syncing from Kajabi.' };

  const offerIds = [...new Set(txData.map(t => t.kajabi_offer_id).filter(Boolean))];
  const { data: offerData } = offerIds.length > 0
    ? await supabase.from('offers').select('kajabi_id, name').in('kajabi_id', offerIds)
    : { data: [] };
  const offerByKajabiId = {};
  for (const o of offerData ?? []) offerByKajabiId[String(o.kajabi_id)] = o.name;

  let grossCents = 0, refundCents = 0, chargeCount = 0, refundCount = 0, failedCount = 0;
  const byOffer = {};
  for (const t of txData) {
    const action    = t.action ?? (t.amount_in_cents >= 0 ? 'charge' : 'refund');
    const isRefund  = action === 'refund' || t.amount_in_cents < 0;
    const isDispute = action === 'dispute';
    const isFailed  = isDispute || (t.state != null && !['paid','successful','success','complete','completed','succeeded'].includes(t.state.toLowerCase()));
    if (isFailed) { failedCount++; continue; }
    const offerName = offerByKajabiId[String(t.kajabi_offer_id)] ?? (t.kajabi_offer_id ? `Offer ${t.kajabi_offer_id}` : 'Unknown');
    if (!byOffer[offerName]) byOffer[offerName] = { charge_cents: 0, refund_cents: 0, count: 0 };
    if (isRefund) { const a = Math.abs(t.amount_in_cents ?? 0); refundCents += a; refundCount++; byOffer[offerName].refund_cents += a; }
    else          { const a = Math.abs(t.amount_in_cents ?? 0); grossCents += a; chargeCount++; byOffer[offerName].charge_cents += a; byOffer[offerName].count++; }
  }
  const fmt = c => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return {
    period: month ?? `${from} to ${to}`,
    transactions: chargeCount, refund_transactions: refundCount, failed_excluded: failedCount,
    gross_revenue: fmt(grossCents), refunds: fmt(refundCents), net_revenue: fmt(grossCents - refundCents),
    by_offer: Object.entries(byOffer)
      .map(([name, v]) => ({ offer: name, charges: v.count, gross: fmt(v.charge_cents), refunds: fmt(v.refund_cents), net: fmt(v.charge_cents - v.refund_cents) }))
      .sort((a, b) => (byOffer[b.offer]?.charge_cents ?? 0) - (byOffer[a.offer]?.charge_cents ?? 0)),
  };
}

/** Funnel headline metrics — from fetchStatsData in generalStats.jsx */
async function toolGetFunnelStats({ from, to }) {
  const data = await getStatsData(from, to);
  return { period: { from, to }, ...data.funnel };
}

/** Per-closer breakdown — from fetchStatsData in generalStats.jsx */
async function toolGetCloserStats({ from, to }) {
  const data = await getStatsData(from, to);
  return { period: { from, to }, closers: data.closers };
}

/** Per-setter breakdown — from fetchStatsData in generalStats.jsx */
async function toolGetSetterStats({ from, to }) {
  const data = await getStatsData(from, to);
  return { period: { from, to }, setters: data.setters };
}

/** Ads vs organic and ad-medium breakdown — from fetchStatsData in generalStats.jsx */
async function toolGetSourceStats({ from, to }) {
  const data = await getStatsData(from, to);
  return { period: { from, to }, source: data.source, medium: data.medium };
}

/** Country breakdown — from fetchStatsData in generalStats.jsx */
async function toolGetCountryStats({ from, to }) {
  const data = await getStatsData(from, to);
  return { period: { from, to }, countries: data.countries };
}

/** Closer commission — mirrors getCloserCommissionBreakdown in closerCommission.js */
async function toolGetCloserCommission({ closer_name, closer_id, month }) {
  let id = closer_id;
  if (!id && closer_name) {
    const { data } = await supabase.from('closers').select('id, name').ilike('name', `%${closer_name}%`).limit(5);
    if (!data || data.length === 0) return { error: `No closer found matching "${closer_name}"` };
    if (data.length > 1) return { error: `Multiple closers match "${closer_name}"`, matches: data.map(c => c.name) };
    id = data[0].id;
  }
  if (!id) return { error: 'Provide closer_name or closer_id' };
  const result = await getCloserCommissionBreakdown(id, month);
  const { data: closerRow } = await supabase.from('closers').select('name').eq('id', id).single();
  return { closer: closerRow?.name ?? id, month, ...result };
}

/** Setter commission — mirrors getAllSettersMonthlyCommission in setterCommission.js */
async function toolGetSetterCommission({ month }) {
  const rows = await getAllSettersMonthlyCommission(month);
  return {
    month,
    show_up_rate_per_show_up: `$${4}`,
    purchase_rate_per_purchase: `$${25}`,
    setters: rows,
  };
}

/** Raw SELECT query — read-only enforcement is non-negotiable */
async function toolExecuteQuery({ sql }) {
  const normalized = sql.trim().replace(/\s+/g, ' ');
  if (!/^SELECT\b/i.test(normalized)) {
    return { error: 'Only SELECT queries are allowed. The query was rejected because it does not start with SELECT.' };
  }
  // Block any statement terminators that could chain a write
  if (/;\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)/i.test(normalized)) {
    return { error: 'Query rejected: contains a disallowed write statement after a semicolon.' };
  }
  try {
    const { data, error } = await supabase.rpc('execute_sql', { query: normalized });
    if (error) throw error;
    return { rows: data, row_count: Array.isArray(data) ? data.length : null };
  } catch (err) {
    return { error: `Query failed: ${err.message}`, sql };
  }
}

// ── OpenAI tool definitions ───────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_revenue',
      description: 'Get Kajabi transaction revenue (gross, refunds, net) for a period. Returns per-offer breakdown. Use for any question about money collected, revenue, sales amounts, or refund amounts. Data comes from kajabi_transactions table — must be synced first.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'YYYY-MM — use for single-month queries.' },
          from:  { type: 'string', description: 'ISO date e.g. "2026-01-01" — use with "to" for ranges.' },
          to:    { type: 'string', description: 'ISO date e.g. "2026-03-31" — use with "from".' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_funnel_stats',
      description: 'Get CRM sales funnel headline metrics for a date range: bookings made, pick-up rate, confirmation rate, show-up rate, conversion rate, DQ rate, PIF %, downsell %, total purchased, total showed up. Data comes from calls and outcome_log tables filtered by call_date and purchase_date respectively.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date ISO e.g. "2026-03-01"' },
          to:   { type: 'string', description: 'End date ISO e.g. "2026-03-31"' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_closer_stats',
      description: 'Get per-closer performance breakdown: show-ups, purchases, conversion rate, PIF count, dont_qualify count, DQ rate. Use for questions about individual closer performance or comparing closers.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date ISO e.g. "2026-03-01"' },
          to:   { type: 'string', description: 'End date ISO e.g. "2026-03-31"' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_setter_stats',
      description: 'Get per-setter performance breakdown: bookings made, picked up, pick-up rate, showed up, show-up rate, purchases. Use for questions about setter performance or comparing setters.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date ISO e.g. "2026-03-01"' },
          to:   { type: 'string', description: 'End date ISO e.g. "2026-03-31"' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_source_stats',
      description: 'Get ads vs organic performance breakdown (pick-up rate, show-up rate, confirmation rate, conversion rate, DQ rate) and ad medium breakdown (TikTok, Instagram, other). Use for questions about lead source performance.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date ISO e.g. "2026-03-01"' },
          to:   { type: 'string', description: 'End date ISO e.g. "2026-03-31"' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_country_stats',
      description: 'Get performance breakdown by country: bookings made, show-ups, purchases, pick-up rate, conversion rate. Derived from lead phone numbers.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date ISO e.g. "2026-03-01"' },
          to:   { type: 'string', description: 'End date ISO e.g. "2026-03-31"' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_closer_commission',
      description: 'Get commission breakdown for a specific closer for a calendar month. Returns total commission, base (sale month), payoff increments (when Kajabi payoff completes), second installments (credited month after sale), refunds, and same-month refunds.',
      parameters: {
        type: 'object',
        properties: {
          closer_name: { type: 'string', description: 'Partial or full name of the closer (case-insensitive search).' },
          closer_id:   { type: 'string', description: 'UUID of the closer if known.' },
          month:       { type: 'string', description: 'YYYY-MM e.g. "2026-03"' },
        },
        required: ['month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_setter_commission',
      description: 'Get commission totals for all active setters for a calendar month. Formula: (show-ups × $4) + (purchases × $25). Use for setter payout questions.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'YYYY-MM e.g. "2026-03"' },
        },
        required: ['month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_query',
      description: 'Execute a raw SQL SELECT query against the CRM database. Use ONLY for questions not covered by the predefined tools — raw data exploration, custom aggregations, or ad-hoc lookups. Only SELECT is allowed; any other statement will be rejected. Columns and table names must match the schema exactly.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'A valid SQL SELECT statement.' },
        },
        required: ['sql'],
      },
    },
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `
You are a CRM assistant for Inglés Ahora Academy — a business that sells English courses to Spanish-speaking students. You help sales managers answer questions about revenue, sales performance, and commissions.

Today's date is ${today}.

---

## TOOL ROUTING RULES

1. Use predefined tools (get_revenue, get_funnel_stats, get_closer_stats, get_setter_stats, get_source_stats, get_country_stats, get_closer_commission, get_setter_commission) for ANY question whose answer can be derived from those tools. These tools implement the exact same business logic as the CRM dashboards — their numbers will match what managers see on screen.

2. Use execute_query ONLY for raw data exploration or questions no predefined tool covers (e.g. "show me all leads from Mexico who didn't show up last week", "list refunds with their coupon codes"). Do NOT use execute_query to reimplement what a predefined tool already calculates.

3. Always call a tool before answering a metric question. Never guess or estimate numbers.

4. Answer in the same language the question is asked in (Spanish if asked in Spanish, English if asked in English).

---

## DATABASE SCHEMA

### Table: calls
One row per sales call booked in the CRM.
- id: uuid PK
- name: text — lead's full name
- email: citext
- phone: varchar — lead's phone (used for country detection)
- call_date: timestamptz — scheduled time of the call
- book_date: timestamptz — when the booking was created
- setter_id: uuid FK → setters.id
- closer_id: uuid FK → closers.id
- lead_id: uuid FK → leads.id
- closer_note_id: uuid FK → outcome_log.id — the active closer outcome for this call
- is_reschedule: boolean — true if this is a rescheduled call (deduped in calculations)
- picked_up: boolean — setter called the lead before the call
- confirmed: boolean — lead confirmed attendance
- showed_up: boolean — lead showed up to the sales call
- purchased: boolean — legacy flag; use outcome_log.outcome='yes' for purchases
- cancelled: boolean
- recovered: boolean — a no-show that was re-engaged
- source_type: enum(ads, organic, referral, manual) — how the lead was acquired
- no_show_state: enum(no_show, contacted, rebooked, dead) — state after a no-show
- utm_medium, utm_source, utm_campaign, utm_content: text — attribution parameters
- calendly_id: text — Calendly event UUID
- is_reschedule: boolean

### Table: outcome_log
One row per call outcome logged by a closer. Multiple rows per call are possible; the active one is referenced by calls.closer_note_id.
- id: uuid PK
- call_id: uuid FK → calls.id
- closer_id: uuid FK → closers.id
- setter_id: uuid FK → setters.id
- offer_id: uuid FK → offers.id
- outcome: enum(yes, no, lock_in, follow_up, refund, dont_qualify)
  - yes = sold
  - no = didn't buy
  - lock_in = lead is interested, follow-up scheduled
  - follow_up = needs more follow-up
  - refund = was sold but refunded
  - dont_qualify = lead doesn't qualify for the program
- purchase_date: timestamptz — when the sale happened
- refund_date: date — when the refund was processed
- payoff_date: timestamptz — when the Kajabi payoff (final payment) completed
- second_installment_pay_date: timestamptz — override date for crediting 2nd installment commission
- discount: smallint — discount % applied to the offer price
- commission: real — base commission amount stored (may be negative for clawbacks)
- PIF: boolean — Pay In Full (customer paid entire amount upfront, no installments)
- paid_second_installment: boolean — customer has completed their second installment
- clawback: smallint — % of commission clawed back on refund (100 = full clawback)
- kajabi_purchase_id: text FK-like → kajabi_purchases.kajabi_purchase_id
- kajabi_payoff_id: text — the Kajabi purchase ID of the payoff transaction
- no_outcome_category: text — reason subcategory when outcome is 'no'
- notes, objection, budget_max, prepared_score, prepared_reason: text/int — call notes

### Table: leads
One row per potential student.
- id: uuid PK
- name, email, email2, phone: text
- source: enum — acquisition source
- medium: text — ad medium (tiktok, instagram, etc.)
- customer_id: text — Kajabi member ID (set when they purchase)
- mc_id: numeric — ManyChat user ID
- contact_id: text — external contact reference

### Table: closers
Sales team members who run calls.
- id: uuid PK
- name, email, phone: text
- active: boolean — false if the closer is no longer working
- timezone: text

### Table: setters
Team members who book appointments (SDRs).
- id: uuid PK
- name, email, phone: text
- active: boolean

### Table: offers
Products / pricing tiers sold.
- id: uuid PK
- name: text
- price: numeric — full offer price in USD
- installments: smallint — number of payment installments (0 = PIF/pay-in-full)
- active: boolean
- base_commission: numeric — closer commission for the sale month
- payoff_commission: numeric — total closer commission once payoff is complete
- weekly_classes: smallint — classes per week (NULL for non-subscription offers; non-NULL = downsell)
- kajabi_id: text — links to the Kajabi offer
- is_subscription: boolean

### Table: kajabi_purchases
Mirror of Kajabi purchases synced via /api/sync-kajabi.
- kajabi_purchase_id: text UNIQUE — Kajabi's purchase ID
- kajabi_customer_id: text
- kajabi_offer_id: text FK-like → offers.kajabi_id
- payment_type: text (one-time, multipay, etc.)
- amount_in_cents: integer
- coupon_code: text
- status: text — inferred from deactivated_at presence
- deactivated_at: timestamptz — set when purchase is cancelled/refunded
- multipay_payments_made: integer
- created_at_kajabi: timestamptz

### Table: kajabi_transactions
Actual cash events (charges and refunds) synced from Kajabi.
- kajabi_transaction_id: text UNIQUE
- kajabi_purchase_id: text FK → kajabi_purchases.kajabi_purchase_id (nullable for orphan recurring payments)
- kajabi_offer_id: text
- kajabi_customer_id: text
- action: text — "charge" or "refund"
- state: text — "paid", "successful", "success", "complete", "completed", "succeeded" are successful; anything else is failed/disputed
- amount_in_cents: integer — positive for charges, negative for refunds
- currency: text (default USD)
- created_at_kajabi: timestamptz — when the transaction occurred in Kajabi
- raw: jsonb — full raw payload from Kajabi API

### Foreign key relationships
- calls.setter_id → setters.id
- calls.closer_id → closers.id
- calls.lead_id → leads.id
- calls.closer_note_id → outcome_log.id
- outcome_log.call_id → calls.id (constraint: closer_notes_call_id_fkey)
- outcome_log.closer_id → closers.id
- outcome_log.setter_id → setters.id
- outcome_log.offer_id → offers.id
- kajabi_transactions.kajabi_purchase_id → kajabi_purchases.kajabi_purchase_id

---

## KEY BUSINESS LOGIC

### Funnel metrics (from get_funnel_stats)
- Pick-up rate = leads picked up / bookings made in period (book_date range)
- Confirmation rate = leads confirmed / bookings made in period
- Show-up rate = showed up / calls that already happened (call_date ≤ now)
- Conversion rate = purchased / showed up
- DQ rate = didn't qualify / leads picked up (from book_date cohort)
- Rescheduled calls are deduped: if a lead has a reschedule, only the reschedule row counts

### Revenue (from get_revenue)
- Gross revenue = sum of charge transactions (action='charge', state in success values)
- Refunds = sum of refund transactions (action='refund')
- Net revenue = gross − refunds
- Failed/disputed transactions are excluded
- Orphan transactions = recurring subscription payments without a purchase link

### Commission — closers (from get_closer_commission)
- Sale month: adjusted_base = base_commission − (base_commission × discount%)
- Payoff month: increment = payoff_commission − adjusted_base (when kajabi_payoff_id is set and payoff_date is in the month)
- Second installment: credited in the month AFTER the sale (or on second_installment_pay_date if set)
- Refunds: same-month refunds claw back the base; cross-month refunds are tracked as negative commission

### Commission — setters (from get_setter_commission)
- $4 per show-up (showed_up = true, call_date in month)
- $25 per purchase (outcome = 'yes', purchase_date in month)

### PIF vs installments
- offer.installments = 0 → Pay In Full (PIF) — customer paid everything upfront
- offer.installments > 0 → payment plan
- offer.weekly_classes NOT NULL → downsell (a smaller offer with fewer classes/week)
`.trim();
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────
async function runTool(name, args) {
  switch (name) {
    case 'get_revenue':           return toolGetRevenue(args);
    case 'get_funnel_stats':      return toolGetFunnelStats(args);
    case 'get_closer_stats':      return toolGetCloserStats(args);
    case 'get_setter_stats':      return toolGetSetterStats(args);
    case 'get_source_stats':      return toolGetSourceStats(args);
    case 'get_country_stats':     return toolGetCountryStats(args);
    case 'get_closer_commission': return toolGetCloserCommission(args);
    case 'get_setter_commission': return toolGetSetterCommission(args);
    case 'execute_query':         return toolExecuteQuery(args);
    default: return { error: `Unknown tool: ${name}` };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body ?? {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY environment variable is not set' });

  const openai = new OpenAI({ apiKey });

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: question.trim() },
  ];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await openai.chat.completions.create({
        model: MODEL,
        tools: TOOLS,
        messages,
      });

      const choice = response.choices[0];
      messages.push(choice.message);

      if (choice.finish_reason === 'stop') {
        return res.json({ answer: choice.message.content ?? 'No response returned.' });
      }

      if (choice.finish_reason === 'tool_calls') {
        for (const toolCall of choice.message.tool_calls) {
          let result;
          try {
            const args = JSON.parse(toolCall.function.arguments);
            result = await runTool(toolCall.function.name, args);
          } catch (err) {
            result = { error: err.message };
          }
          messages.push({
            role:         'tool',
            tool_call_id: toolCall.id,
            content:      JSON.stringify(result),
          });
        }
        continue;
      }

      break;
    }

    return res.json({ answer: 'Could not complete the request within the iteration limit.' });
  } catch (err) {
    console.error('crm-ai-query error:', err);
    return res.status(500).json({ error: err.message });
  }
}
