# CLAUDE.md — Inglés Ahorita CRM

## What this project is

A sales CRM + commission management system for **Inglés Ahorita**, a Spanish-language English teaching business. The CRM tracks:
- **Setters** — book appointments, tracked by show-ups and purchases
- **Closers** — run sales calls, tracked by outcomes, commissions, refunds
- **Leads** — potential students going through the sales funnel
- Integration with **Kajabi** (the course/membership platform where students enroll)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, React Router v7, Tailwind CSS |
| Backend | Express (Node.js), `server.js` on port 3000 |
| Database | Supabase (PostgreSQL) |
| Charts | Recharts |
| Dates/TZ | date-fns + date-fns-tz |
| External | Kajabi API, Calendly webhooks, Google Analytics, ManyChat |

**Dev:** `npm run dev:all` — starts both Vite (port 5173) and Express API (port 3000). Vite proxies `/api/*` to the Express server.

---

## Project structure

```
src/
  pages/          — React page components (one file per route)
  components/     — Shared components (AdminSidebar, Modal, etc.)
  lib/            — Business logic (commissions, Kajabi API client)
  utils/          — Helpers (dateHelpers, supabaseClient)
  hooks/          — Custom React hooks

lib/api-handlers/ — Express route handlers (Vercel-style: export default handler)
server.js         — Express server, registers all API routes with lazy loading
supabase/         — Migrations, config
```

---

## Routing

All routes are in `src/App.jsx`. Admin-only pages use `<ProtectedRoute>`. Navigation is in `src/components/AdminSidebar.jsx` (only visible to `role === 'admin'`).

**To add a new page:**
1. Create `src/pages/MyPage.jsx`
2. Add `<Route path="/my-path" element={<ProtectedRoute><MyPage /></ProtectedRoute>} />` in `App.jsx`
3. Optionally add to `menuItems` array in `AdminSidebar.jsx`

**To add a new API endpoint:**
1. Create `lib/api-handlers/my-handler.js` with `export default async function handler(req, res) {}`
2. Declare the variable and load it in `loadHandlers()` in `server.js`
3. Register the route: `app.get/post('/api/my-route', async (req, res) => { ... })`

---

## Key files

| File | Purpose |
|---|---|
| `src/lib/closerCommission.js` | Closer commission calculation — sale month vs payoff month logic |
| `src/lib/setterCommission.js` | Setter commission — $4/show-up, $25/purchase |
| `src/lib/kajabiApi.js` | Kajabi REST API client (frontend, calls via `/api/kajabi-token`) |
| `lib/api-handlers/kajabi-token.js` | Server-side Kajabi OAuth token (client_credentials) |
| `lib/api-handlers/sync-kajabi.js` | Syncs Kajabi purchases + transactions into local DB tables |
| `lib/api-handlers/kajabi-webhook.js` | Receives Kajabi `purchase.created` webhooks |
| `src/utils/dateHelpers.js` | Timezone-aware date helpers — always use these for month ranges |

---

## Database — key tables

| Table | Description |
|---|---|
| `leads` | One row per potential student. `customer_id` = Kajabi member ID |
| `calls` | One row per booked call. Links setter, closer, lead |
| `outcome_log` | One row per call outcome. Stores sale/refund data, `kajabi_purchase_id`, `kajabi_payoff_id`, commissions |
| `offers` | Commission offer structure. `kajabi_id` links to Kajabi offer ID. Has `price`, `base_commission`, `payoff_commission` |
| `closers` / `setters` | Sales team members |
| `kajabi_purchases` | **Mirror of Kajabi purchases** — synced via `/api/sync-kajabi` |
| `kajabi_transactions` | **Mirror of Kajabi transactions** — actual amounts paid, linked to purchases |
| `webhook_inbounds` | Raw Kajabi webhook payloads (stored as text JSON) |

### Kajabi mirror tables (added 2026-04)

`kajabi_purchases`: `kajabi_purchase_id` (PK-like, UNIQUE), `kajabi_customer_id`, `kajabi_offer_id`, `payment_type`, `amount_in_cents`, `coupon_code`, `deactivated_at`, `multipay_payments_made`, `status`, `created_at_kajabi`

