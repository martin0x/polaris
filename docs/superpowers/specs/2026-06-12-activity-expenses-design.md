# Activity Expenses — Design Spec

**Date:** 2026-06-12
**Author:** Raymart Villos
**Status:** Approved. Replaces the two-column Google Sheet used for in-store
expense capture. Follows the system conventions established by the Engineering
Journal (`2026-04-26-engineering-journal-design.md`).

## Overview

Activity Expenses is a lightweight capture tool for tracking what one activity
costs while it is happening — a grocery run, a night out. You start an
activity, punch in items and prices as you shop, and watch the running total.
Afterward, the trends page shows spend over time grouped by activity type.

It is deliberately **not** a budget tracker. There are no budgets, limits,
accounts, or categories beyond the activity type. The unit of record is the
activity session, and the primary surface is a phone held one-handed in a
store aisle.

Decisions made during brainstorming:

- **Capture happens on a phone browser, in the store.** The capture page is
  mobile-first. In-store use depends on Polaris being reachable from the
  phone (the existing Vercel + Neon deploy plan).
- **Activity types are a fixed-but-adjustable list** managed on a settings
  page, prepopulated with common types — a deliberate brake on type
  proliferation.
- **Trends = spend over time by type + summary stats per type.** No per-item
  price history; item names stay freeform text.
- **Currency is the Philippine peso**, display-only (`₱1,234.50`). No
  conversion, no multi-currency.
- **Capture is optimistic with background sync.** Items appear instantly;
  sync retries quietly through dead zones.
- **Trends render with Recharts** (chosen over a hand-rolled SVG chart after
  a side-by-side comparison), re-themed with design tokens.

## Scope

### In scope for v1

- Start an activity with one tap from a button-per-type start screen;
  optional freeform title (e.g. "SM North run").
- Mobile-first capture page: bottom-pinned composer, Enter-driven
  name → price → next-item flow, sticky running total, inline edit and
  delete of items.
- Optimistic add queue with localStorage mirror, idempotent sync via
  client-generated item ids, retry with backoff, "n unsynced" indicator.
- Activity history list with type, date, item count, and total.
- Trends page: Recharts grouped bar chart of monthly totals per type
  (3/6/12-month range toggle) plus per-type stat cards (this month, last
  month, average per activity, activity count).
- Types settings page: add, rename, reorder, archive. Seeded with
  Groceries, Dining out, Night out, Shopping, Transport, Errands.
- Feedback integration: `activity_started`, `items_per_activity`, and
  `activity_total_centavos` metrics via the platform `feedback` API.
- Manifest `palette` block so the Global Command Palette can surface
  "start a …" commands and recent activities when it ships.

### Explicitly out of scope for v1

- Budgets, limits, alerts, or any judgment about spending.
- Per-item price history and item-name normalization or autocomplete.
- Multi-currency, currency conversion, or currency settings.
- Receipts, photos, barcode scanning, voice input.
- PWA installability / service-worker offline (the localStorage queue is
  the v1 resilience story; a hard refresh while offline mid-session is
  survivable, but full offline-first is not attempted).
- Splitting activities, shared expenses, or multi-user anything.
- Editing or deleting activity types' historical effects — archiving a
  type only hides it from the start screen; history and trends keep it.
- Aggregations beyond monthly-totals-by-type.
- Export (the data is one SQL query away; build it when needed).

## 1. Data model

Three new tables, prefixed `expense_` per the system-table convention.
Money is always an **integer count of centavos** — never a float.

### `ExpenseActivityType`

```prisma
model ExpenseActivityType {
  id         String    @id @default(cuid())
  name       String    @unique
  position   Int       @default(0)
  archived   Boolean   @default(false)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  activities ExpenseActivity[]

  @@index([archived])
  @@map("expense_activity_types")
}
```

Seeded (via the migration) with: Groceries, Dining out, Night out, Shopping,
Transport, Errands — `position` in that order.

### `ExpenseActivity`

```prisma
model ExpenseActivity {
  id        String   @id @default(cuid())
  typeId    String
  type      ExpenseActivityType @relation(fields: [typeId], references: [id])
  title     String?
  startedAt DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  items     ExpenseItem[]

  @@index([typeId])
  @@index([startedAt(sort: Desc)])
  @@map("expense_activities")
}
```

An activity has no open/closed state in v1 — it is just a dated session you
add items to. `startedAt` drives all time bucketing. Totals are computed
(`SUM(items.amountCentavos)`), never stored.

### `ExpenseItem`

