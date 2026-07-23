# Habit Tracker — design spec

**Date:** 2026-07-23
**Status:** approved design, pre-implementation
**Source:** `.superpowers/sdd/featdoc/HabitTracker.md` + clarification rounds

## Overview

A new **Habits** system for Polaris: a weekly tick-circle tracker with a
three-state tick model (off / partial / complete), an expandable per-habit
dropdown (quote, 30-day mini calendar, AI-summary placeholder), a Charts tab
with research-backed metrics, and a two-way tie to the Journal system (every
habit owns an auto-created Journal topic; Journal logs surface as diamond
markers under the tracker days).

## Decisions locked during clarification

| Question | Decision |
|---|---|
| Scheduling | Every habit is daily — all 7 circles live. Scheduled days / weekly targets are future work. |
| Week start | Monday (ISO). |
| Habit operations | Add, rename, reorder (menu move up/down), archive. No hard delete — mirrors Journal's archive convention. |
| AI summary | Placeholder panel this build; Claude wiring is a later increment. |
| Topic naming/lifecycle | Topic named exactly after the habit; rename and archive/unarchive sync habit → topic. Habit stores the topic id. |
| Diamonds | One diamond per Journal entry, aligned under the day column it was written; hover = title tooltip, click = deep link. |
| Quote | Per-habit free text, edited in place in the dropdown. |
| Sounds | Web Audio engine ships now with synthesized placeholders; user's files drop into `public/sounds/` later. |
| Chart modules | Consistency trend, streaks & recovery, day-of-week heatmap, 90-day calendar heatmap. |
| Partial credit | Partial = 0.5 in rate math; any tick (partial or complete) keeps a streak alive. |
| Architecture | Client island + in-memory week cache + prefetch + optimistic ticks. Server renders the initial week. |

## System shape and registration

- Module: `src/systems/habits/` — `manifest.ts`, `routes/`, `schemas/`,
  `services/`, `lib/`, `components/`, `dashboard.tsx`, `palette.ts`
  (copy `_template/`).
- Pages: `src/app/(systems)/habits/` — `layout.tsx` (TabStrip: **Tracker**
  `/habits`, **Charts** `/habits/charts`), `page.tsx`, `charts/page.tsx`.
- Register the manifest in `src/systems/index.ts` and the dashboard in
  `src/systems/dashboards.ts`.
- Nav icon: Lucide `repeat`. Add `repeat` and `diamond` SVGs to
  `public/icons/`, their paths to `Icon.tsx` `PATHS`, and `repeat` to the
  `ALLOWED_ICONS` arrays in **both** group layouts
  (`src/app/(systems)/layout.tsx`, `src/app/(platform)/layout.tsx`).
- Dashboard widget: summary "N of M habits ticked today"; widget lists habits
  with today's tick state, links to `/habits`.
- Palette: navigation entries for Tracker and Charts, plus "Add habit"
  (routes to `/habits?new=1`, which autofocuses the add-habit row).

## Data model (Prisma)

```prisma
enum HabitTickStatus {
  PARTIAL
  COMPLETE
}

model Habit {
  id             String     @id @default(cuid())
  name           String     @unique
  quote          String?    @db.Text
  position       Int
  journalTopicId String?    @unique   // plain string — no cross-system FK, per convention
  archived       Boolean    @default(false)
  archivedAt     DateTime?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  ticks          HabitTick[]
  @@index([archived])
  @@map("habits")
}

model HabitTick {
  id        String          @id @default(cuid())
  habitId   String
  habit     Habit           @relation(fields: [habitId], references: [id])
  date      DateTime        @db.Date
  status    HabitTickStatus
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  @@unique([habitId, date])
  @@index([date])
  @@map("habit_ticks")
}
```

- **Off = no row.** Toggling off deletes the tick row. A tick is a toggle,
  not content — the soft-delete convention doesn't apply.
- **Date discipline:** dates cross the API as strict `yyyy-mm-dd` strings
  (Zod `/^\d{4}-\d{2}-\d{2}$/`), converted to `Date` via
  `new Date(s + "T00:00:00Z")`, and formatted back with UTC getters. The
  client derives "today" and day grouping from local time.
- **Server-side "today":** wherever the server needs the local calendar day
  (future-date validation, `last30` windows, charts, the dashboard widget),
  it derives it via `Intl.DateTimeFormat` from the `POLARIS_TZ` env var
  (IANA name, default `Asia/Manila`) — a new habits `lib/dates.ts` helper.
  Single-user platform, so one timezone anchor is correct.
- No `userId` — matches the single-user (allowlist-gated) convention.

## API surface (manifest-routed, Zod-validated)

