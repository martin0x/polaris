# Habit tracker polish + log flyout — design

**Date:** 2026-07-27
**Status:** Approved
**Builds on:** `docs/superpowers/specs/2026-07-23-habit-tracker-design.md` (the shipped habit tracker). This spec covers six follow-up changes; everything not mentioned here keeps its shipped behavior.

## Decisions

| Question | Decision |
|---|---|
| Past-day diamond click — log date | Backdate the journal entry to that calendar day (noon `POLARIS_TZ`); today's diamond uses the real current timestamp |
| Diamond on a day that already has logs | Same flyout: that day's logs listed above the compose form — one interaction for every diamond |
| Flyout compose fields | Optional title + markdown body, mirroring journal entries (`#tags` in the body still work) |
| Add-habit form placement | Inline — the centered button swaps to the form in place, no overlay |
| Where log creation lives | New habits route wrapping the journal service (service-layer coupling, like topics). Backdating stays an internal journal-service capability (`createdAt` override on `createEntry`), not a public journal API feature |

## 1. Instant dropdown refresh after a tick

Today `handleTick` deletes every cached detail for the ticked habit; the expanded
dropdown falls back to "Loading…" and nothing refetches until the next
`pointerenter`. New behavior — **stale-while-revalidate**:

- On tick, cached details for that habit in *other* weeks are still deleted.
- If the ticked habit's row is currently expanded, its detail for the current
  week is **kept visible** (stale) and a forced refetch fires immediately;
  the fresh detail replaces it when it lands. No "Loading…" flash.
- `prefetchDetail` gains a `force` option that skips the cache short-circuit.
- If the forced refetch fails, the stale detail stays (the mini calendar may
  lag one tick until the next hover retry) — no error banner for this
  background refresh.

## 2. Date numbers under day letters + today highlight

The week header's day cell becomes a stacked pair:

- Row 1: the day letter (M T W T F S S), unchanged.
- Row 2: the day-of-month number (e.g. `27`), `var(--font-mono)` at
  `var(--fs-xs)`, `var(--fg-muted)`.
- Today's column: letter **and** number in `var(--accent)`; the existing
  `.is-today` tint on the tick-cell column stays.

The number comes from the same `dates` array the grid already renders from —
no new data.

## 3. Serif habit names

`.habit-name-text` switches to the heading face:

- `font-family: var(--font-serif)` (Fraunces), `font-size: var(--fs-md)`,
  `font-weight: 500`.
- Row height must not change; the rename input keeps the sans face (it's a
  form control, not a heading).

## 4. New add-habit flow

`AddHabitRow` is replaced by an inline two-state component:

- **Collapsed:** a single centered ghost button — `+ Add habit`
  (`.btn.btn-ghost`, centered under the grid).
- **Expanded (in place):** a small form —
  - Name input (autofocused, placeholder "Habit name", required)
  - Quote textarea (optional, placeholder "Quote, goal, or tip (optional)")
  - Buttons: **Add habit** (`.btn.btn-primary`) and **Cancel** (`.btn.btn-ghost`)
  - Enter in the name field submits; Escape anywhere cancels and collapses.
- Submit success: form clears and collapses back to the button; the list
  refreshes (existing `refresh()` path). Failure: existing error banner,
  form stays open with the values intact.
- `?new=1` opens the page with the form already expanded and focused.

**API change:** `createHabitSchema` accepts optional `quote`
(trimmed, ≤500 chars — same rule as `updateHabitSchema`); empty string is
treated as absent. `createHabit` service sets it on the new row.

## 5. Menu at the end of the row

- Grid template for header, habit rows, and the dropdown's diamond strip
  changes from `minmax(160px, 1fr) repeat(7, 44px)` to
  `minmax(160px, 1fr) repeat(7, 44px) 28px`.
- The triple-dot `RowMenu` moves from inside `.habit-name` to the new
  trailing cell. Hover/focus reveal behavior, the `details`/`summary`
  mechanics, and the touch-device always-visible rule are unchanged.
- Header row and diamond strip render an empty trailing spacer so columns
  stay aligned. The menu list now right-aligns to the row edge (anchor
  right, not left).