```prisma
model ExpenseItem {
  id             String   @id
  activityId     String
  activity       ExpenseActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  name           String
  amountCentavos Int
  position       Int
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([activityId])
  @@map("expense_items")
}
```

`id` is **client-generated** (`crypto.randomUUID()` in the browser — no new
dependency) — this is what makes the
sync queue idempotent: retrying a `PUT` of the same item can never duplicate
it. `position` is a per-activity ordinal assigned client-side so the in-store
entry order survives out-of-order syncs.

## 2. Capture page

Route: `/expenses/[id]`. Designed for one-handed phone use; works identically
with a keyboard on desktop.

### Layout

- **Sticky header** (below the app title bar): type name + optional title on
  the left; the running total right-aligned, large, `var(--font-mono)`.
  When the sync queue is non-empty, a quiet pill shows "2 unsynced"; if a
  retry cycle is failing it reads "Could not sync — retrying".
- **Item list** fills the middle, newest at the bottom, auto-scrolled into
  view on add. Each row: name left, amount right (mono). Tapping a row
  expands it to an inline editor (name + price inputs, save and delete
  buttons).
- **Composer pinned to the bottom** (thumb reach), two inputs and an add
  button:
  - *Name input* — `enterKeyHint="next"`. Enter (or the mobile keyboard's
    next key) moves focus to the price input. Empty name + Enter does
    nothing.
  - *Price input* — `inputmode="decimal"`, `enterKeyHint="done"`, mono font.
    Enter adds the item, clears both inputs, refocuses the name input.
    Accepts `123`, `123.5`, `123.45`; parsed to centavos with a pure helper
    (`parsePesoInput`), rejecting more than two decimals or non-numeric
    input with an inline shake-free error (border to `var(--danger)`).
  - The add button is the touch-only fallback for the same submit.

### Optimistic sync queue

A small client module (`lib/syncQueue.ts`) owned by the capture page:

1. On add/edit/delete, apply to local React state immediately (total
   updates instantly) and enqueue an operation
   (`PUT /activities/:id/items/:itemId` or `DELETE` of the same path).
2. The queue drains serially; on network failure it backs off
   (1s, 2s, 4s, capped at 30s) and also flushes on `online` and
   `visibilitychange` events.
3. The queue (not the whole item list) is mirrored to
   `localStorage["expenses:queue:<activityId>"]` and restored on mount, so
   a refresh inside a dead zone replays unsynced operations.
4. `PUT` is an upsert keyed on the client id — replays and retries are
   harmless. `DELETE` of an already-deleted item returns success.
5. On page load, server state is fetched and pending queue operations are
   replayed on top of it.

### Starting an activity

`/expenses` shows one button per non-archived type, in `position` order.
Tapping one `POST`s the activity and routes straight into capture — two taps
total from the sidebar to typing the first item. An optional title can be
added later from the capture page header (tap the title area), never blocking
the start.

## 3. Index, trends, and types pages

The system layout carries a journal-style tab strip: **Activities · Trends ·
Types**.

### Activities (`/expenses`)

Start buttons on top (see above). Below, recent activities grouped by month:
each row shows type, title (if any), date, item count, and total (mono,
right-aligned). Tapping a row opens the capture page — capture and review are
the same surface. Row actions: delete activity (confirm dialog; cascades to
items). Empty state: `No activities yet.` / `Tap a type above to start one.`

### Trends (`/expenses/trends`)

- **Stat cards** (one per type that has data in the visible range): this
  month's total, last month's total, average per activity, activity count.
  Amounts in mono.
- **Chart**: Recharts grouped bar chart — X axis months, one bar series per
  type, monthly totals. Range toggle: 3 / 6 / 12 months (default 6).
  Re-themed with design tokens exactly as validated in the side-by-side
  sample: token paper/ink/border colors, JetBrains Mono ticks, paper-card
  tooltip, square legend swatches, 2px top radius bars. Series colors come
  from a small categorical palette added to `globals.css` as
  `--chart-1..--chart-6` (derived from accent, heading, link, success,
  warning, tag), with a comment explaining the addition: multi-series charts
  need more than the single accent.
- Aggregation is one service call: `getTrends(months)` returns
  `{ byMonth: [{ month, typeId, totalCentavos }], byType: [{ typeId, thisMonthCentavos, lastMonthCentavos, avgPerActivityCentavos, activityCount }] }`
  computed in SQL (`date_trunc('month', startedAt)` + joins), not in JS.
- Recharts ships as a normal dependency, wrapped in one client component
  (`components/TrendsChart.tsx`) so the library never leaks past it.

### Types (`/expenses/types`)