| Route | Behavior |
|---|---|
| `GET /week?start=yyyy-mm-dd` | Normalizes `start` to its ISO-week Monday. Returns unarchived habits ordered by `position` (id, name, quote, position, journalTopicId, createdAt), all ticks in that week, and `archivedHabits: [{id, name}]` for the unarchive disclosure. |
| `POST /habits {name}` | Links or creates the Journal topic (see cross-system section), then creates the habit with `position = max + 1`. 409 if a habit with that name exists. |
| `PATCH /habits/:id {name? quote?}` | Rename syncs the topic first (collision → 409, nothing changes). Quote max 500 chars, empty string clears. |
| `PATCH /habits/reorder {ids}` | Ordered list containing every unarchived habit id exactly once; rewrites positions. 400 otherwise. |
| `POST /habits/:id/archive` | Sets `archived` + `archivedAt`; archives the topic if it exists (idempotent, best-effort if missing). |
| `POST /habits/:id/unarchive` | Reverse of archive, including the topic. |
| `PUT /habits/:id/ticks/:date {status}` | Upsert. Rejects dates after today per `POLARIS_TZ`. |
| `DELETE /habits/:id/ticks/:date` | Removes the row; 204 even if absent. |
| `GET /habits/:id/detail?week=yyyy-mm-dd` | `{ last30, entries, topicState, topicName, summary: null }`. `last30` = ticks for the 30 days ending today (`POLARIS_TZ`). `entries` = the topic's non-deleted Journal entries whose `createdAt` falls in the requested week padded by one day on each side (UTC) — the client groups them into local days, and the padding keeps edge entries from dropping. Shape: `{id, title, excerpt, createdAt}`; `title` may be null, `excerpt` is the first ~60 chars of the body for the tooltip fallback. `topicState` = `ok \| archived \| missing`. |
| `POST /habits/:id/recreate-topic` | For `topicState = missing`: creates a fresh topic named after the habit (or links an existing exact-name match) and stores its id. |

Errors follow house copy: name the failure, name the recovery, never
apologize.

## Tracker UI

**Layout.** A `.paper-card` table. Left column: habit name (sans), chevron
to expand, `⋯` row menu. Right: 7 tick circles under Mon–Sun initial
headers, today's column subtly marked (e.g. `--bg-hover` column wash).
Header row: `‹` and `›` icon buttons flanking a mono week range —
`Jul 20–26, 2026`, cross-month `Jun 29 – Jul 5, 2026` (en dash). Clicking
the range opens a custom month-grid popover (Monday-start, month arrows,
today outlined); clicking any day jumps to that day's week. Below the last
habit row: the add-habit row (ghost input, Enter creates). Empty state:
`No habits yet.` / `Add one below to start tracking.` If archived habits
exist, a quiet `N archived` disclosure under the card lists them with
per-habit unarchive buttons.

**Tick circle states** (custom inline SVG, ~22px, not Lucide):

- **off** — 1px ring in `--border-strong`; hover deepens ring + `--bg-hover`.
- **partial** — bottom half-disc in `--success` inside the ring.
- **complete** — full `--success` disc with a paper-colored check.
- **disabled (future)** — faint ring, no pointer.

**Pointer semantics.**

- Click (pointerup < 450ms): off → partial; partial → off; complete → off.
- Press-and-hold ≥ 450ms: ring fills as a radial progress affordance during
  the hold; at threshold the tick becomes **complete** immediately (while
  still pressed). Hold on an already-complete tick does nothing. Pointer
  leaving the circle cancels the hold.
- Works for mouse and touch (pointer events). Keyboard: circles are
  focusable; Space/Enter cycles off → partial → complete → off.

**Optimistic updates.** Every tick applies to the cache instantly (sound +
animation fire at the interaction), request goes out in the background; on
failure the tick reverts and an inline line under the grid reads
`Could not save that tick — reverted. Check your connection.`

**Latency plan.** Server component fetches the current week and renders the
island with initial data. The island keeps a `Map<mondayISO, WeekData>`;
after mount it prefetches ±1 week, and re-prefetches neighbors on every
navigation. Row detail (`/detail`) prefetches on first `pointerenter` of a
row and is cached; expanding an unfetched row shows a brief skeleton.
Ticks made in one week view patch every cached structure they affect.

**Row menu (`⋯`).** Rename (inline edit of the name cell), move up / move
down, archive. Sentence case, no icons-only items.

**Expanded dropdown.** Slides open under the row (`--dur-med`,
`--ease-out`):

1. **Diamond strip** — aligned to the 7 day columns; one 14px Lucide
   `diamond` in `--link` per Journal entry written that local day (stacked
   horizontally if several); hover shows the entry title (or excerpt) in a
   tooltip; click navigates to
   `/journal/topics/{encodeURIComponent(name)}#entry-{id}`.
2. **Three sections in a row** (stack on narrow widths):
   - **Quote** — Fraunces italic blockquote; click to edit in a plain
     textarea, saves on blur or Enter (Shift+Enter for a newline). Empty:
     `Add a quote, goal, or tip.`
   - **Past 30 days** — mini calendar grid (Monday columns), dots colored
     by status (`--success` full/half, faint ring for missed, blank before
     habit creation).
   - **Summary** — placeholder panel. Empty state: `No summary yet.` /
     `Summaries will read your journal logs in a coming increment.`
     The detail payload already reserves `summary` for the follow-up.