`kajabi_transactions`: `kajabi_transaction_id` (UNIQUE), `kajabi_purchase_id` (FK → kajabi_purchases, nullable), `action` (charge/refund), `amount_in_cents`, `currency`, `created_at_kajabi`

FK: `kajabi_transactions.kajabi_purchase_id → kajabi_purchases.kajabi_purchase_id ON DELETE SET NULL`

---

## Kajabi integration

### Authentication
- Server-side only: `KAJABI_CLIENT_ID` + `KAJABI_CLIENT_SECRET` → OAuth client_credentials
- Frontend calls `/api/kajabi-token`, which returns a short-lived bearer token
- API base: `https://api.kajabi.com/v1` — JSON:API format

### Webhook payload (`purchase.created`)
Key fields in `payload.payload`:
- `member_id` / `member_email` / `member_name`
- `offer_id`, `offer_type` (`"one-time"` or `"payment plan"`)
- `transaction_id` — the Kajabi transaction ID
- `subscription_id` — the Kajabi purchase ID (for payment plans)
- `amount_paid` / `subtotal` / `discount_amount` (all in cents)
- `coupon_code`, `total_payment_count`

### Purchases API
- Relationships include: `customer`, `offer`, `transactions[]`, `products[]`
- Attributes: `amount_in_cents`, `payment_type`, `multipay_payments_made`, `coupon_code`, `deactivated_at`, `created_at`
- **No `status` field** — infer from `deactivated_at` presence

### Transactions API
- Attributes: `action` (charge/refund), `amount_in_cents`, `currency`, `created_at`
- Relationships: `customer`, `offer` — **does NOT have a `purchase` relationship**
- Link transaction → purchase only via the purchase's `relationships.transactions.data[]`

### Orphan transactions (important!)
Recurring monthly payments for payment plans create transactions in month N that belong to a purchase created in month 1. These are "orphans" when syncing month N alone. The sync handler resolves them by matching `offer_id + customer_id` against the local DB.

---

## Revenue calculation

**Gross Revenue = sum of `amount_in_cents` for `action = 'charge'` transactions** — this matches Kajabi's dashboard gross revenue figure. Amounts are already post-discount (i.e., `amount_paid` from the webhook).

Refunds have `action = 'refund'` (or negative `amount_in_cents`).

Net Revenue = Gross − Refunds.

The `/revenue` page (`src/pages/RevenueOverviewPage.jsx`) shows this. It is not linked in the sidebar (intentionally hidden from the menu) — access directly via `/revenue`.

---

## Commission calculation rules

### Closers
- **Sale month** (`purchase_date`): `adjusted_base = base_commission − (base_commission × discount%)`
- **Payoff month** (`payoff_date`): `payoff_increment = payoff_commission − adjusted_base` (only when `kajabi_payoff_id` is set)
- Refunds: same-month refunds claw back the base; cross-month refunds tracked separately
- Source: `src/lib/closerCommission.js`

### Setters
- $4 per show-up (`showed_up = true`)
- $25 per purchase (`outcome = 'yes'`) in the calendar month
- Source: `src/lib/setterCommission.js`

---

## Timezone

**`DateHelpers.DEFAULT_TIMEZONE`** — always use this for any date comparisons or month range calculations. Never use raw UTC month boundaries. See `src/utils/dateHelpers.js`.

---

## Env vars

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     — used in server-side handlers for DB writes
KAJABI_CLIENT_ID
KAJABI_CLIENT_SECRET
VITE_KAJABI_SITE_ID           — default: 2147813413
```

---

## Common patterns

### Supabase query (frontend)
```js
import { supabase } from '../lib/supabaseClient';
const { data, error } = await supabase.from('table').select('col1, col2').eq('field', value);
```

### Supabase query (server-side handler)
```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);
```

### Page skeleton
```jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as DateHelpers from '../utils/dateHelpers';

export default function MyPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const ym = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
    return ym?.monthKey ?? `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  });
  // ...
}
```