A settings list: rename inline, archive/unarchive, add new, reorder with
up/down controls (writes `position`). Archived types render in a collapsed
"Archived" section. Deleting is not offered — archive is the only removal,
because history references types forever.

## 4. API routes

Declared on the manifest per the platform convention; handlers in `routes/`,
Zod schemas in `schemas/`, Prisma calls in `services/`.

| Route | Purpose |
|---|---|
| `GET /types` | List types (`?archived=true` to include archived). |
| `POST /types` | Create type. |
| `PATCH /types/:id` | Rename, archive/unarchive, reposition. |
| `GET /activities` | Recent activities with item counts and totals; `?typeId=` filter, cursor pagination. |
| `POST /activities` | Start an activity (`typeId`, optional `title`). |
| `GET /activities/:id` | Activity with its items, for the capture page. |
| `PATCH /activities/:id` | Update `title` (and `typeId` for misfiled sessions). |
| `DELETE /activities/:id` | Delete activity (cascades to items). |
| `PUT /activities/:id/items/:itemId` | Idempotent upsert of an item (name, amountCentavos, position). |
| `DELETE /activities/:id/items/:itemId` | Delete item; deleting a missing item succeeds. |
| `GET /trends` | `?months=3\|6\|12` aggregates for the trends page. |

Validation errors use the shared `badRequest()` / `notFound()` helpers.
`PUT` rejects an `itemId` that exists under a *different* activity (conflict)
— client ids are scoped to their activity.

## 5. Module layout

```
src/systems/expenses/
  manifest.ts          # nav (label "Expenses", icon receipt, href /expenses), routes, palette block
  schemas/expenses.ts  # Zod: types, activities, items, trends query
  services/types.ts    # CRUD for ExpenseActivityType
  services/activities.ts
  services/items.ts    # idempotent upsert/delete
  services/trends.ts   # SQL aggregation
  routes/types.ts
  routes/activities.ts # includes nested item handlers
  routes/trends.ts
  lib/money.ts         # parsePesoInput, formatCentavos — pure, unit-tested
  lib/months.ts        # month bucketing/labels for trends — pure, unit-tested
  lib/syncQueue.ts     # client-side optimistic queue (storage, backoff, replay)
  components/StartButtons.tsx
  components/ActivityList.tsx
  components/CapturePage.tsx   # client component: header, list, composer
  components/ItemComposer.tsx  # the two-input Enter-flow composer
  components/ItemRow.tsx       # display + inline edit
  components/TrendsChart.tsx   # the only file that imports recharts
  components/StatCards.tsx
  components/TypesManager.tsx

src/app/(systems)/expenses/
  layout.tsx           # tab strip: Activities / Trends / Types
  page.tsx             # index
  [id]/page.tsx        # capture
  trends/page.tsx
  types/page.tsx
```

The `receipt` icon is added to `Icon.tsx`'s `PATHS` map from
`public/icons/receipt.svg` (Lucide source). The manifest is registered in
`src/systems/index.ts`.

## 6. Testing

Following the journal's split:

- **Unit (Vitest, node):** `lib/money.ts` (peso parsing edge cases: `"0"`,
  `"12.5"`, `"12.345"` rejected, comma input, empty), `lib/months.ts`
  (bucket boundaries, year wrap), `lib/syncQueue.ts` (enqueue/drain/backoff
  with mocked fetch and storage, replay after restore).
- **Integration (Vitest + test DB):** services (type CRUD + archive
  semantics, activity totals, item upsert idempotency — same `PUT` twice,
  `PUT` after `DELETE`, cross-activity conflict — and trends aggregation
  against seeded fixtures), plus route handlers (Zod rejection paths,
  cascade delete) using a `withCleanExpenseTables()` helper modeled on the
  journal's.
- **Manual:** the capture flow on an actual phone against the dev server —
  Enter-flow, keypad, dead-zone behavior (airplane mode mid-session).

## 7. Risks and notes

- **Recharts vs React 19 / Next 16:** pin a current recharts 2.x; the chart
  is isolated in one client component, so a future library swap (or a
  return to custom SVG) touches one file.
- **Clock skew / month boundaries:** `startedAt` is server-assigned at
  activity creation; trends bucket on the server in one timezone
  (`Asia/Manila` — hardcoded constant in `services/trends.ts` with a
  comment, since Polaris is single-user).
- **The deploy dependency is real:** until the Vercel/Neon deploy ships,
  in-store capture only works via LAN access to the dev machine. Not a
  blocker for building, but the feature's purpose lands with the deploy.