## Cross-system: Journal integration

- **Create:** `POST /habits` calls the Journal service layer directly
  (`createTopic` from `src/systems/journal/services/topics.ts` — same
  process, no HTTP hop). If a topic with the exact name exists, the habit
  links to it instead of failing. The returned topic id is stored on the
  habit.
- **Rename:** topic rename runs first; on unique-name collision the whole
  operation returns 409 — `A journal topic named "X" already exists — habit
  not renamed.`
- **Archive/unarchive:** habit action drives the same action on the topic.
  Missing topic never blocks the habit action.
- **Degraded states** (shown in the dropdown, diamonds hidden):
  - Topic archived from the Journal side: `Journal topic is archived —
    unarchive it to keep logging.` + link to the topic page.
  - Topic id unresolvable: `Journal topic is missing.` + **Recreate topic**
    button (`POST /habits/:id/recreate-topic`).
- Deleted (soft-deleted) entries drop out of the diamond strip naturally —
  every entry query filters `deletedAt: null`.

## Sounds

- `lib/sounds.ts`: a singleton `AudioContext` created on the first
  pointerdown inside the tracker (autoplay policy), which then fetches and
  decodes three buffers; playback is a `BufferSource` started synchronously
  in the interaction handler (gain ≈ 0.3).
- Slots: **partial** = short click, **complete** = Switch-style click-pop,
  **off** = brief swoosh.
- Ships with placeholders synthesized in code (oscillator/noise envelopes —
  zero assets). At load, the engine tries
  `public/sounds/{partial,complete,off}.ogg` first and falls back to the
  synthesized buffers per-slot on 404.
- **Handoff advice for the real files:** mono WAV or FLAC masters, ≤ 0.4 s,
  44.1 kHz, leading silence trimmed (the trim is what makes it feel
  instant). They'll be transcoded to ~48 kbps OGG (a few KB each); decoding
  happens once at load, so compression never affects click latency.

## Animation

CSS keyframes in `globals.css` using existing tokens, inside the
`prefers-reduced-motion` gate:

- Partial: quick scale pulse (`--dur-fast`, `--ease-out`).
- Complete: `--success` ring-burst + slight `--ease-spring` scale.
- Off: shrink-fade (`--dur-fast`).
- Hold affordance: radial ring fill over 450ms (SVG stroke-dashoffset).

## Charts tab

`/habits/charts` is a server component calling `services/charts.ts`
directly, passing computed data to client components. Recharts for bars
(mirroring `src/systems/expenses/components/TrendsChart.tsx` conventions:
`--chart-*` series colors, themed axes/tooltips); CSS grids for heatmaps.
Credit function: complete = 1, partial = 0.5, off = 0.

1. **Consistency trend** — last 12 weeks, one stacked bar per week whose
   total height is the weekly completion rate
   (`total credits ÷ (7 × eligible habits)`), split into the share earned
   by complete ticks vs partial ticks. A habit is eligible for a week only
   if it existed before the week ended and wasn't archived before the week
   started.
2. **Streaks & recovery** — per-habit stat tiles: current streak
   (consecutive ticked days ending today; an unticked today doesn't break
   it until tomorrow), longest streak, and lapse count over the last 90
   days (a lapse = a run of ≥ 2 consecutive missed days within the habit's
   existence window). One-line caption noting a single missed day doesn't
   break habit formation — two in a row is the signal.
3. **Day-of-week patterns** — habit × weekday grid, mean credit over the
   last 90 days, 5-step intensity from `--paper-2` toward `--success`.
4. **90-day calendar heatmap** — 13 week columns × 7 rows (Monday top),
   day intensity = sum of credits ÷ habits existing that day.

Empty state (no ticks yet): `Nothing to chart yet.` / `Tick a few days on
the tracker first.`

## Testing

Follows the repo's vitest split:

- **Unit** (`*.test.ts`): `lib/weeks.test.ts` (ISO-Monday normalization,
  week ranges, month grid, date-string round-trips), `lib/streaks.test.ts`
  (streaks, lapses, half-credit rates, eligibility windows), sound-slot
  fallback selection.
- **Integration** (`*.integration.test.ts`, real DB): habit CRUD services
  including topic create/link/rename-collision/archive sync and
  recreate-topic; tick upsert/delete and future-date rejection; routes
  through the dispatcher like `journal/routes/*.integration.test.ts`.

## Out of scope (explicit future increments)

- AI summaries (Claude API over the habit's Journal entries) — panel and
  payload slot are reserved.
- Real sound files (drop-in replacement in `public/sounds/`).
- Drag-and-drop reordering (menu move up/down ships first).
- Scheduled days / weekly target counts.
- Multi-user scoping (whole codebase is single-user by design).
