# Notifications / Activity Feed — Design Spec

**Date:** 2026-05-19  
**Route:** `/management?tab=notifications`  
**Status:** Approved for planning (flat list v1; lead grouping deferred to v2)

---

## Goal

Add a **Notifications** tab to Management Dashboard 2 that serves:

1. **Live ops** — what happened today (bookings, confirms, sales, errors).
2. **Forensics** — who changed what, with expandable detail and search.

One backend source (`platform_events`), one UI tab, two **view presets** (Live / All) plus filters.

---

## Non-goals (v1)

- Group-by-lead collapsed stacks (v2).
- Per-user read/unread state.
- Realtime Supabase subscription (optional v2).
- Charts or analytics on the feed.
- Raw webhook JSON in the list (metadata drill-down only).

---

## Architecture

```
[ CRM UI | API handlers | Postgres triggers ]
                    ↓
            logPlatformEvent()  (+ dedupe)
                    ↓
            platform_events (append-only)
                    ↓
    GET /api/platform-events?range&view&topic&...
                    ↓
         NotificationsTab (Management 2)
```

**Single read source:** the Notifications tab only queries `platform_events` (plus optional one-time backfill), never federated unions across domain tables in production.

---

## Database: `platform_events`

### Columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `occurred_at` | `timestamptz` | UTC; display via `DateHelpers.DEFAULT_TIMEZONE` |
| `event_type` | `text` | e.g. `call.confirmed`, `kajabi.purchase` |
| `category` | `text` | `booking` \| `sale` \| `team` \| `system` \| `error` |
| `severity` | `text` | `info` \| `warning` \| `error` |
| `priority` | `smallint` | 0–3; Live preset uses `>= 2` |
| `summary` | `text` | Human-readable one-liner (required) |
| `actor_type` | `text` | `user` \| `webhook` \| `system` \| `sync` |
| `actor_id` | `text` nullable | CRM user id when known |
| `actor_display` | `text` nullable | Denormalized name |
| `entity_type` | `text` nullable | `call` \| `lead` \| `purchase` \| … |
| `entity_id` | `text` nullable | |
| `lead_id` | `uuid` nullable | For search / deep links |
| `call_id` | `uuid` nullable | |
| `lead_name` | `text` nullable | Snapshot at write time |
| `lead_email` | `text` nullable | |
| `source` | `text` | `crm` \| `calendly` \| `kajabi` \| `sync` |
| `dedupe_key` | `text` nullable | Unique per logical event window |
| `metadata` | `jsonb` | Structured; see below |
| `created_at` | `timestamptz` | Insert time |

### Indexes

- `(occurred_at DESC, id DESC)` — feed pagination
- `(dedupe_key)` UNIQUE WHERE `dedupe_key IS NOT NULL` — idempotency
- `(severity, occurred_at DESC)` WHERE `severity = 'error'` — tab badge query
- `(lead_id, occurred_at DESC)` — v2 grouping / lead drill-down
- GIN or trigram on `summary`, `lead_name`, `lead_email` if search is slow (add when needed)

### RLS

- **SELECT:** admin role only (match other management APIs).
- **INSERT:** service role + triggers; optional policy for authenticated admins on explicit UI logging.

### `metadata` shape

```json
{
  "changes": [{ "field": "confirmed", "old": false, "new": true }],
  "amount_cents": 99700,
  "offer_name": "PIF",
  "webhook_id": "uuid",
  "href": "/management?tab=leads"
}
```

Templates on the server build `summary`; UI does not parse webhook payloads for the list.

### Dedupe

- Same `dedupe_key` → skip insert (or upsert within 60s window).
- Examples:
  - `kajabi:purchase:{transaction_id}`
  - `calendly:{invitee_uri}:{event}`
  - `call:update:{call_id}:{field}:{new}` (debounce rapid toggles in trigger)

Avoid double logging: for a given action, use **either** an explicit `logPlatformEvent` **or** a trigger, not both.

---

## Event taxonomy

### Phase 1 (instrument + show)

| `event_type` | `category` | `priority` | Live? |
|--------------|------------|------------|-------|
| `booking.created` | booking | 2 | yes |
| `booking.canceled` | booking | 2 | yes |
| `booking.no_show` | booking | 2 | yes |
| `call.created` | booking | 2 | yes |
| `call.confirmed` | booking | 2 | yes |
| `call.status_changed` | booking | 2 | yes (only `showed_up`, `purchased`, `cancelled`) |
| `outcome.recorded` | sale | 3 | yes |
| `lead.transferred` | team | 2 | yes |
| `kajabi.purchase` | sale | 3 | yes |
| `kajabi.sync` | system | 1 | no (All only) |
| `lead.kajabi_linked` | system | 2 | yes |
| `integration.error` | error | 3 | yes |

### Phase 2 (History / All preset)

| `event_type` | `category` | `priority` |
|--------------|------------|------------|
| `note.updated` | system | 0 |
| `call.field_changed` | booking | 1 |
| `offer.updated` | system | 0 |
| `schedule.updated` | team | 1 |
| `shift.started` / `shift.ended` | team | 1 |
| `user.admin` | system | 0 |

### Priority rules

| priority | Meaning | Live preset |
|----------|---------|-------------|
| 3 | Purchase, outcome, error | included |
| 2 | Confirm, transfer, booking lifecycle | included |
| 1 | Secondary field changes, sync | excluded |
| 0 | Verbose admin | excluded |

---

## Instrumentation

### Order of implementation

1. Migration + `lib/platformEvents.js` helper (service role).
2. API handlers: Calendly, Kajabi webhook, `sync-kajabi`.
3. Postgres triggers: `outcome_log` INSERT, `transfer_log` INSERT, `calls` INSERT/UPDATE (watched columns only).
4. Frontend: pass `actor_id` / `actor_display` where session exists; rely on triggers for `calls` otherwise (`actor_type: system`).