## 6. Per-day diamonds + journal log flyout

### Diamonds (in the expanded row, topic state `ok` only)

- Exactly **one diamond per day column**, aligned under each tick circle.
  Archived/missing topic states keep their current note rows instead.
- States:
  - **No logs:** outline diamond, `var(--fg-faint)`.
  - **Has logs:** `var(--link)` colored; tooltip = first log's title/excerpt,
    plus "+N more" when several.
  - **Future day:** cell renders empty (no diamond).
  - Days before the habit's `createdOn` still get a diamond — ticks allow
    backdating to any past day, and logs follow the same rule.
- Every rendered diamond is a button that opens the flyout for
  `(habit, date)` — including days that already have logs.

### Flyout panel (new reusable primitive)

- New `.flyout` primitive in `globals.css`: fixed to the right edge below
  the title bar, ~380px wide, full height, `var(--paper-1)` surface,
  `border-left: 1px solid var(--border)`, `var(--shadow-lg)`; slides in with
  a transform transition on motion tokens; `prefers-reduced-motion` disables
  the slide. No scrim — the page stays interactive-looking but clicks
  outside close the panel.
- Habits component `LogFlyout.tsx` uses it:
  - **Header:** habit name (serif) + the day, e.g. "Morning run — Jul 22"
    (`formatDayShort`-style, mono date). Close button (× icon).
  - **Existing logs:** that day's entries (from the already-fetched detail:
    `entries` grouped by local day), each showing title/excerpt and
    deep-linking to the journal entry.
  - **Compose:** optional title input (≤200, mirroring journal), markdown
    body textarea (required), footer **Add log** (`.btn.btn-primary`).
  - **Keyboard/a11y:** `role="dialog"` with an `aria-label`; focus moves to
    the first field on open and returns to the triggering diamond on close;
    Escape closes.
- Only one flyout at a time; clicking another diamond retargets it.

### Saving

- `POST /api/systems/habits/habits/:id/logs` with
  `{ date, title?, body }` (`dateStringSchema` date; title trimmed ≤200
  optional; body min 1).
- Habits service `createLog(habitId, date, input)`:
  - Unknown habit → 404.
  - `date > todayString()` → `FutureDateError` → 400
    ("Logs can't be written for future days.").
  - Topic archived → 409 ("Journal topic is archived — unarchive it to keep
    logging."). Topic missing → 409 ("Journal topic is missing — recreate it
    from the tracker.").
  - Otherwise calls journal `createEntry` with the habit's `topicId` and a
    `createdAt` override: **now** if `date === todayString()`, else
    **noon in `POLARIS_TZ` on that date** (new `lib/dates.ts` helper
    `noonInTz(date, tz)` — noon keeps the entry on the intended calendar day
    for any viewer timezone within ±12h). Returns 201 `{ entry }`.
- **Journal service change:** `CreateEntryInput` gains optional
  `createdAt?: Date`, passed through to Prisma. The journal's public API
  schema (`createEntrySchema`) is unchanged — backdating is reachable only
  through service-layer callers.
- Client: on success the flyout closes, the habit's detail force-refetches
  (same path as §1), the diamond fills in. On failure the flyout stays open
  with an inline error line ("Could not save the log. Check your
  connection." or the server's message).

## Out of scope

- Editing or deleting logs from the flyout (the journal already does both).
- Backdating in the journal's own UI or public API.
- Any change to tick semantics, sounds, charts, dashboard, or palette.

## Testing

- **Unit:** `noonInTz` (returns a `Date` that formats back to the input
  day in the target tz; edge tz like UTC−11/+13 sanity); add-habit schema
  accepts/normalizes `quote`; logs schema rejects bad dates/empty body.
- **Integration (route level):** create log today (createdAt ≈ now, entry
  under the habit's topic, tags extracted); create backdated log (createdAt
  lands on the requested day in `POLARIS_TZ`); future date → 400; archived
  topic → 409; missing topic → 409; unknown habit → 404; `POST /habits`
  with quote persists it.
- **Existing suites** (detail service day-grouping, tick flows) must stay
  green; §1 and §5 are client-only changes verified by the screenshot
  harness during implementation.