### Existing tables to leverage

- `transfer_log` — trigger mirrors to `platform_events` (or single write path).
- `webhook_inbounds` / `calendly_webhook_logs` — log summarized event after processing, not raw payload in `summary`.
- `function_errors` — trigger or insert hook → `integration.error`.

### Backfill (optional, one-off)

Script: last 30 days from `transfer_log` + recent webhook rows → `platform_events` with `source: backfill`, `actor_type: system`.

---

## API

### `GET /api/platform-events`

**Auth:** admin only.

**Query params:**

| Param | Values | Notes |
|-------|--------|-------|
| `range` | `today`, `last7`, `last30`, `custom` | Bounds in `DEFAULT_TIMEZONE` |
| `from`, `to` | ISO date | Required when `range=custom` |
| `view` | `live`, `all` | See presets below |
| `topic` | `all`, `bookings`, `sales`, `team`, `errors`, `sync` | Maps to `category` / types |
| `source` | `calendly`, `kajabi`, `crm`, `sync` | Optional |
| `q` | string | ILIKE on summary, lead_name, lead_email |
| `cursor` | opaque | `(occurred_at, id)` |
| `limit` | default 50, max 100 | |

**Presets (server-side):**

- `view=live`: `priority >= 2` AND default range `today` or `last7` if client omits range.
- `view=all`: no priority filter; full time range.

**Response:**

```json
{
  "items": [{ "id", "occurred_at", "event_type", "category", "severity", "priority", "summary", "actor_display", "source", "lead_id", "call_id", "lead_name", "metadata" }],
  "next_cursor": "...",
  "period": { "start", "end", "label" }
}
```

### Badge endpoint (optional)

`GET /api/platform-events/badge` → `{ "error_count_24h": N }` for main tab pill.

---

## UI — Management 2

### Routing

- Add `notifications` to `validTabs` in `Management2.jsx`.
- Add tab label **Notifications** in `tabs/index.jsx`.
- Badge: errors in last 24h only (red pill, same language as Leads bell badge).

### Layout (match Leads / Organic)

Outer shell:

```
rounded-2xl border border-slate-200 bg-white p-4 shadow-sm
```

Title: `Activity` — `text-[28px] font-bold text-[#0f172a]`

Filter bar: clone `OrganicFiltersBar` pattern:

```
rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]
flex flex-wrap items-center gap-2
```

**Row controls:**

1. **Time** — `SegmentedTabs size="sm" fit`: Today | 7d | 30d | Custom (+ date inputs).
2. **View** — `SegmentedTabs`: Live | All.
3. **Topic** — `SegmentedTabs`: All | Bookings | Sales | Team | Errors | Sync.
4. **Search** — single input, Lucide `Search`, debounced 300ms.
5. **Period label** — right-aligned, `Calendar` icon + range text (Organic style).

Optional **source** `<select>` when `view=all` only.

List area: optional dashed inner container (`border-dashed border-slate-300/80 bg-slate-50/50`) like Leads.

### Timeline row

| Zone | Content | Classes |
|------|---------|---------|
| Left | 8px dot or 14px icon by `category` | Colors from `performanceBenchmarks` |
| Center | `summary` | `text-[13px] font-semibold text-slate-800` |
| Subline | `{actor_display} · {source}` | `text-[11px] font-medium text-slate-500` |
| Right | relative time | `text-[11px] tabular-nums text-slate-500` |
| Error row | left border | `border-l-2 border-red-500 bg-red-50/40` |

**Expand (click):** inline accordion below row — `metadata.changes`, link “Open in Leads” using `href` or `call_id`/`lead_id`.

**Hover:** reuse `usePanelCursorTooltip` for absolute timestamp + full summary if truncated.

**Pagination:** “Load more” button (cursor), not infinite scroll in v1.

**Loading / empty:** Leads-style shimmer rows; dashed empty state copy.

### URL state

```
/management?tab=notifications&range=last7&view=live&topic=all&q=
```

Sync filter state with `useSearchParams` (same as `tab=`).

### Category colors

| category | Accent |
|----------|--------|
| booking | indigo / `#2563eb` |
| sale | `PERFORMANCE_COLORS.GREAT` |
| team | slate-600 |
| system | slate-400 |
| error | red-500 |

---

## Filtering summary

| Layer | Control | URL key |
|-------|---------|---------|
| Time | SegmentedTabs + custom dates | `range`, `from`, `to` |
| View | Live / All | `view` |
| Topic | chips | `topic` |
| Source | select (All view only) | `source` |
| Search | text input | `q` |

**v2:** `group=lead` collapsed stacks; actor filter; realtime prepend.

---

## Phased delivery

| Phase | Scope |
|-------|--------|
| **1** | Table, helper, webhooks, `outcome_log`/`transfer_log` triggers, API, tab UI (flat list), Live/All + time + topic + search |
| **2** | `calls` trigger, Phase 2 event types, source filter, expand diff, badge endpoint |
| **3** | Backfill script, optional realtime, group-by-lead (v2 UI) |

---

## Decisions log

| Decision | Choice |
|----------|--------|
| Primary audience | Live ops + forensics (C) |
| Data source | Dedicated `platform_events` |
| List layout v1 | Flat timeline (B) — no group-by-lead |
| Tab badge | Errors last 24h only |
| Theming | Match Leads shell + Organic filter bar + SegmentedTabs |

---

## Open questions (none blocking v1)

- Move sensitive UI writes to API routes for reliable `actor_id` (can follow triggers in v1).
- Trigram index for search — add if query > 200ms.
